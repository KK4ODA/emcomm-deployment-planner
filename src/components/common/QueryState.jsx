import React from 'react';
import { ErrorState } from './ErrorState';
import { PageSkeleton } from './LoadingState';

/**
 * Renders loading / error placeholders for one or more React Query results
 * and the children once every query has data.
 *
 * @param {{ queries: Array<{ isLoading: boolean, isError: boolean, error?: unknown, refetch: () => unknown }>, children: React.ReactNode, skeleton?: React.ReactNode, title?: string }} props
 */
export function QueryState({ queries, children, skeleton, title }) {
  const failed = queries.find(q => q.isError);
  if (failed) {
    return (
      <ErrorState
        title={title || 'Could not load this page'}
        error={failed.error}
        onRetry={() => queries.forEach(q => q.refetch())}
      />
    );
  }
  if (queries.some(q => q.isLoading)) return skeleton ?? <PageSkeleton />;
  return children;
}
