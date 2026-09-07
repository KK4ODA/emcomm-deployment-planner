import { supabase } from './supabaseClient';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/**
 * Record a custody move (server RPC, migration 018). Any active member of
 * the asset's group may call it; planners may also retire or restore.
 * @param {{ assetId: string, action: string, toUserId?: string|null, deploymentId?: string|null, siteId?: string|null, note?: string|null }} args
 *   action: checked_out | on_site | returned | transferred | retired | restored
 */
export async function moveAsset({ assetId, action, toUserId = null, deploymentId = null, siteId = null, note = null }) {
  return unwrap(await supabase.rpc('move_asset', {
    p_asset_id: assetId, p_action: action, p_to_user_id: toUserId, p_deployment_id: deploymentId, p_site_id: siteId, p_note: note?.trim() || null,
  }));
}

/**
 * Claim, release, finish or reopen an objective (server RPC, migration 018).
 * @param {string} objectiveId
 * @param {string} status open | claimed | done | dropped
 * @param {string|null} [evidence]
 */
export async function setObjectiveStatus(objectiveId, status, evidence = null) {
  return unwrap(await supabase.rpc('set_objective_status', { p_objective_id: objectiveId, p_status: status, p_evidence: evidence }));
}
