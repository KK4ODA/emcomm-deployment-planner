import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from '@/api/db';
import { offerAssignment, removeAssignment, setAssignmentStatus } from '@/api/assignments';
import { reportMutationError } from '@/hooks/useEntities';
import { queryKeys } from '@/lib/queryKeys';
import { expandPattern } from '@/lib/staffing';

const STAFFING_KEYS = [queryKeys.positions, queryKeys.shifts, queryKeys.assignments, queryKeys.operationalPeriods];

/** Shift rows as edited in the form: { id?, starts_at, ends_at, muster_at, headcount, operational_period_id, notes }. */
function cleanShift(s, positionId, deploymentId) {
  return {
    position_id: positionId,
    deployment_id: deploymentId,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    muster_at: s.muster_at || null,
    headcount: s.headcount ? Number(s.headcount) : null,
    operational_period_id: s.operational_period_id || null,
    notes: s.notes || null,
  };
}

/**
 * Mutations for positions, shifts, assignments and operational periods.
 * Every success invalidates all staffing caches; errors toast.
 * @param {string} deploymentId
 */
export function useStaffingMutations(deploymentId) {
  const queryClient = useQueryClient();
  const invalidate = () => { for (const key of STAFFING_KEYS) queryClient.invalidateQueries({ queryKey: key }); };

  /** Create or update a position together with its shift list. */
  const savePosition = useMutation({
    mutationFn: async (/** @type {{ position: Object|null, data: Object, shifts: Object[], existingShifts: Object[] }} */ { position, data, shifts, existingShifts }) => {
      const payload = { ...data, deployment_id: deploymentId };
      const saved = position ? await db.positions.update(position.id, payload) : await db.positions.create(payload);
      const keep = new Set(shifts.filter(s => s.id).map(s => s.id));
      for (const old of existingShifts) if (!keep.has(old.id)) await db.shifts.remove(old.id);
      for (const s of shifts) {
        const row = cleanShift(s, saved.id, deploymentId);
        if (s.id) await db.shifts.update(s.id, row);
        else await db.shifts.create(row);
      }
      return saved;
    },
    onSuccess: invalidate,
    onError: reportMutationError('Save position'),
  });

  const deletePosition = useMutation({
    mutationFn: (/** @type {string} */ id) => db.positions.remove(id),
    onSuccess: () => { invalidate(); toast.success('Position deleted'); },
    onError: reportMutationError('Delete position'),
  });

  /** Create N positions from a name pattern, each with the same shift template. */
  const bulkCreate = useMutation({
    mutationFn: async (/** @type {{ pattern: string, tacticalPattern: string, numbers: number[], base: Object, shifts: Object[], startOrder: number }} */ { pattern, tacticalPattern, numbers, base, shifts, startOrder }) => {
      const names = expandPattern(pattern, numbers);
      const tacs = tacticalPattern ? expandPattern(tacticalPattern, numbers) : names.map(() => null);
      let created = 0;
      for (let i = 0; i < names.length; i++) {
        const pos = await db.positions.create({ ...base, deployment_id: deploymentId, name: names[i], tactical_callsign: tacs[i], sort_order: startOrder + i });
        for (const s of shifts) await db.shifts.create(cleanShift(s, pos.id, deploymentId));
        created += 1;
      }
      return created;
    },
    onSuccess: (n) => { invalidate(); toast.success(`${n} position${n === 1 ? '' : 's'} created`); },
    onError: reportMutationError('Create positions'),
  });

  const offer = useMutation({
    mutationFn: (/** @type {{ shiftId: string, userId: string, createdBy?: string|null, status?: 'offered'|'accepted' }} */ args) =>
      offerAssignment({ ...args, deploymentId }),
    onSuccess: invalidate,
    onError: reportMutationError('Assign operator'),
  });

  const setStatus = useMutation({
    mutationFn: (/** @type {{ id: string, status: any, reason?: string, notes?: string }} */ { id, status, reason, notes }) => setAssignmentStatus(id, status, { reason, notes }),
    onSuccess: invalidate,
    onError: reportMutationError('Update assignment'),
  });

  const unassign = useMutation({
    mutationFn: (/** @type {string} */ id) => removeAssignment(id),
    onSuccess: invalidate,
    onError: reportMutationError('Remove assignment'),
  });

  const savePeriod = useMutation({
    mutationFn: (/** @type {{ id?: string, data: Object }} */ { id, data }) =>
      id ? db.operationalPeriods.update(id, data) : db.operationalPeriods.create({ ...data, deployment_id: deploymentId }),
    onSuccess: invalidate,
    onError: reportMutationError('Save operational period'),
  });

  const deletePeriod = useMutation({
    mutationFn: (/** @type {string} */ id) => db.operationalPeriods.remove(id),
    onSuccess: invalidate,
    onError: reportMutationError('Delete operational period'),
  });

  return { savePosition, deletePosition, bulkCreate, offer, setStatus, unassign, savePeriod, deletePeriod, invalidate };
}
