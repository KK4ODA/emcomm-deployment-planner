import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, UserCog, MapPin, Pencil, Trash2, Shield, Users, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useAresGroups, useUsers, useDeployments, useEntityMutations } from '@/hooks/useEntities';
import { queryKeys } from '@/lib/queryKeys';
import { AresGroupForm } from '@/features/aresGroups/AresGroupForm';

export default function AresGroups() {
  const { user } = useAuth();
  const groupsQ = useAresGroups();
  const usersQ = useUsers();
  const deploymentsQ = useDeployments();
  const mutations = useEntityMutations('aresGroups', queryKeys.aresGroups, { label: 'ARES group' });
  const [form, setForm] = useState({ open: false, group: null });
  const { confirm, dialog } = useConfirm();
  const isAdmin = user?.app_role === 'admin';

  const submit = (data) => {
    const close = () => setForm({ open: false, group: null });
    if (form.group) mutations.update.mutate({ id: form.group.id, data }, { onSuccess: () => { close(); toast.success('Group updated'); } });
    else mutations.create.mutate(data, { onSuccess: () => { close(); toast.success('Group created'); } });
  };

  const remove = async (group, deploymentCount) => {
    const ok = await confirm({
      title: `Delete “${group.name}”?`,
      description: deploymentCount > 0 ? `${deploymentCount} deployment${deploymentCount === 1 ? '' : 's'} reference this group and will become invisible to non-admins.` : 'Members will lose this group from their profile.',
      destructive: true,
    });
    if (ok) mutations.remove.mutate(group.id, { onSuccess: () => toast.success('Group deleted') });
  };

  const users = usersQ.data ?? [];
  const deployments = deploymentsQ.data ?? [];

  return (
    <>
      <PageHeader icon={UserCog} title="ARES groups" description="Groups scope deployments and membership" actions={isAdmin && <Button onClick={() => setForm({ open: true, group: null })}><Plus /> New group</Button>} />
      <QueryState queries={[groupsQ, usersQ, deploymentsQ]}>
        {(groupsQ.data ?? []).length === 0 ? (
          <EmptyState icon={UserCog} title="No ARES groups yet" description="Create a group for each served area or organisation. Every deployment belongs to exactly one group." action={isAdmin && <Button onClick={() => setForm({ open: true, group: null })}><Plus /> Create first group</Button>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groupsQ.data.map(group => {
              const memberCount = users.filter(u => u.ares_group_ids?.includes(group.id)).length;
              const deploymentCount = deployments.filter(d => d.ares_group_id === group.id).length;
              const admins = users.filter(u => group.admin_user_ids?.includes(u.id));
              const mayEdit = isAdmin || group.admin_user_ids?.includes(user?.id);
              return (
                <Card key={group.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold">{group.name}</h3>
                        {group.region && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{group.region}</p>}
                      </div>
                      {mayEdit && (
                        <div className="flex shrink-0">
                          <Button variant="ghost" size="icon-sm" aria-label="Edit group" onClick={() => setForm({ open: true, group })}><Pencil /></Button>
                          {isAdmin && <Button variant="ghost" size="icon-sm" aria-label="Delete group" className="text-destructive hover:text-destructive" onClick={() => remove(group, deploymentCount)}><Trash2 /></Button>}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
                    <dl className="grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-muted/60 p-2"><dd className="tnum text-lg font-semibold leading-tight">{memberCount}</dd><dt className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Users className="h-3 w-3" /> Members</dt></div>
                      <div className="rounded-md bg-muted/60 p-2"><dd className="tnum text-lg font-semibold leading-tight">{deploymentCount}</dd><dt className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><FolderOpen className="h-3 w-3" /> Deployments</dt></div>
                    </dl>
                    {admins.length > 0 && (
                      <div className="mt-auto">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Group admins</p>
                        <div className="flex flex-wrap gap-1">{admins.map(a => <Badge key={a.id} variant="warning"><Shield className="h-3 w-3" />{a.call_sign || a.full_name}</Badge>)}</div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </QueryState>
      <AresGroupForm open={form.open} group={form.group} users={users} onClose={() => setForm({ open: false, group: null })} onSubmit={submit} submitting={mutations.create.isPending || mutations.update.isPending} />
      {dialog}
    </>
  );
}
