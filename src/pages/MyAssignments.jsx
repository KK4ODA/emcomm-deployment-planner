import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Package, ListTodo, Printer, Radio, MapPin, Play, Check, HandHelping } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { StatCard } from '@/components/common/StatCard';
import { Section } from '@/components/common/Section';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/common/Badges';
import { CallSign } from '@/components/common/CallSign';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useCategories, useItems, useLocations, useTasks, usePositions, useShifts, useAssignments, useObjectives, useUsers, useRealtimeInvalidation, reportMutationError } from '@/hooks/useEntities';
import { useMutation } from '@tanstack/react-query';
import { setObjectiveStatus } from '@/api/assets';
import { hasPermission } from '@/lib/permissions';
import { ObjectiveList } from '@/features/objectives/ObjectiveList';
import { useQueryClient } from '@tanstack/react-query';
import { locationsOf, itemsOf } from '@/lib/deployments';
import { itemsAssignedTo } from '@/lib/assignments';
import { tasksInDeployment, compareOpenTasks } from '@/lib/tasks';
import { canEdit } from '@/lib/permissions';
import { NEXT_TASK_STATUS } from '@/lib/constants';
import { queryKeys } from '@/lib/queryKeys';
import { compareAssignments, openShifts } from '@/lib/staffing';
import { formatDate } from '@/lib/time';
import { updateTaskEvent } from '@/api/taskEvents';
import { setAssignmentStatus, volunteerForShift } from '@/api/assignments';
import { GoKitList, goKitStorageKey } from '@/features/assignments/GoKitList';
import { OfferList } from '@/features/assignments/OfferList';
import { OpenShiftBoard } from '@/features/assignments/OpenShiftBoard';
import { ROUTES } from '@/app/routes';

export default function MyAssignments() {
  return <DeploymentGate><MyAssignmentsContent /></DeploymentGate>;
}

function MyAssignmentsContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const { isOnline } = useOffline();
  const categoriesQ = useCategories();
  const itemsQ = useItems();
  const locationsQ = useLocations();
  const tasksQ = useTasks();
  const positionsQ = usePositions();
  const shiftsQ = useShifts();
  const assignmentsQ = useAssignments();
  const objectivesQ = useObjectives();
  const usersQ = useUsers();
  useRealtimeInvalidation('assignments', queryKeys.assignments);
  const queryClient = useQueryClient();
  const [respondingId, setRespondingId] = useState(/** @type {string|null} */ (null));
  const [takingId, setTakingId] = useState(/** @type {string|null} */ (null));
  const mayAdvance = canEdit(user?.app_role, 'task');

  const locations = useMemo(() => locationsOf(locationsQ.data ?? [], deploymentId), [locationsQ.data, deploymentId]);
  const myPositions = useMemo(() => {
    const shiftById = new Map((shiftsQ.data ?? []).map(s => [s.id, s]));
    const positionById = new Map((positionsQ.data ?? []).map(p => [p.id, p]));
    const siteById = new Map(locations.map(l => [l.id, l]));
    return (assignmentsQ.data ?? [])
      .filter(a => a.user_id === user?.id && a.deployment_id === deploymentId)
      .map(assignment => {
        const shift = shiftById.get(assignment.shift_id);
        const position = shift ? positionById.get(shift.position_id) : null;
        return shift && position ? { assignment, shift, position, site: position.site_id ? siteById.get(position.site_id) ?? null : null } : null;
      })
      .filter(Boolean)
      .sort((a, b) => compareAssignments(a.assignment, b.assignment) || new Date(a.shift.starts_at).getTime() - new Date(b.shift.starts_at).getTime());
  }, [assignmentsQ.data, shiftsQ.data, positionsQ.data, locations, user?.id, deploymentId]);

  const respond = async (assignmentId, status, reason) => {
    setRespondingId(assignmentId);
    try {
      await setAssignmentStatus(assignmentId, status, { reason });
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
      toast.success(status === 'accepted' ? 'Confirmed. The coordinator has been told.' : 'Declined. The coordinator has been told.');
    } catch (err) {
      toast.error(`Could not update: ${err.message || 'unknown error'}`);
    } finally {
      setRespondingId(null);
    }
  };
  const open = useMemo(() => openShifts({
    positions: (positionsQ.data ?? []).filter(p => p.deployment_id === deploymentId),
    shifts: (shiftsQ.data ?? []).filter(s => s.deployment_id === deploymentId),
    assignments: assignmentsQ.data ?? [],
    user,
  }), [positionsQ.data, shiftsQ.data, assignmentsQ.data, user, deploymentId]);
  const shiftPositionName = useMemo(() => {
    const positionById = new Map((positionsQ.data ?? []).map(p => [p.id, p]));
    return new Map((shiftsQ.data ?? []).map(s => [s.id, positionById.get(s.position_id)?.tactical_callsign || positionById.get(s.position_id)?.name || '']));
  }, [positionsQ.data, shiftsQ.data]);
  const take = async (shiftId) => {
    setTakingId(shiftId);
    try {
      await volunteerForShift(shiftId);
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
      toast.success('It is yours. The coordinator has been told.', { description: 'Your packet is under My packet once the plan is published.' });
    } catch (err) {
      toast.error(err?.message || 'Could not take that shift');
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
    } finally {
      setTakingId(null);
    }
  };
  const objectives = useMemo(() => (objectivesQ.data ?? []).filter(o => o.deployment_id === deploymentId && o.status !== 'dropped'), [objectivesQ.data, deploymentId]);
  const usersById = useMemo(() => new Map((usersQ.data ?? []).map(u => [u.id, u])), [usersQ.data]);
  const [objectiveBusy, setObjectiveBusy] = useState(/** @type {string|null} */ (null));
  const objectiveStatus = useMutation({
    mutationFn: (/** @type {{ id: string, status: string }} */ { id, status }) => { setObjectiveBusy(id); return setObjectiveStatus(id, status); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.objectives }),
    onError: reportMutationError('Update objective'),
    onSettled: () => setObjectiveBusy(null),
  });
  const siteName = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations]);
  const categoryById = useMemo(() => new Map((categoriesQ.data ?? []).map(c => [c.id, c])), [categoriesQ.data]);
  const myItems = useMemo(() => itemsAssignedTo(itemsOf(itemsQ.data ?? [], locations), user?.call_sign), [itemsQ.data, locations, user?.call_sign]);
  const myTasks = useMemo(() => tasksInDeployment(tasksQ.data ?? [], locations).filter(t => t.assigned_to_call_sign === user?.call_sign).sort(compareOpenTasks), [tasksQ.data, locations, user?.call_sign]);
  const mySites = locations.filter(l => l.assigned_call_signs?.includes(user?.call_sign));

  const advance = async (task) => {
    const next = NEXT_TASK_STATUS[task.status];
    if (!next) return;
    try {
      await updateTaskEvent(task.id, { status: next }, user, deploymentId, isOnline);
      tasksQ.refetch();
      if (!isOnline) toast.message('Saved locally', { description: 'The change syncs when you are back online.' });
    } catch (err) {
      toast.error(`Could not update task: ${err.message || 'unknown error'}`);
    }
  };

  if (!user?.call_sign) {
    return (
      <EmptyState icon={Radio} title="Set your call sign first" description="Assignments are tied to your call sign. Add it to your profile to see what you are bringing and doing." action={<Button asChild><Link to={ROUTES.profile}>Go to profile</Link></Button>} />
    );
  }

  const openTasks = myTasks.filter(t => t.status !== 'completed').length;
  const offers = myPositions.filter(p => p.assignment.status === 'offered').length;
  const storageKey = goKitStorageKey(deploymentId, user.call_sign);
  const nothing = myItems.length === 0 && myTasks.length === 0 && mySites.length === 0 && myPositions.length === 0 && open.length === 0 && objectives.length === 0;

  return (
    <QueryState queries={[categoriesQ, itemsQ, locationsQ, positionsQ, shiftsQ, assignmentsQ]}>
      <PageHeader
        icon={Package}
        eyebrow={deployment.name}
        title={<span className="flex items-center gap-2">My assignments <CallSign value={user.call_sign} size="md" icon /></span>}
        description="Everything assigned to you in this deployment. Tick items as you pack; print it for your go-kit."
        actions={(myItems.length > 0 || myTasks.length > 0) && <Button variant="outline" className="no-print" onClick={() => window.print()}><Printer /> Print</Button>}
      />

      {nothing ? (
        <EmptyState icon={Package} title="Nothing assigned yet" description="When a coordinator offers you a position, or opens shifts for sign-up, it will show up here. Equipment, tasks and sites assigned to your call sign appear here too." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label={offers ? 'Offers to answer' : 'Positions'} value={offers || myPositions.length} icon={Radio} tone={offers ? 'accent' : 'info'} />
            <StatCard label="Items to bring" value={myItems.length} icon={Package} tone="info" />
            <StatCard label="Open tasks" value={openTasks} icon={ListTodo} tone={openTasks ? 'accent' : 'success'} />
            {open.length > 0 ? <StatCard label="Open shifts" value={open.filter(o => o.canTake).length} icon={HandHelping} tone="accent" hint={`${open.length} open in this deployment`} /> : <StatCard label="Sites" value={mySites.length} icon={MapPin} />}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <OfferList items={myPositions} onRespond={respond} busyId={respondingId} />
              <OpenShiftBoard items={open} siteName={siteName} positionName={shiftPositionName} onTake={take} busyId={takingId} />
              <ObjectiveList objectives={objectives} user={user} isPlanner={false} usersById={usersById} onStatus={hasPermission(user?.app_role, 'CLAIM_OBJECTIVES') ? (id, s) => objectiveStatus.mutate({ id, status: s }) : () => {}} busyId={objectiveBusy} compact title="Objectives" />
              {mySites.length > 0 && (
                <Section title="My sites" icon={MapPin} bodyClassName="p-0">
                  <ul className="divide-y">
                    {mySites.map(s => (
                      <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{s.name}</p>
                          {s.address && <p className="truncate font-mono text-xs text-muted-foreground">{s.address}</p>}
                          {s.contact_person && <p className="text-xs text-muted-foreground">Contact <span className="font-mono">{s.contact_person}</span></p>}
                        </div>
                        <Button asChild variant="outline" size="sm" className="no-print"><Link to={ROUTES.siteTasks(s.id)}>Tasks</Link></Button>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title="My tasks" icon={ListTodo} aside={`${openTasks} open`} bodyClassName="p-0">
                {myTasks.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">No tasks assigned to you.</p> : (
                  <ul className="divide-y">
                    {myTasks.map(t => {
                      const next = NEXT_TASK_STATUS[t.status];
                      const inProgress = t.status === 'in_progress';
                      return (
                        <li key={t.id} className="flex items-start gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <Link to={ROUTES.siteTasks(t.deployment_location_id)} className={`text-sm font-medium hover:underline ${t.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{t.name}</Link>
                              <TaskStatusBadge status={t.status} />
                            </div>
                            {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <TaskPriorityBadge priority={t.priority} />
                              {siteName.get(t.deployment_location_id) && <span>{siteName.get(t.deployment_location_id)}</span>}
                              {t.due_date && <span>· due {formatDate(t.due_date)}</span>}
                            </p>
                          </div>
                          {mayAdvance && next && (
                            <Button size="sm" variant={inProgress ? 'default' : 'outline'} className="no-print h-7 shrink-0 px-2 text-xs" onClick={() => advance(t)} aria-label={`${inProgress ? 'Mark done' : 'Start'}: ${t.name}`}>
                              {inProgress ? <Check /> : <Play />} {inProgress ? 'Done' : 'Start'}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            </div>

            <GoKitList key={storageKey} storageKey={storageKey} items={myItems} categoryById={categoryById} siteName={siteName} />
          </div>
        </>
      )}
    </QueryState>
  );
}
