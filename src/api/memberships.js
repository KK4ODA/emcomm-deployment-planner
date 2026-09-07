import { supabase } from './supabaseClient';
import { TABLES } from './db';
import { membershipDiff } from '@/lib/memberships';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/** Every membership row the caller may see (RLS: own rows, same-group members, or all for admins). */
export async function listMemberships() {
  return unwrap(await supabase.from(TABLES.memberships).select('*')) ?? [];
}

/** A member asks to join groups; rows are created as `pending` (RLS only allows that shape). */
export async function requestMemberships(userId, groupIds) {
  if (!groupIds.length) return [];
  const rows = groupIds.map(ares_group_id => ({ ares_group_id, user_id: userId, status: 'pending' }));
  return unwrap(await supabase.from(TABLES.memberships).upsert(rows, { onConflict: 'ares_group_id,user_id', ignoreDuplicates: true }).select()) ?? [];
}

/** Withdraw an own pending request. */
export async function withdrawMembership(userId, groupId) {
  unwrap(await supabase.from(TABLES.memberships).delete().eq('user_id', userId).eq('ares_group_id', groupId).eq('status', 'pending'));
}

/** Admin: approve a pending request. */
export async function approveMembership(groupId, userId, approverId) {
  return unwrap(await supabase.from(TABLES.memberships)
    .update({ status: 'active', approved_at: new Date().toISOString(), approved_by: approverId })
    .eq('ares_group_id', groupId).eq('user_id', userId).select().single());
}

/** Admin: reject a request or remove an active membership. */
export async function removeMembership(groupId, userId) {
  unwrap(await supabase.from(TABLES.memberships).delete().eq('ares_group_id', groupId).eq('user_id', userId));
}

/**
 * Admin: make a user's active memberships equal `desiredGroupIds`.
 * @param {string} userId
 * @param {string[]} desiredGroupIds
 * @param {Object[]} current the user's existing membership rows
 * @param {string} approverId
 */
export async function setUserMemberships(userId, desiredGroupIds, current, approverId) {
  const { activate, add, remove } = membershipDiff(current, desiredGroupIds);
  const now = new Date().toISOString();
  for (const groupId of activate) await approveMembership(groupId, userId, approverId);
  if (add.length) {
    unwrap(await supabase.from(TABLES.memberships).insert(add.map(ares_group_id => ({
      ares_group_id, user_id: userId, status: 'active', approved_at: now, approved_by: approverId,
    }))));
  }
  for (const groupId of remove) await removeMembership(groupId, userId);
  return { activated: activate.length, added: add.length, removed: remove.length };
}
