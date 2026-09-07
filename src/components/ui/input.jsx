import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLInputElement, React.ComponentPropsWithoutRef<'input'> & { invalid?: boolean }>} */
  (({ className, type = 'text', invalid, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm transition-colors',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30',
        className,
      )}
      {...props}
    />
  )),
);
Input.displayName = 'Input';
