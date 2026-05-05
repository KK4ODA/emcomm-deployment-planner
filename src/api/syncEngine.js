import { supabase } from './supabaseClient';
import { queryClientInstance } from '@/lib/query-client';
import { offlineStorage } from '@/components/offline/storage';
import { applyTaskEvent } from './taskEvents';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─── Tier management ──────────────────────────────────────────────────────────

let _tier = 'OFFLINE';
const _tierListeners = new Set();

export function getTier() { return _tier; }

export function onTierChange(fn) {
  _tierListeners.add(fn);
  return () => _tierListeners.delete(fn);
}

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
    await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    // Any response (even 4xx) means the server is reachable
    setTier('ONLINE');
    return 'ONLINE';
  } catch (_) {
    setTier('OFFLINE');
    return 'OFFLINE';
  }
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

async function drainOutbox() {
  const outbox = await offlineStorage.getAllEntities('outbox');
  if (!outbox.length) return;

  // Apply in ULID order (ascending time)
  const sorted = [...outbox].sort((a, b) => a.id.localeCompare(b.id));

  for (const entry of sorted) {
    const { _queued_at, ...event } = entry;
    const { error } = await supabase.from('events').insert(event);
    if (!error) {
      await offlineStorage.deleteEntity('outbox', event.id);
    } else {
      console.warn('Outbox drain: Supabase rejected event', event.id, error.message);
    }
  }
}

// ─── Inbox fetch ──────────────────────────────────────────────────────────────

async function fetchAndApplyInbox() {
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
  window.dispatchEvent(new CustomEvent('emcomm:tasks-updated'));
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
    const tier = await detectTier();
    if (tier !== 'ONLINE') return;

    await ensureSeeded();
    await drainOutbox();
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
