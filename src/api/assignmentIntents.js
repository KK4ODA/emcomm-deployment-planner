/**
 * Offline-capable assignment status changes ("intents").
 *
 * An intent is { id, assignment_id, deployment_id, status, at, note, error }.
 * It is written to IndexedDB first, then sent to the idempotent RPC
 * `set_assignment_status`. If the network is down or the call fails for a
 * transient reason it stays queued and `syncEngine` retries. A permanent
 * rejection (permission, unknown status) is kept with `error` set so the
 * operator can see it and clear it; it is not retried.
 */
import { supabase } from './supabaseClient';
import { offlineStorage, STORES } from '@/lib/offline/storage';
import { generateULID, OUTBOX_CHANGED_EVENT } from './taskEvents';

export const INTENTS_CHANGED_EVENT = 'emcomm:intents-changed';
const PERMANENT_CODES = new Set(['42501', '22023', 'P0002', 'PGRST202', '23514']);

function notify() {
  window.dispatchEvent(new CustomEvent(INTENTS_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT));
}

/** Send one intent to the server. Resolves with the updated assignment row. */
export async function sendIntent(intent) {
  const { data, error } = await supabase.rpc('set_assignment_status', {
    p_assignment_id: intent.assignment_id,
    p_status: intent.status,
    p_at: intent.at,
    p_note: intent.note ?? null,
    p_intent_id: intent.id,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code, permanent: PERMANENT_CODES.has(error.code) });
  return data;
}

/**
 * Queue a status change and try to send it right away.
 * @param {{ assignmentId: string, deploymentId: string, status: string, note?: string|null, online?: boolean }} args
 * @returns {Promise<{ intent: Object, sent: boolean, assignment?: Object, error?: Error & { permanent?: boolean, code?: string } }>}
 */
export async function queueStatusIntent({ assignmentId, deploymentId, status, note = null, online = true }) {
  const intent = { id: generateULID(), assignment_id: assignmentId, deployment_id: deploymentId, status, note, at: new Date().toISOString(), queued_at: Date.now(), error: null };
  await offlineStorage.saveEntity(STORES.intents, intent);
  notify();
  if (!online) return { intent, sent: false };
  try {
    const assignment = await Promise.race([
      sendIntent(intent),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Timed out'), { permanent: false })), 6000)),
    ]);
    await offlineStorage.deleteEntity(STORES.intents, intent.id);
    notify();
    return { intent, sent: true, assignment };
  } catch (err) {
    if (err.permanent) {
      await offlineStorage.saveEntity(STORES.intents, { ...intent, error: err.message });
      notify();
      return { intent, sent: false, error: err };
    }
    return { intent, sent: false, error: err };
  }
}

/** All queued intents (pending and failed). */
export async function listIntents() {
  try { return await offlineStorage.getAllEntities(STORES.intents); } catch { return []; }
}

export async function discardIntent(id) {
  await offlineStorage.deleteEntity(STORES.intents, id);
  notify();
}

/**
 * Retry every pending intent in order. Called by the sync engine when online.
 * @returns {Promise<{ sent: number, failed: number, remaining: number }>}
 */
export async function drainIntents() {
  const all = (await listIntents()).filter(i => !i.error).sort((a, b) => a.id.localeCompare(b.id));
  let sent = 0, failed = 0;
  for (const intent of all) {
    try {
      await sendIntent(intent);
      await offlineStorage.deleteEntity(STORES.intents, intent.id);
      sent += 1;
    } catch (err) {
      if (err.permanent) {
        await offlineStorage.saveEntity(STORES.intents, { ...intent, error: err.message });
        failed += 1;
      } else {
        break; // network problem: stop and try again next cycle
      }
    }
  }
  const remaining = (await listIntents()).length;
  if (sent || failed) notify();
  return { sent, failed, remaining };
}
