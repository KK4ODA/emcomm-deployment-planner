import { supabase } from './supabaseClient';
import { queryClientInstance } from '@/lib/query-client';
import { offlineStorage, STORES } from '@/lib/offline/storage';
import { applyTaskEvent, TASKS_UPDATED_EVENT, OUTBOX_CHANGED_EVENT } from './taskEvents';
import { drainIntents, listIntents, discardIntent } from './assignmentIntents';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─── Tier management ──────────────────────────────────────────────────────────

/** @type {'ONLINE'|'OFFLINE'} */
let _tier = 'OFFLINE';
const _tierListeners = new Set();

export function getTier() { return _tier; }

export function onTierChange(fn) {
  _tierListeners.add(fn);
  return () => _tierListeners.delete(fn);
}

/** @param {'ONLINE'|'OFFLINE'} tier */
function setTier(tier) {
  if (tier === _tier) return;
  _tier = tier;
  _tierListeners.forEach(fn => fn(tier));
}

// Phase 1: ONLINE / OFFLINE only. LAN_ONLY and BBS_ONLY come in Phase 2.
async function detectTier() {
  if (!navigator.onLine) {
    setTier('OFFLINE');
    return 'OFFLINE';
  }
  try {
    // /auth/v1/health returns 200 OK without auth — quieter than /rest/v1/
    // which 401s without a JWT and clutters the DevTools console.
    await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    // Any response means the server is reachable
    setTier('ONLINE');
    return 'ONLINE';
  } catch {
    setTier('OFFLINE');
    return 'OFFLINE';
  }
}

// ─── Outbox size (for the UI) ────────────────────────────────────────────────

let _pending = 0;
let _failed = 0;
const _pendingListeners = new Set();

export function getPendingCount() { return _pending; }
/** Queued changes the server rejected for good (dead letters), task events and intents together. */
export function getFailedCount() { return _failed; }

/** Listener receives (pending, failed). */
export function onPendingChange(fn) {
  _pendingListeners.add(fn);
  return () => _pendingListeners.delete(fn);
}

export async function refreshPendingCount() {
  try {
    const outbox = await offlineStorage.getAllEntities('outbox');
    const intents = await listIntents();
    const pending = outbox.filter(e => !e._error).length + intents.filter(i => !i.error).length;
    const failed = outbox.filter(e => e._error).length + intents.filter(i => i.error).length;
    if (pending !== _pending || failed !== _failed) {
      _pending = pending;
      _failed = failed;
      _pendingListeners.forEach(fn => fn(_pending, _failed));
    }
  } catch { /* storage unavailable */ }
  return _pending;
}

// ─── Dead letters ─────────────────────────────────────────────────────────────
// Postgres/PostgREST codes that will not succeed on retry: permission,
// constraint, malformed payload, missing function. Anything else (network,
// 5xx, timeouts) is transient and keeps the entry queued.
const PERMANENT_EVENT_CODES = new Set(['42501', '23503', '23505', '23514', '22P02', '22023', 'PGRST202', 'PGRST204', 'PGRST301']);

