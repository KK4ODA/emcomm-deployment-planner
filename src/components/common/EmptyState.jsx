import React from 'react';
import { cn } from '@/lib/utils';

/**
 * @param {{ icon?: React.ElementType, title: string, description?: React.ReactNode, action?: React.ReactNode, className?: string, compact?: boolean }} props
 */
export function EmptyState({ icon: Icon, title, description, action, className, compact = false }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center rounded-lg border border-dashed bg-card/50', compact ? 'p-6' : 'p-10 sm:p-14', className)}>
      {Icon && (
        <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
          <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} aria-hidden />
        </div>
      )}
      <h3 className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
