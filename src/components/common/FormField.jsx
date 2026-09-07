import React, { useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Label + control + hint/error wrapper. Pass a render function or an element
 * as children; the generated id is applied when children is a function.
 *
 * @param {{
 *   label: React.ReactNode, hint?: React.ReactNode, error?: React.ReactNode, required?: boolean,
 *   icon?: React.ElementType, className?: string, id?: string,
 *   children: React.ReactNode | ((ids: { id: string, describedBy?: string, invalid: boolean }) => React.ReactNode)
 * }} props
 */
export function FormField({ label, hint, error, required, icon: Icon, className, id: idProp, children }) {
  const generated = useId();
  const id = idProp || generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
        {label}
        {required && <span className="text-destructive" aria-hidden>*</span>}
      </Label>
      {typeof children === 'function' ? children({ id, describedBy, invalid: !!error }) : children}
      {error ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
