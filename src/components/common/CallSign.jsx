import React from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Monospace call sign chip. Use everywhere a call sign is displayed so
 * operators can scan for them quickly.
 * @param {{ value: string, icon?: boolean, size?: 'sm'|'md', className?: string, muted?: boolean }} props
 */
export function CallSign({ value, icon = false, size = 'sm', className, muted = false }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border font-mono font-semibold tracking-wide',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-sm',
        muted ? 'border-border bg-muted text-muted-foreground' : 'border-primary/20 bg-primary/5 text-primary dark:bg-primary/10',
        className,
      )}
    >
      {icon && <Radio className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />}
      {value}
    </span>
  );
}

/** @param {{ values: string[], max?: number, className?: string }} props */
export function CallSignList({ values, max = 6, className }) {
  const list = values.filter(Boolean);
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {shown.map(cs => <CallSign key={cs} value={cs} />)}
      {rest > 0 && <span className="text-xs text-muted-foreground">+{rest}</span>}
    </span>
  );
}
