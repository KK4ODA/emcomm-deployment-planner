import React from 'react';
import { RadioTower } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/constants';

/** Logo mark + word mark. `compact` shows only the mark. */
/** @param {{ compact?: boolean, className?: string, light?: boolean }} props */
export function Brand({ compact = false, className, light = false }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-sm">
        <RadioTower className="h-4.5 w-4.5" strokeWidth={2.25} aria-hidden />
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className={cn('block truncate text-sm font-semibold tracking-tight', light ? 'text-white' : 'text-foreground')}>{APP_NAME}</span>
          <span className={cn('block truncate text-[10px] font-medium uppercase tracking-[0.14em]', light ? 'text-white/60' : 'text-muted-foreground')}>ARES deployment planning</span>
        </span>
      )}
    </span>
  );
}
