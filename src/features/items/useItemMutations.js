import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { useEntityMutations, reportMutationError } from '@/hooks/useEntities';
import { stripReadOnly } from '@/api/db';

/** Category CRUD scoped to a deployment. */
export function useCategoryMutations() {
  return useEntityMutations('categories', queryKeys.categories, { label: 'category' });
}

/** Item CRUD plus duplicate and reorder helpers. */
export function useItemMutations() {
  const base = useEntityMutations('items', queryKeys.items, { label: 'item' });
  const queryClient = useQueryClient();

  const duplicate = useMutation({
    mutationFn: (/** @type {Object} */ item) => {
      const copy = stripReadOnly(item);
      return db.items.create({ ...copy, name: `${item.name} (Copy)`, assigned_to: [] });
    },
    onSuccess: base.invalidate,
    onError: reportMutationError('Duplicate item'),
  });

  /**
   * Persist a new order for a list of rows. The cache is updated first so the
   * drag feels instant; a failure refetches and reports.
   * @param {'categories'|'items'} repoName
   * @param {readonly unknown[]} queryKey
   */
  const useReorderMutation = (repoName, queryKey) => useMutation({
    /** @param {Array<{ id: string }>} ordered */
    mutationFn: async (ordered) => {
      await Promise.all(ordered.map((row, index) => db[repoName].update(row.id, { sort_order: index })));
    },
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      const orderIndex = new Map(ordered.map((row, index) => [row.id, index]));
      queryClient.setQueryData(queryKey, (/** @type {any[]} */ old = []) =>
        old.map(row => (orderIndex.has(row.id) ? { ...row, sort_order: orderIndex.get(row.id) } : row)));
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      reportMutationError('Reorder')(err);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  /** Give every listed item to one operator (replaces existing assignees). */
  const bulkAssign = useMutation({
    mutationFn: async (/** @type {{ items: Array<{ id: string }>, callSign: string }} */ { items, callSign }) => {
      await Promise.all(items.map(item => db.items.update(item.id, { assigned_to: [callSign] })));
      return items.length;
    },
    onSuccess: base.invalidate,
    onError: reportMutationError('Assign items'),
  });

  return {
    ...base,
    duplicate,
    bulkAssign,
    reorderItems: useReorderMutation('items', queryKeys.items),
    reorderCategories: useReorderMutation('categories', queryKeys.categories),
  };
}
