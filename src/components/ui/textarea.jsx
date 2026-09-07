import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLTextAreaElement, React.ComponentPropsWithoutRef<'textarea'>>} */
  (({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[60px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )),
);
Textarea.displayName = 'Textarea';
