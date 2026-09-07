import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Radio, Plus, FileDown, Download, Send, AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { Section } from '@/components/common/Section';
import { FormField } from '@/components/common/FormField';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useChannels, useCommsPlans, useCommsPlanChannels, useOperationalPeriods, usePositions, useRealtimeInvalidation } from '@/hooks/useEntities';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { groupByCondition, planWarnings, toChirpCsv, CONDITIONS } from '@/lib/comms';
import { downloadBlob, safeFileName } from '@/lib/download';
import { fileTimestamp } from '@/lib/time';
import { AddChannelsDialog } from '@/features/comms/AddChannelsDialog';
import { PlanChannelRow } from '@/features/comms/PlanChannelRow';
import { PublishPlanDialog } from '@/features/deployments/PublishPlanDialog';
import { useCommsPlanMutations, usePublishPlan } from '@/features/comms/useCommsMutations';
import { renderIcs205Pdf } from '@/features/comms/ics205Pdf';
import { ROUTES } from '@/app/routes';

export default function CommsPlan() {
  return <DeploymentGate><CommsPlanContent /></DeploymentGate>;
}

const NONE = '__none__';

function CommsPlanContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const channelsQ = useChannels();
  const plansQ = useCommsPlans();
  const rowsQ = useCommsPlanChannels();
  const periodsQ = useOperationalPeriods();
  const positionsQ = usePositions();
  useRealtimeInvalidation('commsPlanChannels', queryKeys.commsPlanChannels);
  const mutations = useCommsPlanMutations(deploymentId);
  const publish = usePublishPlan();
  const { confirm, dialog } = useConfirm();
  const canEdit = hasPermission(user?.app_role, 'MANAGE_COMMS_PLAN');

  const [planId, setPlanId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const plans = useMemo(() => (plansQ.data ?? []).filter(p => p.deployment_id === deploymentId), [plansQ.data, deploymentId]);
  const plan = plans.find(p => p.id === planId) ?? plans[0] ?? null;
  const rows = useMemo(() => (rowsQ.data ?? []).filter(r => plan && r.comms_plan_id === plan.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [rowsQ.data, plan]);
  const periods = useMemo(() => (periodsQ.data ?? []).filter(p => p.deployment_id === deploymentId).sort((a, b) => a.sequence - b.sequence), [periodsQ.data, deploymentId]);
  const library = useMemo(() => (channelsQ.data ?? []).filter(c => c.ares_group_id === deployment.ares_group_id), [channelsQ.data, deployment.ares_group_id]);
  const libraryById = useMemo(() => new Map(library.map(c => [c.id, c])), [library]);
  const nets = useMemo(() => [...new Set([...(positionsQ.data ?? []).filter(p => p.deployment_id === deploymentId).map(p => p.net), ...rows.map(r => r.net)].filter(Boolean))], [positionsQ.data, rows, deploymentId]);
  const groups = useMemo(() => groupByCondition(rows), [rows]);
  const warnings = useMemo(() => planWarnings(rows), [rows]);
  const period = plan?.operational_period_id ? periods.find(p => p.id === plan.operational_period_id) : null;

  const [meta, setMeta] = useState(/** @type {Object|null} */ (null));
  const metaForm = meta ?? { special_instructions: plan?.special_instructions || '', prepared_by_name: plan?.prepared_by_name || user?.full_name || '', prepared_by_position: plan?.prepared_by_position || 'COML' };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const blob = await renderIcs205Pdf({ deployment, plan, rows, period });
      downloadBlob(blob, `ICS205_${safeFileName(deployment.name)}_v${plan.version || 1}.pdf`, 'application/pdf');
    } catch (err) {
      toast.error(`PDF export failed: ${err.message || 'unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const exportChirp = () => {
    const csv = toChirpCsv(rows);
    downloadBlob(csv, `${safeFileName(deployment.name)}_chirp_${fileTimestamp()}.csv`, 'text/csv;charset=utf-8');
    toast.success('CHIRP CSV downloaded', { description: 'Import it in CHIRP with File › Import.' });
  };

  const move = (row, dir) => {
    const list = [...rows];
    const i = list.findIndex(r => r.id === row.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    mutations.reorder.mutate(list);
  };

  const removeRow = async (row) => {
    if (await confirm({ title: `Remove “${row.channel_name}” from the plan?`, description: 'The library channel is kept.', destructive: true, confirmLabel: 'Remove' })) mutations.removeRow.mutate(row.id);
  };

  return (
    <QueryState queries={[channelsQ, plansQ, rowsQ, periodsQ]}>
      <PageHeader
        icon={Radio}
        eyebrow={deployment.name}
        title="Communications plan"
        description="Which channels the deployment uses, in normal conditions and when things fail. Generates the ICS 205 and every operator's frequency list."
        actions={plan && (
          <>
            <Button variant="outline" onClick={exportChirp} disabled={rows.length === 0}><Download /> CHIRP CSV</Button>
            <Button variant="outline" onClick={exportPdf} loading={exporting} disabled={rows.length === 0}><FileDown /> ICS 205 PDF</Button>
            {canEdit && <Button onClick={() => setPublishOpen(true)}><Send /> Publish plan</Button>}
          </>
        )}
      />

      {!plan ? (
        <EmptyState
          icon={Radio}
          title="No communications plan yet"
          description={canEdit ? 'Create the plan, then add channels from your library: primary and backup repeaters for Condition 1, and a simplex path for Condition 3.' : 'The coordinator has not built a communications plan for this deployment yet.'}
          action={canEdit && <Button onClick={() => mutations.createPlan.mutate({ prepared_by_name: user?.full_name })} loading={mutations.createPlan.isPending}><Plus /> Create plan</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {plans.length > 1 && (
                <Select value={plan.id} onValueChange={setPlanId}>
                  <SelectTrigger className="w-64" aria-label="Plan"><SelectValue /></SelectTrigger>
                  <SelectContent>{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.operational_period_id ? ` · ${periods.find(op => op.id === p.operational_period_id)?.label ?? 'period'}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {canEdit && periods.length > 1 && (
                <Select value={plan.operational_period_id || NONE} onValueChange={(v) => mutations.updatePlan.mutate({ id: plan.id, data: { operational_period_id: v === NONE ? null : v } })}>
                  <SelectTrigger className="w-60 text-xs" aria-label="Operational period"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Whole deployment</SelectItem>
                    {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.label || `Period ${p.sequence}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" onClick={() => mutations.createPlan.mutate({ name: `Plan ${plans.length + 1}`, prepared_by_name: user?.full_name })}><Plus /> Another plan (per period)</Button>
                  <Button size="sm" className="ml-auto" onClick={() => setAddOpen(true)}><Plus /> Add channels</Button>
                </>
              )}
            </div>

            {[1, 2, 3].map(level => {
              const list = groups[level] ?? [];
              const c = CONDITIONS[level];
              if (level > 1 && list.length === 0 && !canEdit) return null;
              return (
                <Section key={level} title={<><span>{c.label}: {c.title}</span><span className="ml-2 text-xs font-normal text-muted-foreground">{c.hint}</span></>} icon={Radio} aside={`${list.length} channel${list.length === 1 ? '' : 's'}`} bodyClassName="p-0">
                  {list.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{level === 1 ? 'Add the primary and alternate nets.' : level === 2 ? 'Optional: what changes when internet and phones are gone (often the same repeaters, no phone all-call).' : 'Add a simplex channel and name the relay stations in the remarks.'}</p>
                  ) : (
                    <ul className="divide-y">
                      {list.map((row, i) => (
                        <PlanChannelRow
                          key={row.id}
                          row={row}
                          libraryChannel={row.channel_id ? libraryById.get(row.channel_id) : null}
                          canEdit={canEdit}
                          onChange={(patch) => mutations.updateRow.mutate({ id: row.id, data: patch })}
                          onRemove={() => removeRow(row)}
                          onSync={() => mutations.syncRow.mutate({ row, channel: libraryById.get(row.channel_id) })}
                          onMove={(dir) => move(row, dir)}
                          first={i === 0}
                          last={i === list.length - 1}
                        />
                      ))}
                    </ul>
                  )}
                </Section>
              );
            })}

            <Section title="Special instructions and preparer" icon={Save}>
              {canEdit ? (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mutations.updatePlan.mutate({ id: plan.id, data: { ...metaForm, prepared_at: new Date().toISOString() } }, { onSuccess: () => { setMeta(null); toast.success('Plan details saved'); } }); }}>
                  <FormField label="5. Special instructions" hint="Net procedures, tactical call discipline, when to move to the next condition, relay stations">
                    {({ id }) => <Textarea id={id} rows={4} value={metaForm.special_instructions} onChange={(e) => setMeta({ ...metaForm, special_instructions: e.target.value })} />}
                  </FormField>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Prepared by">
                      {({ id }) => <Input id={id} value={metaForm.prepared_by_name} onChange={(e) => setMeta({ ...metaForm, prepared_by_name: e.target.value })} />}
                    </FormField>
                    <FormField label="Position / title">
                      {({ id }) => <Input id={id} value={metaForm.prepared_by_position} onChange={(e) => setMeta({ ...metaForm, prepared_by_position: e.target.value })} placeholder="COML" />}
                    </FormField>
                  </div>
                  <Button type="submit" size="sm" loading={mutations.updatePlan.isPending} disabled={!meta}><Save /> Save details</Button>
                </form>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="whitespace-pre-line">{plan.special_instructions || <span className="text-muted-foreground">No special instructions.</span>}</p>
                  <p className="text-xs text-muted-foreground">Prepared by {plan.prepared_by_name || '—'}{plan.prepared_by_position ? `, ${plan.prepared_by_position}` : ''}</p>
                </div>
              )}
            </Section>
          </div>

          <aside className="space-y-4">
            <Section title="Plan check" icon={warnings.length ? AlertTriangle : CheckCircle2}>
              {warnings.length === 0 ? (
                <p className="inline-flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Primary, alternate and a repeaters-down path are all defined.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {warnings.map(w => <li key={w} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> {w}</li>)}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Published plan version: <strong>v{deployment.plan_version || 1}</strong>{deployment.plan_published_at ? '' : ' (not yet published to operators)'}.</p>
            </Section>
            <Section title="How it is used" icon={Radio}>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li><strong className="text-foreground">Nets</strong>: rows with a net name appear on the packets of positions on that net; rows without a net appear on every packet.</li>
                <li><strong className="text-foreground">Conditions</strong>: Condition 1 prints as the ICS 205 block 4; Conditions 2 and 3 print as extra sections and show on every packet so operators know what to do when a path fails.</li>
                <li><strong className="text-foreground">Library</strong>: manage frequencies once in <Link to={ROUTES.channels} className="underline">Channels</Link>; plans hold a copy so a published plan never changes under an operator.</li>
              </ul>
            </Section>
          </aside>
        </div>
      )}

      <AddChannelsDialog
        open={addOpen}
        channels={library}
        alreadyIn={new Set(rows.map(r => r.channel_id).filter(Boolean))}
        nets={nets}
        onClose={() => setAddOpen(false)}
        onSubmit={(data) => mutations.addChannels.mutate({ planId: plan.id, startOrder: rows.length, ...data }, { onSuccess: () => setAddOpen(false) })}
        submitting={mutations.addChannels.isPending}
      />
      <PublishPlanDialog open={publishOpen} deployment={deployment} onClose={() => setPublishOpen(false)} onPublish={(note) => publish.mutate({ deployment, note }, { onSuccess: () => setPublishOpen(false) })} submitting={publish.isPending} />
      {dialog}
    </QueryState>
  );
}
