import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>} */
  (({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )),
);
DialogOverlay.displayName = 'DialogOverlay';

/**
 * @typedef {React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }} DialogContentProps
 */
export const DialogContent = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>} */
  (({ className, children, hideClose = false, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-card p-5 text-card-foreground shadow-xl',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground opacity-80 transition-opacity hover:opacity-100 hover:bg-muted disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )),
);
DialogContent.displayName = 'DialogContent';

/** @param {React.ComponentPropsWithoutRef<'div'>} props */
export function DialogHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1 text-left', className)} {...props} />;
}

/** @param {React.ComponentPropsWithoutRef<'div'>} props */
export function DialogFooter({ className, ...props }) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export const DialogTitle = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>} */
  (({ className, ...props }, ref) => (
    <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  )),
);
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef(
  /** @type {React.ForwardRefRenderFunction<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>} */
  (({ className, ...props }, ref) => (
    <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )),
);
DialogDescription.displayName = 'DialogDescription';
