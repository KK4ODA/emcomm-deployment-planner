import React from 'react';
import { Clock, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/common/Section';
import { UserAvatar } from '@/components/common/UserAvatar';
import { CallSign } from '@/components/common/CallSign';
import { relativeTime } from '@/lib/time';

/**
 * Approval queue for pending group memberships (admins only).
 * @param {{
 *   requests: Object[], users: Object[], groups: Object[],
 *   onApprove: (r: Object) => void, onReject: (r: Object) => void, busyKey?: string|null
 * }} props
 */
export function MembershipRequests({ requests, users, groups, onApprove, onReject, busyKey }) {
  if (!requests.length) return null;
  const userById = new Map(users.map(u => [u.id, u]));
  const groupById = new Map(groups.map(g => [g.id, g]));
  return (
    <Section title="Join requests" icon={Clock} aside={`${requests.length} waiting`} bodyClassName="p-0" className="mb-4 border-warning/40">
      <ul className="divide-y">
        {requests.map(r => {
          const u = userById.get(r.user_id);
          const key = `${r.ares_group_id}:${r.user_id}`;
          return (
            <li key={key} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <UserAvatar user={u || { email: '?' }} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {u?.full_name || u?.email || 'Unknown member'}
                  {u?.call_sign && <span className="ml-2"><CallSign value={u.call_sign} /></span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  wants to join <strong>{groupById.get(r.ares_group_id)?.name ?? 'a group'}</strong> · asked {relativeTime(r.requested_at)}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => onApprove(r)} loading={busyKey === key}><Check /> Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => onReject(r)} disabled={busyKey === key}><X /> Decline</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
