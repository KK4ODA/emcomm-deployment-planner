import React, { useEffect, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from './ErrorState';
import { PageSkeleton } from './LoadingState';

const SLOW_AFTER_MS = 10_000;

/**
 * Renders loading / error placeholders for one or more React Query results
 * and the children once every query has data. If loading drags on, offers
 * a retry and a reload instead of an endless skeleton.
 *
 * @param {{ queries: Array<{ isLoading: boolean, isError: boolean, error?: unknown, refetch: () => unknown }>, children: React.ReactNode, skeleton?: React.ReactNode, title?: string }} props
 */
export function QueryState({ queries, children, skeleton, title }) {
  const failed = queries.find(q => q.isError);
  const loading = !failed && queries.some(q => q.isLoading);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [loading]);

  if (failed) {
    return (
      <ErrorState
        title={title || 'Could not load this page'}
        error={failed.error}
        onRetry={() => queries.forEach(q => q.refetch())}
      />
    );
  }
  if (loading) {
    return (
      <>
        {slow && (
          <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <span className="min-w-0 flex-1">This is taking longer than usual. The connection may have stalled.</span>
            <Button size="sm" variant="outline" onClick={() => queries.forEach(q => q.refetch())}><RotateCcw /> Try again</Button>
            <Button size="sm" variant="ghost" onClick={() => window.location.reload()}><RefreshCw /> Reload</Button>
          </div>
        )}
        {skeleton ?? <PageSkeleton />}
      </>
    );
  }
  return children;
}
