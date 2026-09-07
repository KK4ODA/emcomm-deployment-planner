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

export function useIcs205Forms() {
  return useQuery({ queryKey: queryKeys.ics205Forms, queryFn: () => db.ics205Forms.list() });
}

export function useAresGroups(options = {}) {
  return useQuery({ queryKey: queryKeys.aresGroups, queryFn: () => db.aresGroups.list({ orderBy: 'name' }), ...options });
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
