import { useMemo } from 'react';
import { usePositions, useShifts, useAssignments, useUsers, useLocations, useItems, useTasks, useOperationalPeriods, useCommsPlans, useCommsPlanChannels, useChannels, useAssets, useObjectives, useSafetyChecklists } from '@/hooks/useEntities';
import { readinessChecklist } from '@/lib/readiness';
import { planChanges } from '@/lib/planDiff';
import { locationsOf, itemsOf } from '@/lib/deployments';
import { tasksInDeployment } from '@/lib/tasks';

/**
 * The readiness checklist for one deployment, from the shared caches.
 * @param {Object|null} deployment
 */
export function useReadiness(deployment) {
  const positionsQ = usePositions();
  const shiftsQ = useShifts();
  const assignmentsQ = useAssignments();
  const usersQ = useUsers();
  const locationsQ = useLocations();
  const itemsQ = useItems();
  const tasksQ = useTasks();
  const periodsQ = useOperationalPeriods();
  const plansQ = useCommsPlans();
  const rowsQ = useCommsPlanChannels();
  const channelsQ = useChannels();
  const assetsQ = useAssets();
  const objectivesQ = useObjectives();
  const safetyQ = useSafetyChecklists();
  const queries = [positionsQ, shiftsQ, assignmentsQ, usersQ, locationsQ, itemsQ, tasksQ, periodsQ, plansQ, rowsQ, channelsQ, assetsQ, objectivesQ, safetyQ];
  const loading = queries.some(q => q.isLoading);
  const result = useMemo(() => {
    if (!deployment || loading) return null;
    const id = deployment.id;
    const byDep = (rows) => (rows ?? []).filter(r => r.deployment_id === id);
    const locations = locationsOf(locationsQ.data ?? [], id);
    const positions = byDep(positionsQ.data), shifts = byDep(shiftsQ.data), assignments = byDep(assignmentsQ.data);
    const changes = deployment.plan_published_at
      ? planChanges({ deployment, positions, shifts, locations, plans: byDep(plansQ.data), planRows: byDep(rowsQ.data), assignments }).changed.length
      : null;
    return readinessChecklist({
      deployment, positions, shifts, assignments, users: usersQ.data ?? [], locations,
      items: itemsOf(itemsQ.data ?? [], locations), tasks: tasksInDeployment(tasksQ.data ?? [], locations),
      periods: byDep(periodsQ.data), planRows: byDep(rowsQ.data), channels: channelsQ.data ?? [], assets: assetsQ.data ?? [], objectives: byDep(objectivesQ.data), safety: (safetyQ.data ?? []).find(c => c.deployment_id === id) ?? null, unpublishedChanges: changes,
    });
  }, [deployment, loading, positionsQ.data, shiftsQ.data, assignmentsQ.data, usersQ.data, locationsQ.data, itemsQ.data, tasksQ.data, periodsQ.data, plansQ.data, rowsQ.data, channelsQ.data, assetsQ.data, objectivesQ.data, safetyQ.data]);
  return { loading, result, queries };
}
