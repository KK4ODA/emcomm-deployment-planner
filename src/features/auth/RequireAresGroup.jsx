import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, Clock, LogOut } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AresGroupPicker } from '@/components/common/AresGroupPicker';
import { useAuth } from '@/lib/AuthContext';
import { useAresGroups, useMemberships, reportMutationError } from '@/hooks/useEntities';
import { requestMemberships, withdrawMembership } from '@/api/memberships';
import { needsGroup, pendingGroupIds } from '@/lib/memberships';
import { queryKeys } from '@/lib/queryKeys';

/**
 * First-run gate: non-admin members must belong to at least one ARES group
 * before they can see deployments. Membership is granted by an admin, so the
 * member asks to join and waits; this dialog shows the request state.
 */
export function RequireAresGroup() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: groups = [] } = useAresGroups({ enabled: !!user });
  const membershipsQ = useMemberships({ enabled: !!user });
  const [selected, setSelected] = useState([]);

  const memberships = membershipsQ.data ?? [];
  const show = !!user && membershipsQ.isSuccess && groups.length > 0 && needsGroup(user, memberships);
  const pending = user ? pendingGroupIds(memberships, user.id) : [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.memberships });
    queryClient.invalidateQueries({ queryKey: queryKeys.users });
  };

  const request = useMutation({
    mutationFn: () => requestMemberships(user.id, selected),
    onSuccess: () => { invalidate(); setSelected([]); toast.success('Request sent. An admin will approve it.'); },
    onError: reportMutationError('Join request'),
  });

  const withdraw = useMutation({
    mutationFn: (/** @type {string} */ groupId) => withdrawMembership(user.id, groupId),
    onSuccess: invalidate,
    onError: reportMutationError('Withdraw request'),
  });

  if (!show) return null;

  const groupName = (id) => groups.find(g => g.id === id)?.name ?? 'Group';
  const available = groups.filter(g => !pending.includes(g.id));

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent hideClose onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} className="max-w-md">
        <DialogHeader>
          <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-md bg-info/10 text-info">
            {pending.length ? <Clock className="h-5 w-5" aria-hidden /> : <Users className="h-5 w-5" aria-hidden />}
          </div>
          <DialogTitle>{pending.length ? 'Waiting for approval' : 'Join your ARES group'}</DialogTitle>
          <DialogDescription>
            {pending.length
              ? 'An admin of the group has been notified. You will see its deployments as soon as they approve you.'
              : 'Deployments are shared within ARES groups. Ask to join the groups you belong to; an admin approves the request.'}
          </DialogDescription>
        </DialogHeader>

        {pending.length > 0 && (
          <ul className="space-y-2">
            {pending.map(id => (
              <li key={id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span className="inline-flex items-center gap-2"><Badge variant="warning">Pending</Badge> {groupName(id)}</span>
                <Button size="sm" variant="ghost" onClick={() => withdraw.mutate(id)} loading={withdraw.isPending}>Withdraw</Button>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 && (
          <div className="space-y-3">
            <AresGroupPicker groups={available} value={selected} onChange={setSelected} label={pending.length ? 'Ask to join another group' : 'ARES groups'} maxHeight="max-h-64" />
            <Button onClick={() => request.mutate()} loading={request.isPending} disabled={!selected.length} className="w-full">
              {pending.length ? 'Send another request' : 'Request to join'}
            </Button>
          </div>
        )}

        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => logout()}>
          <LogOut /> Sign out
        </Button>
      </DialogContent>
    </Dialog>
  );
}
