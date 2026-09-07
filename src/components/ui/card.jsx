import * as React from 'react';
import { cn } from '@/lib/utils';

/** @typedef {React.ComponentPropsWithoutRef<'div'>} DivProps */

export const Card = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLDivElement, DivProps>} */
  (({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
  )),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLDivElement, DivProps>} */
  (({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1 p-4 sm:p-5', className)} {...props} />
  )),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLHeadingElement, React.ComponentPropsWithoutRef<'h3'>>} */
  (({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-base font-semibold leading-tight tracking-tight', className)} {...props} />
  )),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLParagraphElement, React.ComponentPropsWithoutRef<'p'>>} */
  (({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )),
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLDivElement, DivProps>} */
  (({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />
  )),
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<HTMLDivElement, DivProps>} */
  (({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />
  )),
);
CardFooter.displayName = 'CardFooter';
