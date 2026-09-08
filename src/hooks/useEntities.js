import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { listTasksLocal, TASKS_UPDATED_EVENT } from '@/api/taskEvents';
import { listMemberships } from '@/api/memberships';

// ─── Reads ────────────────────────────────────────────────────────────────────

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: () => db.users.list({ orderBy: 'full_name' }) });
}

export function useDeployments() {
  return useQuery({
    queryKey: queryKeys.deployments,
    queryFn: () => db.deployments.list({ orderBy: 'created_at', ascending: false }),
  });
}

export function useDeployment(id) {
  return useQuery({
    queryKey: queryKeys.deployment(id),
    queryFn: () => db.deployments.findById(id),
    enabled: !!id,
  });
}

export function useLocations() {
  return useQuery({ queryKey: queryKeys.locations, queryFn: () => db.locations.list({ orderBy: 'sort_order' }) });
}

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: () => db.categories.list({ orderBy: 'sort_order' }) });
}

export function useItems() {
  return useQuery({ queryKey: queryKeys.items, queryFn: () => db.items.list({ orderBy: 'sort_order' }) });
}

export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: () => db.templates.list({ orderBy: 'created_at', ascending: false }),
  });
}

export function useAresGroups(options = {}) {
  return useQuery({ queryKey: queryKeys.aresGroups, queryFn: () => db.aresGroups.list({ orderBy: 'name' }), ...options });
}

// ─── Staffing ────────────────────────────────────────────────────────────────

export function useOperationalPeriods() {
  return useQuery({ queryKey: queryKeys.operationalPeriods, queryFn: () => db.operationalPeriods.list({ orderBy: 'starts_at' }) });
}
export function usePositions() {
  return useQuery({ queryKey: queryKeys.positions, queryFn: () => db.positions.list({ orderBy: 'sort_order' }) });
}
export function useShifts() {
  return useQuery({ queryKey: queryKeys.shifts, queryFn: () => db.shifts.list({ orderBy: 'starts_at' }) });
}
export function useAssignments() {
  return useQuery({ queryKey: queryKeys.assignments, queryFn: () => db.assignments.list({ orderBy: 'offered_at' }) });
}

// ─── Communications ───────────────────────────────────────────────────────────

export function useChannels() {
  return useQuery({ queryKey: queryKeys.channels, queryFn: () => db.channels.list({ orderBy: 'sort_order' }) });
}
export function useCommsPlans() {
  return useQuery({ queryKey: queryKeys.commsPlans, queryFn: () => db.commsPlans.list({ orderBy: 'created_at' }) });
}
export function useCommsPlanChannels() {
  return useQuery({ queryKey: queryKeys.commsPlanChannels, queryFn: () => db.commsPlanChannels.list({ orderBy: 'sort_order' }) });
}

// ─── Operations record ────────────────────────────────────────────────────────

