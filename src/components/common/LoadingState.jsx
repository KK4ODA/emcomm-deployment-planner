import React from 'react';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Whole-viewport spinner used while auth or a lazy route resolves. */
export function FullScreenLoader({ label = 'Loading' }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

/** @param {{ label?: string, className?: string }} props */
export function InlineSpinner({ label, className }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)} role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

/** Generic page-level placeholder: header line + a few card blocks. */
export function PageSkeleton({ cards = 3 }) {
  return (
    <div className="space-y-4 animate-fade-in" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}

/** Rows placeholder for lists and tables. */
export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
