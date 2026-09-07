import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Target, Plus, Trophy, CheckCircle2, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useObjectives, useUsers, useEntityMutations, useRealtimeInvalidation, reportMutationError } from '@/hooks/useEntities';
import { setObjectiveStatus } from '@/api/assets';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { objectiveSummary } from '@/lib/objectives';
import { ObjectiveList } from '@/features/objectives/ObjectiveList';
import { ObjectiveForm } from '@/features/objectives/ObjectiveForm';

/** /objectives: the deployment's objective list, claimable, with completion. */
export default function Objectives() {
  return <DeploymentGate><ObjectivesContent /></DeploymentGate>;
}

function ObjectivesContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const queryClient = useQueryClient();
  const objectivesQ = useObjectives();
  const usersQ = useUsers();
  useRealtimeInvalidation('objectives', queryKeys.objectives);
  const isPlanner = hasPermission(user?.app_role, 'MANAGE_OBJECTIVES');
  const canClaim = hasPermission(user?.app_role, 'CLAIM_OBJECTIVES');
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState({ open: false, objective: null });
  const [busyId, setBusyId] = useState(/** @type {string|null} */ (null));

  const objectives = useMemo(() => (objectivesQ.data ?? []).filter(o => o.deployment_id === deploymentId), [objectivesQ.data, deploymentId]);
  const usersById = useMemo(() => new Map((usersQ.data ?? []).map(u => [u.id, u])), [usersQ.data]);
  const summary = objectiveSummary(objectives);
  const mutations = useEntityMutations('objectives', queryKeys.objectives, { label: 'objective' });

  const status = useMutation({
    mutationFn: (/** @type {{ id: string, status: string }} */ { id, status }) => { setBusyId(id); return setObjectiveStatus(id, status); },
    onSuccess: (o) => { queryClient.invalidateQueries({ queryKey: queryKeys.objectives }); if (o.status === 'done') toast.success('Done. Nice work.'); },
    onError: reportMutationError('Update objective'),
    onSettled: () => setBusyId(null),
  });

  const submit = async (rows) => {
    const close = () => setForm({ open: false, objective: null });
    if (form.objective) { mutations.update.mutate({ id: form.objective.id, data: rows[0] }, { onSuccess: () => { close(); toast.success('Objective updated'); } }); return; }
    let order = Math.max(0, ...objectives.map(o => o.sort_order || 0));
    for (const r of rows) { order += 1; await mutations.create.mutateAsync({ ...r, deployment_id: deploymentId, sort_order: order, created_by: user?.id ?? null }).catch(() => {}); }
    close();
    toast.success(`${rows.length} objective${rows.length === 1 ? '' : 's'} added`);
  };
  const remove = async (o) => {
    if (await confirm({ title: `Delete “${o.title}”?`, destructive: true })) mutations.remove.mutate(o.id);
  };

  return (
    <QueryState queries={[objectivesQ, usersQ]}>
      <PageHeader
        icon={Target}
        eyebrow={deployment.name}
        title="Objectives"
        description={isPlanner ? 'What this deployment is trying to achieve, posted where everyone sees it. People take one, do it, tick it off; the results feed the after-action review.' : 'Take an objective, do it, tick it off.'}
        actions={isPlanner && <Button onClick={() => setForm({ open: true, objective: null })}><Plus /> Add objectives</Button>}
      />
      {objectives.length === 0 ? (
        <EmptyState icon={Target} title="No objectives yet" description={isPlanner ? 'Specific objectives keep people focused when they are cold, hungry and tired. Add a few; people can sign up for them.' : 'The coordinator has not posted objectives for this deployment.'} action={isPlanner && <Button onClick={() => setForm({ open: true, objective: null })}><Plus /> Add objectives</Button>} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Open" value={summary.open} icon={Target} tone={summary.open ? 'warning' : 'success'} />
            <StatCard label="Taken" value={summary.claimed} icon={Hand} tone="info" />
            <StatCard label="Done" value={summary.done} icon={CheckCircle2} tone="success" hint={`of ${summary.total - summary.dropped}`} />
            {summary.points > 0 ? <StatCard label="Points" value={<>{summary.pointsDone}<span className="text-sm font-normal text-muted-foreground">/{summary.points}</span></>} icon={Trophy} tone="accent" /> : <StatCard label="Dropped" value={summary.dropped} icon={Target} />}
          </div>
          <ObjectiveList objectives={objectives} user={user} isPlanner={isPlanner} usersById={usersById} onStatus={canClaim ? (id, s) => status.mutate({ id, status: s }) : () => {}} onEdit={(o) => setForm({ open: true, objective: o })} onDelete={remove} busyId={busyId} />
        </>
      )}
      <ObjectiveForm open={form.open} objective={form.objective} onClose={() => setForm({ open: false, objective: null })} onSubmit={submit} submitting={mutations.create.isPending || mutations.update.isPending} />
      {dialog}
    </QueryState>
  );
}
