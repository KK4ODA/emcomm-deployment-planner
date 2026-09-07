/**
 * Group membership helpers. A membership row is
 * { ares_group_id, user_id, status: 'pending'|'active', requested_at, approved_at }.
 * `users.ares_group_ids` is a server-maintained mirror of the *active* rows
 * and is read-only for clients.
 */

/** Active group ids for a user. */
export function activeGroupIds(memberships, userId) {
  return memberships.filter(m => m.user_id === userId && m.status === 'active').map(m => m.ares_group_id);
}

/** Group ids the user has asked to join and not yet been approved for. */
export function pendingGroupIds(memberships, userId) {
  return memberships.filter(m => m.user_id === userId && m.status === 'pending').map(m => m.ares_group_id);
}

/** All pending requests, oldest first, for the approval queue. */
export function pendingRequests(memberships) {
  return memberships
    .filter(m => m.status === 'pending')
    .sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime());
}

/**
 * What an admin must insert and delete to make a user's memberships equal
 * `desired`. Pending rows for a desired group are activated (counted as add).
 * @param {Object[]} memberships all rows for the user
 * @param {string[]} desired group ids that should be active afterwards
 */
export function membershipDiff(memberships, desired) {
  const want = new Set(desired);
  const active = new Set(memberships.filter(m => m.status === 'active').map(m => m.ares_group_id));
  const pending = new Set(memberships.filter(m => m.status === 'pending').map(m => m.ares_group_id));
  return {
    activate: [...want].filter(id => !active.has(id) && pending.has(id)),
    add: [...want].filter(id => !active.has(id) && !pending.has(id)),
    remove: [...active].filter(id => !want.has(id)),
  };
}

/** True when a non-admin has no active group and therefore sees no deployments. */
export function needsGroup(user, memberships) {
  if (!user || user.app_role === 'admin') return false;
  return activeGroupIds(memberships, user.id).length === 0;
}
