import { supabase } from './supabaseClient';
import { TABLES } from './db';

/**
 * Registration with the served agency, upserted per operator so the planner
 * can set a status before any row exists.
 * @param {string} deploymentId
 * @param {string} userId
 * @param {{ status?: string, reference?: string|null, note?: string|null }} patch
 */
export async function setRegistration(deploymentId, userId, patch) {
  const { data, error } = await supabase
    .from(TABLES.deploymentRegistrations)
    .upsert({ deployment_id: deploymentId, user_id: userId, ...patch }, { onConflict: 'deployment_id,user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Mint a read-only share link. The token comes back once; only its hash is
 * stored, as for APRS bridge tokens.
 * @param {{ deploymentId: string, label: string, includeContacts?: boolean, expiresAt?: string|null }} args
 * @returns {Promise<{ id: string, token: string }>}
 */
export async function createShareLink({ deploymentId, label, includeContacts = false, expiresAt = null }) {
  const { data, error } = await supabase.rpc('create_deployment_share', {
    p_deployment_id: deploymentId, p_label: label, p_include_contacts: includeContacts, p_expires_at: expiresAt,
  });
  if (error) throw error;
  return /** @type {{ id: string, token: string }} */ (data);
}
