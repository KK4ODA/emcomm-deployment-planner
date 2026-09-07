import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Consistent page heading: optional back link, eyebrow, title, description,
 * and a right-aligned action area that wraps under the title on small screens.
 *
 * @param {{
 *   title: React.ReactNode, description?: React.ReactNode, eyebrow?: React.ReactNode,
 *   backTo?: string, backLabel?: string, actions?: React.ReactNode, icon?: React.ElementType, className?: string
 * }} props
 */
export function PageHeader({ title, description, eyebrow, backTo, backLabel = 'Back', actions, icon: Icon, className }) {
  return (
    <header className={cn('mb-4 sm:mb-5', className)}>
      {backTo && (
        <Link to={backTo} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div className="mt-0.5 hidden rounded-md bg-primary p-2 text-primary-foreground sm:block">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>}
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
      </div>
    </header>
  );
}