export function isPermanentError(error) {
  if (!error) return false;
  if (error.code && PERMANENT_EVENT_CODES.has(String(error.code))) return true;
  const status = Number(error.status ?? error.statusCode);
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** Rejected task events and intents, oldest first, in one shape for the UI. */
export async function listDeadLetters() {
  const outbox = await offlineStorage.getAllEntities('outbox');
  const intents = await listIntents();
  return [
    ...outbox.filter(e => e._error).map(e => ({ id: e.id, kind: 'task', summary: `${e.op} task${e.patch?.name ? ` “${e.patch.name}”` : ''}`, error: e._error, at: e._queued_at ?? null })),
    ...intents.filter(i => i.error).map(i => ({ id: i.id, kind: 'assignment', summary: `${String(i.status).replace('_', ' ')} (assignment)`, error: i.error, at: i.queued_at ?? null })),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

export async function discardDeadLetter(letter) {
  if (letter.kind === 'task') await offlineStorage.deleteEntity('outbox', letter.id);
  else await discardIntent(letter.id);
  await refreshPendingCount();
}

/** Put a rejected entry back in the queue (after the cause was fixed, e.g. a role granted). */
export async function retryDeadLetter(letter) {
  if (letter.kind === 'task') {
    const entry = await offlineStorage.getEntity('outbox', letter.id);
    if (entry) { const { _error, ...rest } = entry; await offlineStorage.saveEntity('outbox', rest); }
  } else {
    const intent = await offlineStorage.getEntity(STORES.intents, letter.id);
    if (intent) await offlineStorage.saveEntity(STORES.intents, { ...intent, error: null });
  }
  await refreshPendingCount();
  return syncNow();
}

// ─── Sync state helpers ───────────────────────────────────────────────────────

async function getSyncState() {
  return offlineStorage.getEntity('sync_state', 'supabase');
}

async function saveSyncState(update) {
  const current = await getSyncState();
  await offlineStorage.saveEntity('sync_state', { peer: 'supabase', ...current, ...update });
}

// ─── First-run seeding ────────────────────────────────────────────────────────
// Pre-event tasks were written directly to the tasks table, not via events.
// On first run we seed entities.tasks from the tasks table, then switch to
// event-based updates going forward.

async function ensureSeeded() {
  const state = await getSyncState();
  if (state?.seeded) return;

  const { data: tasks, error } = await supabase.from('tasks').select('*');
  if (error) throw error;

  for (const task of tasks ?? []) {
    await offlineStorage.saveEntity('entities.tasks', task);
  }

  await saveSyncState({ seeded: true });
}

// ─── Outbox drain ─────────────────────────────────────────────────────────────

/**
 * Send queued task events in ULID order. A permanent rejection marks the
 * entry with `_error` (dead letter, shown to the user, not retried); a
 * transient failure stops the drain so order is preserved and the next cycle
 * tries again.
 * @returns {Promise<{ sent: number, failed: number, remaining: number }>}
 */
export async function drainOutbox() {
  const outbox = (await offlineStorage.getAllEntities('outbox')).filter(e => !e._error);
  let sent = 0, failed = 0;
  if (!outbox.length) { await refreshPendingCount(); return { sent, failed, remaining: 0 }; }

  const sorted = [...outbox].sort((a, b) => a.id.localeCompare(b.id));
  for (const entry of sorted) {
    const { _queued_at, _error, ...event } = entry;
    let error;
    try {
      ({ error } = await supabase.from('events').insert(event));
    } catch (err) {
      error = err;
    }
    if (!error) {
      await offlineStorage.deleteEntity('outbox', event.id);
      sent += 1;
    } else if (isPermanentError(error)) {
      console.warn('Outbox drain: event rejected for good', event.id, error.message);
      await offlineStorage.saveEntity('outbox', { ...entry, _error: error.message || 'Rejected by the server' });
      failed += 1;
    } else {
      console.warn('Outbox drain: transient failure, will retry', event.id, error.message);
      break;
    }
  }
  await refreshPendingCount();
  const remaining = (await offlineStorage.getAllEntities('outbox')).filter(e => !e._error).length;
  return { sent, failed, remaining };
}

// ─── Inbox fetch ──────────────────────────────────────────────────────────────

export async function fetchAndApplyInbox() {
  const state = await getSyncState();
  const hwm = state?.hwm ?? null;

  let query = supabase
    .from('events')
    .select('*')
    .eq('entity', 'task')
    .order('id', { ascending: true });

  if (hwm) query = query.gt('id', hwm);

  const { data: events, error } = await query;
  if (error) throw error;
  if (!events?.length) return;

  let newHwm = hwm;
  for (const event of events) {
    const existing = await offlineStorage.getEntity('events', event.id);
    if (existing) {
      // We already applied this locally; just advance the HWM
      newHwm = event.id;
      continue;
    }
    await offlineStorage.saveEntity('events', event);
    await applyTaskEvent(event);
    newHwm = event.id;
  }

  if (newHwm !== hwm) {
    await saveSyncState({ hwm: newHwm });
    notifyTasksUpdated();
  }
}

// ─── Notification helpers ─────────────────────────────────────────────────────

function notifyTasksUpdated() {
  window.dispatchEvent(new CustomEvent(TASKS_UPDATED_EVENT));
  queryClientInstance.invalidateQueries({ queryKey: ['tasks'] });
}

// ─── Realtime subscription ────────────────────────────────────────────────────

function subscribeRealtime() {
  supabase
    .channel('emcomm-task-events')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'events',
    }, async (payload) => {
      const event = payload.new;
      if (event.entity !== 'task') return;

      const existing = await offlineStorage.getEntity('events', event.id);
      if (existing) return; // Already applied locally (we sent it)

      await offlineStorage.saveEntity('events', event);
      await applyTaskEvent(event);

      const state = await getSyncState();
      if (!state?.hwm || event.id > state.hwm) {
        await saveSyncState({ hwm: event.id });
      }

      notifyTasksUpdated();
    })
    .subscribe();
}

// ─── Public sync API ──────────────────────────────────────────────────────────

export async function syncNow() {
  try {
    await refreshPendingCount();
    const tier = await detectTier();
    if (tier !== 'ONLINE') return;

    await ensureSeeded();
    const drainedEvents = await drainOutbox();
    if (drainedEvents.sent) notifyTasksUpdated();
    const drained = await drainIntents();
    if (drained.sent) queryClientInstance.invalidateQueries({ queryKey: ['assignments'] });
    await refreshPendingCount();
    await fetchAndApplyInbox();
  } catch (err) {
    console.error('Sync error:', err);
  }
}

let _initialized = false;

export async function initSyncEngine() {
  if (_initialized) return;
  _initialized = true;

  // Initial sync on startup
  await syncNow();

  // Re-sync immediately when coming back online
  window.addEventListener('online', syncNow);
  window.addEventListener(OUTBOX_CHANGED_EVENT, refreshPendingCount);

  // Flip tier immediately when the browser detects offline (avoids the
  // up-to-30s probe lag on a real network drop). DevTools throttle doesn't
  // always flip navigator.onLine, but this helps for true offline (airplane
  // mode, lost wifi, etc.).
  window.addEventListener('offline', () => setTier('OFFLINE'));

  // Every 30 s: probe tier if degraded, or pull fresh events if ONLINE
  setInterval(async () => {
    if (_tier !== 'ONLINE') {
      await detectTier();
    } else {
      try { await fetchAndApplyInbox(); } catch (e) { console.warn('Periodic fetch failed:', e); }
    }
  }, 30_000);

  // Subscribe for real-time push from other clients
  subscribeRealtime();
}
