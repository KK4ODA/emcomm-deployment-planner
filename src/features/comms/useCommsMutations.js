import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from '@/api/db';
import { publishPlan } from '@/api/plans';
import { reportMutationError } from '@/hooks/useEntities';
import { queryKeys } from '@/lib/queryKeys';
import { snapshotFromChannel } from '@/lib/comms';

const KEYS = [queryKeys.channels, queryKeys.commsPlans, queryKeys.commsPlanChannels];

/** Channel library CRUD (per ARES group). */
export function useChannelMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.channels });
  const save = useMutation({
    mutationFn: (/** @type {{ id?: string, data: Object }} */ { id, data }) => (id ? db.channels.update(id, data) : db.channels.create(data)),
    onSuccess: invalidate,
    onError: reportMutationError('Save channel'),
  });
  const remove = useMutation({
    mutationFn: (/** @type {string} */ id) => db.channels.remove(id),
    onSuccess: () => { invalidate(); toast.success('Channel deleted'); },
    onError: reportMutationError('Delete channel'),
  });
  const setActive = useMutation({
    mutationFn: (/** @type {{ id: string, active: boolean }} */ { id, active }) => db.channels.update(id, { active }),
    onSuccess: invalidate,
    onError: reportMutationError('Update channel'),
  });
  return { save, remove, setActive };
}

/**
 * Communications plan mutations for one deployment.
 * @param {string} deploymentId
 */
export function useCommsPlanMutations(deploymentId) {
  const queryClient = useQueryClient();
  const invalidate = () => { for (const key of KEYS) queryClient.invalidateQueries({ queryKey: key }); };

  const createPlan = useMutation({
    mutationFn: (/** @type {{ operational_period_id?: string|null, name?: string, prepared_by_name?: string }} */ data = {}) =>
      db.commsPlans.create({ deployment_id: deploymentId, name: data.name || 'Communications plan', operational_period_id: data.operational_period_id || null, prepared_by_name: data.prepared_by_name || null, prepared_at: new Date().toISOString() }),
    onSuccess: invalidate,
    onError: reportMutationError('Create communications plan'),
  });

  const updatePlan = useMutation({
    mutationFn: (/** @type {{ id: string, data: Object }} */ { id, data }) => db.commsPlans.update(id, data),
    onSuccess: invalidate,
    onError: reportMutationError('Save communications plan'),
  });

  /** Add library channels to a plan as snapshots. */
  const addChannels = useMutation({
    mutationFn: async (/** @type {{ planId: string, channels: Object[], condition_level: number, path_role: string, startOrder: number, net?: string, func?: string }} */ { planId, channels, condition_level, path_role, startOrder, net, func }) => {
      let order = startOrder;
      for (const ch of channels) {
        await db.commsPlanChannels.create({
          comms_plan_id: planId, deployment_id: deploymentId, sort_order: order++,
          ...snapshotFromChannel(ch),
          condition_level, path_role, net: net || null, function: func || (ch.config === 'phone' ? 'Phone' : 'Tactical'),
        });
      }
      return channels.length;
    },
    onSuccess: (n) => { invalidate(); toast.success(`${n} channel${n === 1 ? '' : 's'} added to the plan`); },
    onError: reportMutationError('Add channels'),
  });

  const updateRow = useMutation({
    mutationFn: (/** @type {{ id: string, data: Object }} */ { id, data }) => db.commsPlanChannels.update(id, data),
    onSuccess: invalidate,
    onError: reportMutationError('Update channel'),
  });

  const removeRow = useMutation({
    mutationFn: (/** @type {string} */ id) => db.commsPlanChannels.remove(id),
    onSuccess: invalidate,
    onError: reportMutationError('Remove channel'),
  });

  /** Re-copy the library values into a plan row. */
  const syncRow = useMutation({
    mutationFn: (/** @type {{ row: Object, channel: Object }} */ { row, channel }) => db.commsPlanChannels.update(row.id, snapshotFromChannel(channel)),
    onSuccess: () => { invalidate(); toast.success('Updated from the library'); },
    onError: reportMutationError('Update from library'),
  });

  const reorder = useMutation({
    mutationFn: async (/** @type {Array<{ id: string }>} */ ordered) => {
      await Promise.all(ordered.map((r, i) => db.commsPlanChannels.update(r.id, { sort_order: i })));
    },
    onSuccess: invalidate,
    onError: reportMutationError('Reorder'),
  });

  return { createPlan, updatePlan, addChannels, updateRow, removeRow, syncRow, reorder, invalidate };
}

/** Bump the deployment's plan version with a note; the database notifies assigned operators. */
export function usePublishPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (/** @type {{ deployment: Object, note: string, changes?: Object[], notifyAll?: boolean }} */ { deployment, note, changes = [], notifyAll = false }) =>
      publishPlan({ deploymentId: deployment.id, note, changes, notifyAll }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
      queryClient.invalidateQueries({ queryKey: queryKeys.positions });
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
      toast.success(`Plan v${r.version} published`, { description: r.notified ? `${r.notified} operator${r.notified === 1 ? '' : 's'} notified.` : 'Nobody needed a notification.' });
    },
    onError: reportMutationError('Publish plan'),
  });
}
