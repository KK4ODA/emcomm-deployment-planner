import { supabase } from './supabaseClient';
import { TABLES } from './db';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/** Latest fix per callsign across the groups the user can see. */
export async function listLatestPositions() {
  return unwrap(await supabase.from('aprs_positions_latest').select('*').order('heard_at', { ascending: false }).limit(2000)) ?? [];
}

/** Recent fixes for one callsign (trail). */
export async function listTrail(groupId, callsign, hours = 12) {
  return unwrap(await supabase.from(TABLES.aprsPositions).select('*').eq('ares_group_id', groupId).eq('callsign', callsign)
    .gte('heard_at', new Date(Date.now() - hours * 3600_000).toISOString()).order('heard_at', { ascending: true })) ?? [];
}

/**
 * Create a bridge. The token is returned once; only its SHA-256 is stored.
 * @param {{ groupId: string, name: string, tokenHash: string, createdBy: string|null }} args
 */
export async function createBridge({ groupId, name, tokenHash, createdBy }) {
  return unwrap(await supabase.from(TABLES.aprsBridges).insert({ ares_group_id: groupId, name, token_hash: tokenHash, created_by: createdBy }).select().single());
}

export async function revokeBridge(id) {
  return unwrap(await supabase.from(TABLES.aprsBridges).update({ revoked_at: new Date().toISOString() }).eq('id', id).select().single());
}

/** Functions base URL for the bridge setup instructions. */
export function functionsBaseUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL || '';
  return `${base.replace(/\/$/, '')}/functions/v1`;
}
