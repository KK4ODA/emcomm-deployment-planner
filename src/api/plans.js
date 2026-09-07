import { supabase } from './supabaseClient';

/**
 * Publish the plan as a new version, notifying only the operators whose
 * packet changed (server RPC, migration 013).
 * @param {{ deploymentId: string, note: string, changes: { position_id: string, snapshot: Object, changes: string[] }[], notifyAll?: boolean }} args
 * @returns {Promise<{ version: number, affected_positions: number, notified: number }>}
 */
export async function publishPlan({ deploymentId, note, changes, notifyAll = false }) {
  const { data, error } = await supabase.rpc('publish_plan', {
    p_deployment_id: deploymentId,
    p_note: note?.trim() || null,
    p_changes: changes,
    p_notify_all: notifyAll,
  });
  if (error) throw error;
  return data;
}
