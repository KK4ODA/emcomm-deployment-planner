import React from 'react';
import { cn } from '@/lib/utils';

const TONES = { neutral: 'bg-primary', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', critical: 'bg-destructive', accent: 'bg-accent' };

/** @param {{ value: number, max?: number, tone?: keyof typeof TONES, className?: string, label?: string }} props */
export function ProgressBar({ value, max = 100, tone = 'info', className, label }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-300', TONES[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
