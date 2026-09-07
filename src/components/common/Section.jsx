import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Titled panel used to group dashboard content. Denser than Card.
 * @param {{ title: React.ReactNode, icon?: React.ElementType, aside?: React.ReactNode, children: React.ReactNode, className?: string, bodyClassName?: string, id?: string }} props
 */
export function Section({ title, icon: Icon, aside, children, className, bodyClassName, id }) {
  return (
    <section id={id} className={cn('rounded-lg border bg-card shadow-sm', className)}>
      <header className="flex items-center justify-between gap-3 border-b px-3 py-2 sm:px-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
          {title}
        </h2>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </header>
      <div className={cn('p-3 sm:p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
