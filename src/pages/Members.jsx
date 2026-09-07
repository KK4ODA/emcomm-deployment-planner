import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, UserPlus, Mail, Phone, Pencil, Shield, Trash2, MoreHorizontal, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { UserAvatar } from '@/components/common/UserAvatar';
import { CallSign } from '@/components/common/CallSign';
import { RoleBadge } from '@/components/common/Badges';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useUsers, useItems, useLocations, useDeployments, useAresGroups, useMemberships, reportMutationError } from '@/hooks/useEntities';
import { db } from '@/api/db';
import { upsertMemberProfile, cleanupDeletedUser, inviteUser } from '@/api/functions';
import { approveMembership, removeMembership, setUserMemberships } from '@/api/memberships';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission, ROLE_ORDER } from '@/lib/permissions';
import { itemsAssignedTo } from '@/lib/assignments';
import { pendingRequests } from '@/lib/memberships';
import { InviteMemberDialog } from '@/features/members/InviteMemberDialog';
import { MemberEditDialog } from '@/features/members/MemberEditDialog';
import { MembershipRequests } from '@/features/members/MembershipRequests';
import { RoleDialog } from '@/features/members/RoleDialog';
import { cn } from '@/lib/utils';

export default function Members() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const usersQ = useUsers();
  const itemsQ = useItems();
  const locationsQ = useLocations();
  const deploymentsQ = useDeployments();
  const groupsQ = useAresGroups();
  const membershipsQ = useMemberships();

  const [search, setSearch] = useState('');
  const [invite, setInvite] = useState(false);
  const [editing, setEditing] = useState(null);
  const [roleFor, setRoleFor] = useState(null);
  const [busyRequest, setBusyRequest] = useState(/** @type {string|null} */ (null));
  const { confirm, dialog } = useConfirm();

  const role = user?.app_role;
  const canManage = hasPermission(role, 'MANAGE_USERS');
  const canInvite = hasPermission(role, 'INVITE_USERS');
  const canApprove = hasPermission(role, 'APPROVE_MEMBERSHIPS');

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.users });
    queryClient.invalidateQueries({ queryKey: queryKeys.memberships });
  };

  const decideRequest = useMutation({
    mutationFn: async (/** @type {{ request: Object, approve: boolean }} */ { request, approve }) => {
      setBusyRequest(`${request.ares_group_id}:${request.user_id}`);
      if (approve) await approveMembership(request.ares_group_id, request.user_id, user.id);
      else await removeMembership(request.ares_group_id, request.user_id);
    },
    onSettled: () => setBusyRequest(null),
    onSuccess: (_d, { approve }) => { invalidateUsers(); toast.success(approve ? 'Membership approved' : 'Request declined'); },
    onError: reportMutationError('Membership request'),
  });

  const changeRole = useMutation({
    mutationFn: (/** @type {{ id: string, app_role: string }} */ { id, app_role }) => db.users.update(id, { app_role }),
    onSuccess: () => { invalidateUsers(); setRoleFor(null); toast.success('Role updated'); },
    onError: reportMutationError('Change role'),
  });

  const saveProfile = useMutation({
    mutationFn: async (/** @type {{ member: Object, data: Object }} */ { member, data }) => {
      // Edge function updates name/call sign/phone with the service role; group membership goes through memberships rows.
      await upsertMemberProfile({ email: member.email, full_name: data.full_name, call_sign: data.call_sign, phone: data.phone || '—', aprs_call_sign: data.aprs_call_sign });
      await db.users.update(member.id, { phone: data.phone });
      const current = (membershipsQ.data ?? []).filter(m => m.user_id === member.id);
      await setUserMemberships(member.id, data.ares_group_ids, current, user.id);
    },
    onSuccess: (_d, { member }) => { invalidateUsers(); setEditing(null); toast.success('Member updated'); if (member.id === user?.id) refreshProfile(); },
    onError: reportMutationError('Update member'),
  });

  const removeMember = useMutation({
    mutationFn: async (/** @type {Object} */ member) => {
      if (member.call_sign) await cleanupDeletedUser(member.call_sign);
      await db.users.remove(member.id);
    },
    onSuccess: () => {
      for (const key of [queryKeys.users, queryKeys.items, queryKeys.locations, queryKeys.tasks]) queryClient.invalidateQueries({ queryKey: key });
      toast.success('Member removed and assignments cleared');
    },
    onError: reportMutationError('Remove member'),
  });

  const sendInvite = useMutation({
    mutationFn: (/** @type {{ email: string, role?: string, aresGroupIds?: string[] }} */ data) => inviteUser(data),
    onSuccess: (_r, data) => { invalidateUsers(); setInvite(false); toast.success(`Invitation sent to ${data.email}`); },
    onError: reportMutationError('Invite'),
  });

  const members = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (usersQ.data ?? []).filter(m => !q || [m.full_name, m.call_sign, m.email].some(v => v?.toLowerCase().includes(q)));
    return list.sort((a, b) => ROLE_ORDER.indexOf(a.app_role) - ROLE_ORDER.indexOf(b.app_role) || (a.full_name || '').localeCompare(b.full_name || ''));
  }, [usersQ.data, search]);

  const groupName = useMemo(() => new Map((groupsQ.data ?? []).map(g => [g.id, g.name])), [groupsQ.data]);
  const deploymentName = useMemo(() => new Map((deploymentsQ.data ?? []).map(d => [d.id, d.name])), [deploymentsQ.data]);
  const locationDeployment = useMemo(() => new Map((locationsQ.data ?? []).map(l => [l.id, l.deployment_id])), [locationsQ.data]);

  const assignmentSummary = (callSign) => {
    const items = itemsAssignedTo(itemsQ.data ?? [], callSign);
    const byDeployment = new Map();
    for (const i of items) {
      const dep = deploymentName.get(locationDeployment.get(i.deployment_location_id));
      if (!dep) continue;
      byDeployment.set(dep, (byDeployment.get(dep) || 0) + 1);
    }
    return { total: items.length, byDeployment };
  };

  const del = async (member) => {
    const ok = await confirm({ title: `Remove ${member.full_name || member.email}?`, description: 'Their item, site and task assignments will be cleared. Their sign-in is deleted as well.', destructive: true, confirmLabel: 'Remove member' });
    if (ok) removeMember.mutate(member);
  };

  const pendingCount = (usersQ.data ?? []).filter(m => m.app_role === 'pending').length;
  const requests = canApprove ? pendingRequests(membershipsQ.data ?? []) : [];

  return (
    <>
      <PageHeader
        icon={Users}
        title="Members"
        description={pendingCount > 0 ? `${pendingCount} member${pendingCount === 1 ? '' : 's'} awaiting role approval` : 'Everyone in your ARES groups'}
        actions={canInvite && <Button onClick={() => setInvite(true)}><UserPlus /> Invite member</Button>}
      />
      <MembershipRequests
        requests={requests}
        users={usersQ.data ?? []}
        groups={groupsQ.data ?? []}
        busyKey={busyRequest}
        onApprove={(request) => decideRequest.mutate({ request, approve: true })}
        onReject={(request) => decideRequest.mutate({ request, approve: false })}
      />
      <div className="mb-3 max-w-md">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, call sign or email…" />
      </div>

      <QueryState queries={[usersQ, itemsQ, locationsQ, deploymentsQ]}>
        {members.length === 0 ? (
          <EmptyState icon={Users} title="No members found" description={search ? 'Try a different search.' : 'Invite the first member of your group.'} />
        ) : (
          <div className="rounded-lg border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden lg:table-cell">ARES groups</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">Items</TableHead>
                  {(canManage || canInvite) && <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(m => {
                  const a = assignmentSummary(m.call_sign);
                  const isSelf = m.id === user?.id;
                  return (
                    <TableRow key={m.id} className={cn(m.app_role === 'pending' && 'bg-accent/5')}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <UserAvatar user={m} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{m.full_name || <span className="text-muted-foreground">No name yet</span>}{isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</p>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              {m.call_sign ? <CallSign value={m.call_sign} /> : <span>No call sign</span>}
                              {m.aprs_call_sign && <span className="font-mono">APRS {m.aprs_call_sign}</span>}
                              <span className="md:hidden truncate">{m.email}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /><a href={`mailto:${m.email}`} className="hover:underline">{m.email}</a></div>
                        {m.phone && <div className="mt-0.5 flex items-center gap-1.5"><Phone className="h-3 w-3" /><a href={`tel:${m.phone}`} className="hover:underline">{m.phone}</a></div>}
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <button type="button" onClick={() => setRoleFor(m)} className="rounded" title="Change role"><RoleBadge role={m.app_role} /></button>
                        ) : <RoleBadge role={m.app_role} />}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {(m.ares_group_ids || []).map(id => groupName.get(id)).filter(Boolean).join(', ') || '—'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right">
                        {a.total > 0 ? (
                          <span className="tnum inline-flex items-center gap-1 text-sm" title={[...a.byDeployment].map(([d, n]) => `${d}: ${n}`).join('\n')}>
                            <Package className="h-3.5 w-3.5 text-muted-foreground" /> {a.total}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      {(canManage || canInvite) && (
                        <TableCell>
                          {canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.full_name || m.email}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditing(m)}><Pencil /> Edit profile</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setRoleFor(m)}><Shield /> Change role</DropdownMenuItem>
                                {!isSelf && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => del(m)} className="text-destructive focus:text-destructive"><Trash2 /> Remove member</DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryState>

      <InviteMemberDialog open={invite} onClose={() => setInvite(false)} onInvite={(d) => sendInvite.mutate(d)} currentUserRole={role} submitting={sendInvite.isPending} />
      <MemberEditDialog open={!!editing} member={editing} onClose={() => setEditing(null)} onSave={(data) => saveProfile.mutate({ member: editing, data })} submitting={saveProfile.isPending} />
      <RoleDialog open={!!roleFor} member={roleFor} onClose={() => setRoleFor(null)} onChange={(app_role) => changeRole.mutate({ id: roleFor.id, app_role })} submitting={changeRole.isPending} />
      {dialog}
    </>
  );
}
