import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useLocations, useUsers, usePositions, useShifts, useAssignments, useCommsPlans, useCommsPlanChannels, useItems, useOperationalPeriods, useRealtimeInvalidation, useMapLayers, reportMutationError } from '@/hooks/useEntities';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { buildPacket, pickCurrentAssignment } from '@/lib/packet';
import { occupies } from '@/lib/staffing';
import { markPacketSeen } from '@/api/assignments';
import { PacketView } from '@/features/packet/PacketView';
import { PacketMap } from '@/features/packet/PacketMap';
import { CoverageReportDialog } from '@/features/coverage/CoverageReportDialog';
import { RadioTower } from 'lucide-react';
import { db } from '@/api/db';
import { directionsUrl } from '@/lib/packet';
import { PacketActions } from '@/features/packet/PacketActions';
import { useIntents } from '@/hooks/useIntents';
import { ROUTES } from '@/app/routes';
import { formatDateTime } from '@/lib/time';

/**
 * /packet          the signed-in operator's current assignment in this deployment
 * /packet/:id      a specific assignment (planners can open anyone's)
 */
export default function Packet() {
  return <DeploymentGate><PacketContent /></DeploymentGate>;
}

function PacketContent() {
  const { assignmentId } = useParams();
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const queryClient = useQueryClient();
  const locationsQ = useLocations();
  const usersQ = useUsers();
  const positionsQ = usePositions();
  const shiftsQ = useShifts();
  const assignmentsQ = useAssignments();
  const plansQ = useCommsPlans();
  const rowsQ = useCommsPlanChannels();
  const layersQ = useMapLayers();
  const [coverageOpen, setCoverageOpen] = useState(false);
  const logCoverage = useMutation({
    mutationFn: (/** @type {Object} */ data) => db.coverageLog.create({ ...data, ares_group_id: deployment.ares_group_id, deployment_id: deploymentId, reported_by: user.id, occurred_at: new Date().toISOString() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.coverageLog }); setCoverageOpen(false); toast.success('Coverage check recorded. Thank you.'); },
    onError: reportMutationError('Record coverage check'),
  });
  const itemsQ = useItems();
  const periodsQ = useOperationalPeriods();
  useRealtimeInvalidation('assignments', queryKeys.assignments);
  const isPlanner = hasPermission(user?.app_role, 'MANAGE_ASSIGNMENTS');
  const [acking, setAcking] = useState(false);
  const [pickedId, setPickedId] = useState('');
  const { intents } = useIntents();

  const shiftById = useMemo(() => new Map((shiftsQ.data ?? []).map(s => [s.id, s])), [shiftsQ.data]);
  const mine = useMemo(() => (assignmentsQ.data ?? []).filter(a => a.deployment_id === deploymentId && a.user_id === user?.id), [assignmentsQ.data, deploymentId, user?.id]);

  const assignment = useMemo(() => {
    if (assignmentId) return (assignmentsQ.data ?? []).find(a => a.id === assignmentId) ?? null;
    if (pickedId) return mine.find(a => a.id === pickedId) ?? null;
    return pickCurrentAssignment(mine, shiftById);
  }, [assignmentId, pickedId, mine, assignmentsQ.data, shiftById]);

  const packet = useMemo(() => {
    if (!assignment) return null;
    const shift = shiftById.get(assignment.shift_id);
    const position = (positionsQ.data ?? []).find(p => p.id === shift?.position_id);
    if (!shift || !position) return null;
    const users = usersQ.data ?? [];
    const site = position.site_id ? (locationsQ.data ?? []).find(l => l.id === position.site_id) ?? null : null;
    const supervisorPosition = position.supervisor_position_id ? (positionsQ.data ?? []).find(p => p.id === position.supervisor_position_id) ?? null : null;
    const peopleOn = (pos) => {
      if (!pos) return [];
      const ids = new Set((shiftsQ.data ?? []).filter(s => s.position_id === pos.id).map(s => s.id));
      const userIds = new Set((assignmentsQ.data ?? []).filter(a => ids.has(a.shift_id) && occupies(a.status)).map(a => a.user_id));
      return users.filter(u => userIds.has(u.id));
    };
    const ncsPositions = (positionsQ.data ?? []).filter(p => p.deployment_id === deploymentId && p.position_type === 'net_control' && p.id !== position.id);
    const ncsUsers = ncsPositions.flatMap(peopleOn);
    const plan = (plansQ.data ?? []).filter(p => p.deployment_id === deploymentId).find(p => !p.operational_period_id || p.operational_period_id === shift.operational_period_id) ?? (plansQ.data ?? []).find(p => p.deployment_id === deploymentId) ?? null;
    const planRows = plan ? (rowsQ.data ?? []).filter(r => r.comms_plan_id === plan.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : [];
    const period = shift.operational_period_id ? (periodsQ.data ?? []).find(p => p.id === shift.operational_period_id) ?? null : null;
    return buildPacket({
      assignment, shift, position, deployment, site, supervisorPosition,
      supervisorUsers: peopleOn(supervisorPosition), ncsUsers, planRows, items: site ? (itemsQ.data ?? []).filter(i => i.deployment_location_id === site.id) : [], period,
    });
  }, [assignment, shiftById, positionsQ.data, usersQ.data, locationsQ.data, shiftsQ.data, assignmentsQ.data, plansQ.data, rowsQ.data, itemsQ.data, periodsQ.data, deployment, deploymentId]);

  const acknowledge = async () => {
    setAcking(true);
    try {
      await markPacketSeen(assignment.id, deployment.plan_version || 1);
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
    } catch (err) {
      toast.error(`Could not save: ${err.message || 'unknown error'}`);
    } finally {
      setAcking(false);
    }
  };

  const asOf = assignmentsQ.dataUpdatedAt ? new Date(assignmentsQ.dataUpdatedAt) : null;
  const isMine = assignment?.user_id === user?.id;

  return (
    <QueryState queries={[locationsQ, usersQ, positionsQ, shiftsQ, assignmentsQ, plansQ, rowsQ, itemsQ, periodsQ]}>
      {!assignment || !packet ? (
        <EmptyState
          icon={FileText}
          title={assignmentId ? 'Assignment not found' : 'No assignment yet'}
          description={assignmentId ? 'It may have been removed or belongs to another deployment.' : 'When a coordinator assigns you a position in this deployment, your packet appears here with where to go, when, and which frequency to use.'}
          action={<Button asChild variant="outline"><Link to={isPlanner ? ROUTES.staffing : ROUTES.myAssignments}>{isPlanner ? 'Open staffing' : 'My assignments'}</Link></Button>}
        />
      ) : (
        <>
          {!assignmentId && mine.filter(a => occupies(a.status)).length > 1 && (
            <div className="no-print mx-auto mb-3 max-w-2xl">
              <Select value={assignment.id} onValueChange={setPickedId}>
                <SelectTrigger className="w-full" aria-label="Which assignment"><ChevronDown className="h-4 w-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  {mine.filter(a => occupies(a.status)).map(a => {
                    const s = shiftById.get(a.shift_id);
                    const pos = (positionsQ.data ?? []).find(p => p.id === s?.position_id);
                    return <SelectItem key={a.id} value={a.id}>{pos?.name ?? 'Position'} · {s ? formatDateTime(s.starts_at, 'EEE HH:mm') : ''}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          {!isMine && <p className="no-print mx-auto mb-3 max-w-2xl rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm">You are viewing another operator's packet ({(usersQ.data ?? []).find(u => u.id === assignment.user_id)?.call_sign ?? 'unknown'}). This is what they see.</p>}
          <PacketView
            packet={packet}
            asOf={asOf}
            onAcknowledge={isMine ? acknowledge : undefined}
            acknowledging={acking}
            actions={isMine && ['accepted', 'checked_in', 'on_position', 'released'].includes(assignment.status) ? <PacketActions assignment={assignment} intents={intents} /> : null}
            statusLine={isMine && assignment.status === 'offered' ? <>You have not answered this offer yet. <Link to={ROUTES.myAssignments} className="underline">Accept or decline</Link>.</> : null}
            map={<PacketMap site={packet.site} layers={(layersQ.data ?? []).filter(l => l.deployment_id === deploymentId)} directions={directionsUrl(packet.site)} />}
            coverageAction={isMine && hasPermission(user?.app_role, 'LOG_COVERAGE') ? <Button variant="outline" size="sm" onClick={() => setCoverageOpen(true)}><RadioTower /> Report a coverage check</Button> : null}
          />
          <CoverageReportDialog
            open={coverageOpen}
            onClose={() => setCoverageOpen(false)}
            channels={[1, 2, 3].flatMap(l => packet.channelsByCondition[l] ?? [])}
            defaultFromSiteId={packet.site?.id ?? null}
            defaultToSiteId={(positionsQ.data ?? []).find(p => p.deployment_id === deploymentId && p.position_type === 'net_control' && p.site_id)?.site_id ?? null}
            defaultToLabel="Net control"
            lockEnds
            onSubmit={(data) => logCoverage.mutate(data)}
            submitting={logCoverage.isPending}
          />
        </>
      )}
    </QueryState>
  );
}
