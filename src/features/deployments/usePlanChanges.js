import { useMemo } from 'react';
import { usePositions, useShifts, useLocations, useCommsPlans, useCommsPlanChannels, useAssignments } from '@/hooks/useEntities';
import { planChanges } from '@/lib/planDiff';

/**
 * Diff of every position's packet against what was published last time.
 * @param {Object|null} deployment
 */
export function usePlanChanges(deployment) {
  const positionsQ = usePositions();
  const shiftsQ = useShifts();
  const locationsQ = useLocations();
  const plansQ = useCommsPlans();
  const rowsQ = useCommsPlanChannels();
  const assignmentsQ = useAssignments();
  const loading = [positionsQ, shiftsQ, locationsQ, plansQ, rowsQ, assignmentsQ].some(q => q.isLoading);
  const result = useMemo(() => {
    if (!deployment || loading) return null;
    return planChanges({
      deployment,
      positions: positionsQ.data ?? [], shifts: shiftsQ.data ?? [], locations: locationsQ.data ?? [],
      plans: plansQ.data ?? [], planRows: rowsQ.data ?? [], assignments: assignmentsQ.data ?? [],
    });
  }, [deployment, loading, positionsQ.data, shiftsQ.data, locationsQ.data, plansQ.data, rowsQ.data, assignmentsQ.data]);
  return { loading, result };
}
