import React from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  neutral: 'text-muted-foreground bg-muted',
  info: 'text-info bg-info/10',
  success: 'text-success bg-success/10',
  warning: 'text-warning bg-warning/10',
  critical: 'text-destructive bg-destructive/10',
  accent: 'text-accent bg-accent/10',
};

/**
 * Compact metric tile. Renders as a button when `onClick` is given.
 * @param {{
 *   label: string, value: React.ReactNode, hint?: React.ReactNode, icon?: React.ElementType,
 *   tone?: keyof typeof TONES, onClick?: () => void, className?: string
 * }} props
 */
export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral', onClick, className }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-sm',
        onClick && 'transition-colors hover:border-accent/60 hover:bg-muted/40',
        className,
      )}
    >
      {Icon && (
        <div className={cn('rounded-md p-2', TONES[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      )}
      <div className="min-w-0">
        <p className="tnum text-xl font-semibold leading-none">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground/80">{hint}</p>}
      </div>
    </Comp>
  );
}
