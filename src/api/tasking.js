/**
 * Tasking API: dispatch and state changes go through server RPCs so the
 * ladder, the log lines and the notifications are the same whether the
 * change comes from the board, the packet or APRS. Operator steps from the
 * packet are queued as offline intents like check-ins.
 */
import { supabase } from './supabaseClient';
import { offlineStorage, STORES } from '@/lib/offline/storage';
import { generateULID, OUTBOX_CHANGED_EVENT } from './taskEvents';
import { INTENTS_CHANGED_EVENT } from './assignmentIntents';

function unwrap({ data, error }) {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

const PERMANENT_CODES = new Set(['42501', '22023', 'P0002', 'PGRST202', '23514']);

export async function listTasks(deploymentId) {
  return unwrap(await supabase.from('ops_tasks').select('*').eq('deployment_id', deploymentId).order('issued_at', { ascending: false }).limit(500));
}

/** @param {{ deploymentId: string, title: string, kind?: string, priority?: string, positionId?: string|null, assignmentId?: string|null, detail?: string|null, fromSiteId?: string|null, toSiteId?: string|null, fromText?: string|null, toText?: string|null }} args */
export async function dispatchTask({ deploymentId, title, kind = 'other', priority = 'routine', positionId = null, assignmentId = null, detail = null, fromSiteId = null, toSiteId = null, fromText = null, toText = null }) {
  return unwrap(await supabase.rpc('dispatch_task', {
    p_deployment_id: deploymentId, p_title: title, p_kind: kind, p_priority: priority, p_position_id: positionId, p_assignment_id: assignmentId,
    p_detail: detail, p_from_site_id: fromSiteId, p_to_site_id: toSiteId, p_from_text: fromText, p_to_text: toText,
  }));
}

/** @param {string} id @param {{ title?: string|null, detail?: string|null, priority?: string|null, positionId?: string|null }} [patch] */
export async function updateTask(id, { title, detail, priority, positionId } = /** @type {any} */ ({})) {
  return unwrap(await supabase.rpc('update_task', { p_task_id: id, p_title: title ?? null, p_detail: detail ?? null, p_priority: priority ?? null, p_position_id: positionId ?? null }));
}

/** Desk-side state change: online only, immediate. */
export async function setTaskState(id, status, note = null) {
  return unwrap(await supabase.rpc('set_task_state', { p_task_id: id, p_status: status, p_at: new Date().toISOString(), p_note: note, p_intent_id: null, p_user_id: null }));
}

// ── operator steps from the packet: queued like check-ins ───────────────────
function notify() {
  window.dispatchEvent(new CustomEvent(INTENTS_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT));
}

export async function sendTaskIntent(intent) {
  const { data, error } = await supabase.rpc('set_task_state', { p_task_id: intent.task_id, p_status: intent.status, p_at: intent.at, p_note: intent.note ?? null, p_intent_id: intent.id, p_user_id: null });
  if (error) throw Object.assign(new Error(error.message), { code: error.code, permanent: PERMANENT_CODES.has(error.code) });
  return data;
}

/**
 * Queue a task step and try to send it now. Stored in the same intents
 * store as status intents, tagged `kind: 'task'`, so the sync engine drains
 * and the badge counts them together.
 */
export async function queueTaskIntent({ taskId, deploymentId, status, note = null, online = true }) {
  const intent = { id: generateULID(), kind: 'task', task_id: taskId, deployment_id: deploymentId, status, note, at: new Date().toISOString(), queued_at: Date.now(), error: null };
  await offlineStorage.saveEntity(STORES.intents, intent);
  notify();
  if (!online) return { intent, sent: false };
  try {
    const task = await Promise.race([sendTaskIntent(intent), new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Timed out'), { permanent: false })), 6000))]);
    await offlineStorage.deleteEntity(STORES.intents, intent.id);
    notify();
    return { intent, sent: true, task };
  } catch (err) {
    if (err.permanent) { await offlineStorage.saveEntity(STORES.intents, { ...intent, error: err.message }); notify(); }
    return { intent, sent: false, error: err };
  }
}

/** The state a task appears to be in once queued steps are applied. */
export function effectiveTaskStatus(task, intents = []) {
  const rank = { issued: 0, acknowledged: 1, en_route: 2, on_scene: 3, complete: 4, cancelled: 5 };
  let best = task.status;
  for (const i of intents) if (i.kind === 'task' && i.task_id === task.id && !i.error && rank[i.status] > rank[best]) best = i.status;
  return best;
}
