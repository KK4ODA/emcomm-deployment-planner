import { supabase } from './supabaseClient';
import { offlineStorage } from '@/components/offline/storage';

// ─── ULID ─────────────────────────────────────────────────────────────────────
// Crockford base-32 alphabet (no I, L, O, U to avoid ambiguity)
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(t, len) {
  let s = '';
  for (let i = len - 1; i >= 0; i--) {
    s = B32[t % 32] + s;
    t = Math.floor(t / 32);
  }
  return s;
}

function encodeRandom(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => B32[b % 32]).join('');
}

export function generateULID() {
  return encodeTime(Date.now(), 10) + encodeRandom(16);
}

// ─── Device ID ────────────────────────────────────────────────────────────────

const DEVICE_KEY = 'emcomm_device_id';

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// ─── Local materialization ────────────────────────────────────────────────────
// Mirrors the Postgres trigger logic in 003_event_log.sql + 006 state machine
// on the client side so optimistic UI matches what the server will materialize.

const STATUS_RANK = { pending: 1, in_progress: 2, completed: 3 };

// "Most-advanced wins": never regress a task's status. If incoming is less
// advanced than current, return current. (Matches the Postgres trigger.)
function mergeStatus(currentStatus, incomingStatus) {
  if (!incomingStatus) return currentStatus;
  const cur = STATUS_RANK[currentStatus] ?? 0;
  const inc = STATUS_RANK[incomingStatus] ?? 0;
  return inc >= cur ? incomingStatus : currentStatus;
}

export async function applyTaskEvent(event) {
  const { op, entity_id, patch, ts } = event;

  if (op === 'create') {
    const task = {
      id: entity_id,
      name: patch.name || 'Unnamed Task',
      description: patch.description ?? null,
      deployment_location_id: patch.deployment_location_id ?? null,
      assigned_to_call_sign: patch.assigned_to_call_sign ?? null,
      status: patch.status || 'pending',
      priority: patch.priority || 'medium',
      due_date: patch.due_date ?? null,
      created_at: ts,
      updated_at: ts,
    };
    await offlineStorage.saveEntity('entities.tasks', task);

  } else if (op === 'update') {
    const existing = await offlineStorage.getEntity('entities.tasks', entity_id);
    if (!existing) return; // Task not seeded yet; server will handle it
    const updated = { ...existing };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'status') {
        updated.status = mergeStatus(existing.status, v);
      } else {
        updated[k] = v;
      }
    }
    updated.updated_at = new Date().toISOString();
    await offlineStorage.saveEntity('entities.tasks', updated);

  } else if (op === 'delete') {
    await offlineStorage.deleteEntity('entities.tasks', entity_id);
  }
}

// ─── Event dispatch ───────────────────────────────────────────────────────────

function buildEvent({ op, entityId, patch, actor, deploymentId }) {
  return {
    id: generateULID(),
    ts: new Date().toISOString(),
    actor_user_id: actor?.id ?? null,
    actor_call_sign: actor?.call_sign || 'UNKNOWN',
    actor_device_id: getDeviceId(),
    entity: 'task',
    entity_id: entityId,
    op,
    patch,
    deployment_id: deploymentId ?? null,
    sig: 'unsigned', // Phase 2 will add Ed25519
  };
}

async function dispatch(event, isOnline) {
  // Apply optimistically to local store first
  await applyTaskEvent(event);
  await offlineStorage.saveEntity('events', event);

  const queueToOutbox = () =>
    offlineStorage.saveEntity('outbox', { ...event, _queued_at: Date.now() });

  if (!isOnline) {
    await queueToOutbox();
    return;
  }

  // Race the Supabase insert against a 5s timeout. If our isOnline flag is
  // stale (e.g., DevTools throttle hasn't been detected yet by the sync
  // engine probe), the network request silently hangs — without this race
  // the UI looks frozen.
  try {
    const result = await Promise.race([
      supabase.from('events').insert(event),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Insert timeout')), 5000)
      ),
    ]);
    if (result?.error) {
      console.warn('Event post failed, queuing for outbox:', result.error.message);
      await queueToOutbox();
    }
  } catch (err) {
    console.warn('Event post timed out, queuing for outbox:', err.message);
    await queueToOutbox();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createTaskEvent(taskData, actor, isOnline = true) {
  const entityId = crypto.randomUUID();
  const event = buildEvent({
    op: 'create',
    entityId,
    patch: taskData,
    actor,
    deploymentId: taskData.deployment_id ?? null,
  });
  await dispatch(event, isOnline);
  return { id: entityId, ...taskData, created_at: event.ts, updated_at: event.ts };
}

export async function updateTaskEvent(taskId, patch, actor, deploymentId, isOnline = true) {
  const event = buildEvent({ op: 'update', entityId: taskId, patch, actor, deploymentId: deploymentId ?? null });
  await dispatch(event, isOnline);
}

export async function deleteTaskEvent(taskId, actor, deploymentId, isOnline = true) {
  const event = buildEvent({ op: 'delete', entityId: taskId, patch: {}, actor, deploymentId: deploymentId ?? null });
  await dispatch(event, isOnline);
}

export async function listTasksLocal() {
  return offlineStorage.getAllEntities('entities.tasks');
}
