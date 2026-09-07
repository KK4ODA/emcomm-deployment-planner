import { describe, it, expect } from 'vitest';
import { activeGroupIds, pendingGroupIds, pendingRequests, membershipDiff, needsGroup } from './memberships';

const rows = [
  { ares_group_id: 'g1', user_id: 'u1', status: 'active', requested_at: '2026-01-01' },
  { ares_group_id: 'g2', user_id: 'u1', status: 'pending', requested_at: '2026-03-01' },
  { ares_group_id: 'g1', user_id: 'u2', status: 'pending', requested_at: '2026-02-01' },
];

describe('memberships', () => {
  it('splits active and pending per user', () => {
    expect(activeGroupIds(rows, 'u1')).toEqual(['g1']);
    expect(pendingGroupIds(rows, 'u1')).toEqual(['g2']);
    expect(activeGroupIds(rows, 'u2')).toEqual([]);
  });

  it('orders the approval queue oldest first', () => {
    expect(pendingRequests(rows).map(r => r.user_id)).toEqual(['u2', 'u1']);
  });

  it('computes the admin diff, activating pending rows instead of re-adding', () => {
    const mine = rows.filter(r => r.user_id === 'u1');
    expect(membershipDiff(mine, ['g2', 'g3'])).toEqual({ activate: ['g2'], add: ['g3'], remove: ['g1'] });
    expect(membershipDiff(mine, ['g1'])).toEqual({ activate: [], add: [], remove: [] });
  });

  it('knows when a member is locked out for lack of a group', () => {
    expect(needsGroup({ id: 'u2', app_role: 'operator' }, rows)).toBe(true);
    expect(needsGroup({ id: 'u1', app_role: 'operator' }, rows)).toBe(false);
    expect(needsGroup({ id: 'u9', app_role: 'admin' }, rows)).toBe(false);
    expect(needsGroup(null, rows)).toBe(false);
  });
});
