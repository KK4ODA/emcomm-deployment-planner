import * as React from 'react';
import { cn } from '@/lib/utils';

/** @param {React.ComponentPropsWithoutRef<'div'>} props */
export function Skeleton({ className, ...props }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden {...props} />;
}
