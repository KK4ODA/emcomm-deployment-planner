import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardList, Plus, Layers, CalendarRange, Users, AlertTriangle, MapPin, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { SearchInput } from '@/components/common/SearchInput';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useLocations, useUsers, usePositions, useShifts, useAssignments, useOperationalPeriods, useRealtimeInvalidation } from '@/hooks/useEntities';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { locationsOf } from '@/lib/deployments';
import { coverageSummary, groupPositionsBySite, shiftCoverage } from '@/lib/staffing';
import { PositionCard } from '@/features/staffing/PositionCard';
import { PositionForm } from '@/features/staffing/PositionForm';
import { BulkPositionsDialog } from '@/features/staffing/BulkPositionsDialog';
import { AssignDialog } from '@/features/staffing/AssignDialog';
import { OperationalPeriodsDialog } from '@/features/staffing/OperationalPeriodsDialog';
import { useStaffingMutations } from '@/features/staffing/useStaffingMutations';
import { PublishPlanDialog } from '@/features/deployments/PublishPlanDialog';
import { usePublishPlan } from '@/features/comms/useCommsMutations';
import { Send } from 'lucide-react';
import { ROUTES } from '@/app/routes';

export default function Staffing() {
  return <DeploymentGate><StaffingContent /></DeploymentGate>;
}

const FILTERS = [
  { id: 'all', label: 'All positions' },
  { id: 'open', label: 'Needs people' },
  { id: 'pending', label: 'Awaiting reply' },
  { id: 'at_risk', label: 'At risk' },
];

function StaffingContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const locationsQ = useLocations();
  const usersQ = useUsers();
  const positionsQ = usePositions();
  const shiftsQ = useShifts();
  const assignmentsQ = useAssignments();
  const periodsQ = useOperationalPeriods();
  useRealtimeInvalidation('positions', queryKeys.positions);
  useRealtimeInvalidation('shifts', queryKeys.shifts);
  useRealtimeInvalidation('assignments', queryKeys.assignments);

  const mutations = useStaffingMutations(deploymentId);
  const { confirm, dialog } = useConfirm();
  const canEdit = hasPermission(user?.app_role, 'MANAGE_ASSIGNMENTS');

  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState(searchParams.get('site') || 'all');
  useEffect(() => { const s = searchParams.get('site'); if (s) setSiteFilter(s); }, [searchParams]);
  const [positionDialog, setPositionDialog] = useState({ open: false, position: null });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [assignFor, setAssignFor] = useState(/** @type {{ position: Object, shift: Object }|null} */ (null));
  const [publishOpen, setPublishOpen] = useState(false);
  const publish = usePublishPlan();

  const sites = useMemo(() => locationsOf(locationsQ.data ?? [], deploymentId), [locationsQ.data, deploymentId]);
  const positions = useMemo(() => (positionsQ.data ?? []).filter(p => p.deployment_id === deploymentId), [positionsQ.data, deploymentId]);
  const shifts = useMemo(() => (shiftsQ.data ?? []).filter(s => s.deployment_id === deploymentId), [shiftsQ.data, deploymentId]);
  const allShifts = shiftsQ.data ?? [];
  const assignments = useMemo(() => (assignmentsQ.data ?? []).filter(a => a.deployment_id === deploymentId), [assignmentsQ.data, deploymentId]);
  const allAssignments = assignmentsQ.data ?? [];
  const periods = useMemo(() => (periodsQ.data ?? []).filter(p => p.deployment_id === deploymentId).sort((a, b) => a.sequence - b.sequence), [periodsQ.data, deploymentId]);
  const users = useMemo(() => (usersQ.data ?? []).filter(u => u.call_sign), [usersQ.data]);
  const usersById = useMemo(() => new Map((usersQ.data ?? []).map(u => [u.id, u])), [usersQ.data]);
  const siteName = useMemo(() => new Map(sites.map(s => [s.id, s.name])), [sites]);
  const positionName = useMemo(() => new Map(positions.map(p => [p.id, p.tactical_callsign || p.name])), [positions]);
  const shiftsByPosition = useMemo(() => {
    const m = new Map();
    for (const s of shifts) { if (!m.has(s.position_id)) m.set(s.position_id, []); m.get(s.position_id).push(s); }
    return m;
  }, [shifts]);

  const summary = useMemo(() => coverageSummary(positions, shifts, assignments, usersById), [positions, shifts, assignments, usersById]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return positions.filter(p => {
      if (siteFilter !== 'all' && (siteFilter === 'none' ? p.site_id : p.site_id !== siteFilter)) return false;
      if (q && ![p.name, p.tactical_callsign, p.net, p.position_type].some(v => v?.toLowerCase().includes(q))) return false;
      if (filter === 'all') return true;
      const states = (shiftsByPosition.get(p.id) ?? []).map(s => shiftCoverage(s, p, assignments, usersById).state);
      if (filter === 'open') return states.includes('open') || states.length === 0;
      return states.includes(filter);
    });
  }, [positions, search, filter, siteFilter, shiftsByPosition, assignments, usersById]);

  const groups = useMemo(() => groupPositionsBySite(visible), [visible]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const savePosition = (data, shiftRows) => {
    const existing = positionDialog.position ? (shiftsByPosition.get(positionDialog.position.id) ?? []) : [];
    const sortOrder = positionDialog.position ? undefined : positions.length;
    mutations.savePosition.mutate(
      { position: positionDialog.position, data: sortOrder === undefined ? data : { ...data, sort_order: sortOrder }, shifts: shiftRows, existingShifts: existing },
      { onSuccess: () => { setPositionDialog({ open: false, position: null }); toast.success(positionDialog.position ? 'Position saved' : 'Position created'); } },
    );
  };

  const deletePosition = async (position) => {
    const live = assignments.filter(a => (shiftsByPosition.get(position.id) ?? []).some(s => s.id === a.shift_id) && ['offered', 'accepted'].includes(a.status)).length;
    const ok = await confirm({
      title: `Delete “${position.name}”?`,
      description: live ? `${live} operator${live === 1 ? ' is' : 's are'} assigned to it. Their assignments will be removed; tell them.` : 'Its shifts are deleted too.',
      destructive: true,
    });
    if (ok) mutations.deletePosition.mutate(position.id);
  };

  const busy = mutations.offer.isPending || mutations.setStatus.isPending || mutations.unassign.isPending;

  return (
    <QueryState queries={[locationsQ, usersQ, positionsQ, shiftsQ, assignmentsQ, periodsQ]}>
      <PageHeader
        icon={ClipboardList}
        eyebrow={deployment.name}
        title="Staffing"
        description="Positions to fill, who has accepted, and where the gaps are"
        actions={canEdit && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setPeriodsOpen(true)}><CalendarRange /> Periods ({periods.length})</Button>
            <Button variant="outline" onClick={() => setBulkOpen(true)}><Layers /> Create several</Button>
            <Button variant="outline" onClick={() => setPositionDialog({ open: true, position: null })}><Plus /> Position</Button>
            {positions.length > 0 && <Button onClick={() => setPublishOpen(true)}><Send /> Publish plan</Button>}
          </>
        )}
      />

      {positions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No positions yet"
          description={canEdit ? 'Add the jobs this deployment must staff: aid stations, SAG vehicles, net control, shadows. Then offer them to operators.' : 'The coordinator has not defined positions for this deployment yet.'}
          action={canEdit && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setPositionDialog({ open: true, position: null })}><Plus /> Add a position</Button>
              <Button variant="outline" onClick={() => setBulkOpen(true)}><Layers /> Create several at once</Button>
            </div>
          )}
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Slots covered" value={<>{summary.covered}<span className="text-sm font-normal text-muted-foreground">/{summary.slots}</span></>} icon={Users} tone={summary.slots && summary.covered === summary.slots ? 'success' : 'accent'} hint={`${summary.positions} positions, ${summary.shifts} shifts`} />
            <StatCard label="Still open" value={summary.open} icon={AlertTriangle} tone={summary.open ? 'critical' : 'success'} onClick={summary.open ? () => setFilter('open') : undefined} hint={summary.open ? 'Click to list' : 'Every slot has someone'} />
            <StatCard label="Awaiting reply" value={summary.pending} icon={Users} tone={summary.pending ? 'warning' : 'neutral'} onClick={summary.pending ? () => setFilter('pending') : undefined} />
            <StatCard label="At risk" value={summary.atRisk} icon={AlertTriangle} tone={summary.atRisk ? 'warning' : 'success'} onClick={summary.atRisk ? () => setFilter('at_risk') : undefined} hint={summary.atRisk ? 'Assigned but missing a requirement' : 'Requirements met'} />
          </div>

          {summary.positionsWithoutShifts > 0 && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs"><AlertTriangle className="h-3.5 w-3.5 text-warning" /> {summary.positionsWithoutShifts} position{summary.positionsWithoutShifts === 1 ? ' has' : 's have'} no shift and cannot be assigned.</p>
          )}

          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search positions, tactical calls, nets…" className="flex-1" />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Coverage filter"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTERS.map(f => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            {sites.length > 0 && (
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Site filter"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  <SelectItem value="none">Mobile / no site</SelectItem>
                  {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing matches" description={filter !== 'all' ? 'No position is in that state. Good.' : 'Try another search.'} />
          ) : (
            <div className="space-y-5">
              {[...groups.entries()].map(([siteId, list]) => (
                <section key={siteId ?? 'none'} aria-label={siteId ? siteName.get(siteId) : 'Mobile positions'}>
                  <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {siteId ? siteName.get(siteId) ?? 'Site' : 'Mobile / no fixed site'}
                    <span className="font-normal">· {list.length}</span>
                  </h2>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {list.map(p => (
                      <PositionCard
                        key={p.id}
                        position={p}
                        shifts={shiftsByPosition.get(p.id) ?? []}
                        assignments={assignments}
                        usersById={usersById}
                        siteName={undefined}
                        supervisorName={p.supervisor_position_id ? positionName.get(p.supervisor_position_id) : undefined}
                        canEdit={canEdit}
                        onEdit={() => setPositionDialog({ open: true, position: p })}
                        onDelete={() => deletePosition(p)}
                        onOpenShift={(shift) => setAssignFor({ position: p, shift })}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {sites.length === 0 && (
            <p className="mt-4 text-xs text-muted-foreground">Tip: add <Link to={ROUTES.sites} className="underline">sites</Link> so positions can carry a map pin, parking and arrival notes into the operator packet.</p>
          )}
        </>
      )}

      <PositionForm
        open={positionDialog.open}
        position={positionDialog.position}
        shifts={positionDialog.position ? shiftsByPosition.get(positionDialog.position.id) ?? [] : []}
        sites={sites}
        positions={positions}
        periods={periods}
        deployment={deployment}
        onClose={() => setPositionDialog({ open: false, position: null })}
        onSubmit={savePosition}
        submitting={mutations.savePosition.isPending}
      />
      <BulkPositionsDialog
        open={bulkOpen}
        periods={periods}
        deployment={deployment}
        onClose={() => setBulkOpen(false)}
        onSubmit={(data) => mutations.bulkCreate.mutate({ ...data, startOrder: positions.length }, { onSuccess: () => setBulkOpen(false) })}
        submitting={mutations.bulkCreate.isPending}
      />
      <OperationalPeriodsDialog
        open={periodsOpen}
        periods={periods}
        deployment={deployment}
        onClose={() => setPeriodsOpen(false)}
        onSave={(row) => mutations.savePeriod.mutateAsync(row)}
        onDelete={(id) => mutations.deletePeriod.mutate(id)}
        busy={mutations.savePeriod.isPending}
      />
      <AssignDialog
        open={!!assignFor}
        position={assignFor?.position ?? null}
        shift={assignFor ? (shifts.find(s => s.id === assignFor.shift.id) ?? assignFor.shift) : null}
        users={users}
        assignments={allAssignments}
        shifts={allShifts}
        onClose={() => setAssignFor(null)}
        onOffer={(userId, status) => mutations.offer.mutate({ shiftId: assignFor.shift.id, userId, createdBy: user?.id, status }, { onSuccess: () => toast.success(status === 'offered' ? 'Offer sent' : 'Assigned') })}
        onSetStatus={(id, status) => mutations.setStatus.mutate({ id, status })}
        onRemove={(id) => mutations.unassign.mutate(id)}
        busy={busy}
      />
      <PublishPlanDialog open={publishOpen} deployment={deployment} onClose={() => setPublishOpen(false)} onPublish={(note) => publish.mutate({ deployment, note }, { onSuccess: () => setPublishOpen(false) })} submitting={publish.isPending} />
      {dialog}
    </QueryState>
  );
}
