import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        info: 'border-info/30 bg-info/10 text-info',
        success: 'border-success/30 bg-success/10 text-success',
        warning: 'border-warning/30 bg-warning/10 text-warning',
        critical: 'border-destructive/30 bg-destructive/10 text-destructive',
        accent: 'border-accent/30 bg-accent/10 text-accent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/**
 * @typedef {'default'|'secondary'|'outline'|'muted'|'info'|'success'|'warning'|'critical'|'accent'} BadgeVariant
 * @typedef {React.ComponentPropsWithoutRef<'span'> & { variant?: BadgeVariant }} BadgeProps
 */

/** @param {BadgeProps} props */
export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