export function useActivityLog(deploymentId) {
  return useQuery({
    queryKey: [...queryKeys.activityLog, deploymentId],
    queryFn: () => db.activityLog.where({ deployment_id: deploymentId }, { orderBy: 'occurred_at', ascending: false }),
    enabled: !!deploymentId,
  });
}
export function useFeedback(deploymentId) {
  return useQuery({
    queryKey: [...queryKeys.feedback, deploymentId],
    queryFn: () => db.feedback.where({ deployment_id: deploymentId }, { orderBy: 'created_at' }),
    enabled: !!deploymentId,
  });
}
export function useAssets() {
  return useQuery({ queryKey: queryKeys.assets, queryFn: () => db.assets.list({ orderBy: 'name' }) });
}
/** Custody history of one asset, newest first. */
export function useAssetCustody(assetId) {
  return useQuery({ queryKey: [...queryKeys.assetCustody, assetId], queryFn: () => db.assetCustody.where({ asset_id: assetId }, { orderBy: 'at', ascending: false }), enabled: !!assetId });
}
export function useObjectives() {
  return useQuery({ queryKey: queryKeys.objectives, queryFn: () => db.objectives.list({ orderBy: 'sort_order' }) });
}
export function useCoverageLog() {
  return useQuery({ queryKey: queryKeys.coverageLog, queryFn: () => db.coverageLog.list({ orderBy: 'occurred_at', ascending: false }) });
}
export function useSafetyChecklists() {
  return useQuery({ queryKey: queryKeys.safetyChecklists, queryFn: () => db.safetyChecklists.list({ orderBy: 'created_at' }) });
}
export function useNamingSchemes() {
  return useQuery({ queryKey: queryKeys.namingSchemes, queryFn: () => db.namingSchemes.list({ orderBy: 'sort_order' }) });
}
export function useMapLayers() {
  return useQuery({ queryKey: queryKeys.mapLayers, queryFn: () => db.mapLayers.list({ orderBy: 'sort_order' }) });
}
export function useLessons() {
  return useQuery({ queryKey: queryKeys.lessons, queryFn: () => db.lessons.list({ orderBy: 'created_at', ascending: false }) });
}
export function useHourEntries() {
  return useQuery({ queryKey: queryKeys.hourEntries, queryFn: () => db.hourEntries.list({ orderBy: 'occurred_on', ascending: false }) });
}

/** Group membership rows visible to the caller (own, same-group, or all for admins). */
export function useMemberships(options = {}) {
  return useQuery({ queryKey: queryKeys.memberships, queryFn: listMemberships, ...options });
}

export function useNotifications(email) {
  return useQuery({
    queryKey: queryKeys.notifications(email),
    queryFn: () => db.notifications.where({ user_email: email }, { orderBy: 'created_at', ascending: false }),
    enabled: !!email,
  });
}

/**
 * Tasks come from the IndexedDB materialised view maintained by the event
 * log, so they are available offline. The sync engine dispatches a window
 * event when remote events are applied; we invalidate on it.
 */
export function useTasks() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
    window.addEventListener(TASKS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(TASKS_UPDATED_EVENT, handler);
  }, [queryClient]);
  return useQuery({ queryKey: queryKeys.tasks, queryFn: listTasksLocal, staleTime: 0 });
}

/**
 * Invalidate a query whenever a table changes on the server (Supabase Realtime).
 * @param {keyof typeof db} repoName
 * @param {readonly unknown[]} queryKey
 */
export function useRealtimeInvalidation(repoName, queryKey, enabled = true) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    return db[repoName].subscribe(() => queryClient.invalidateQueries({ queryKey }));
  }, [repoName, queryClient, enabled, JSON.stringify(queryKey)]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export function reportMutationError(label) {
  return (err) => {
    console.error(`${label} failed:`, err);
    toast.error(`${label} failed: ${err?.message || 'unknown error'}`);
  };
}

/**
 * Standard create/update/remove mutations for a repository. Each invalidates
 * the given query key on success and toasts on error.
 *
 * @param {keyof typeof db} repoName
 * @param {readonly unknown[]} queryKey
 * @param {{ label: string, extraKeys?: readonly unknown[][] }} options
 */
export function useEntityMutations(repoName, queryKey, { label, extraKeys = [] }) {
  const queryClient = useQueryClient();
  const repo = db[repoName];
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    for (const key of extraKeys) queryClient.invalidateQueries({ queryKey: key });
  };

  const create = useMutation({
    mutationFn: (/** @type {Object} */ data) => repo.create(data),
    onSuccess: invalidate,
    onError: reportMutationError(`Create ${label}`),
  });
  const update = useMutation({
    /** @param {{ id: string, data: Object }} vars */
    mutationFn: ({ id, data }) => repo.update(id, data),
    onSuccess: invalidate,
    onError: reportMutationError(`Update ${label}`),
  });
  const remove = useMutation({
    mutationFn: (/** @type {string} */ id) => repo.remove(id),
    onSuccess: invalidate,
    onError: reportMutationError(`Delete ${label}`),
  });

  return { create, update, remove, invalidate };
}
