import React, { useCallback, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * @typedef {Object} ConfirmOptions
 * @property {string} title
 * @property {React.ReactNode} [description]
 * @property {string} [confirmLabel]
 * @property {string} [cancelLabel]
 * @property {boolean} [destructive]
 */

/**
 * Accessible replacement for window.confirm().
 *
 * const { confirm, dialog } = useConfirm();
 * ... if (await confirm({ title: 'Delete site?', destructive: true })) remove();
 * ... return <>{dialog}</>
 */
export function useConfirm() {
  const [state, setState] = useState(/** @type {{ options: ConfirmOptions, resolve: (v: boolean) => void }|null} */ (null));

  const confirm = useCallback((options) => new Promise((resolve) => setState({ options, resolve })), []);

  const close = (value) => {
    state?.resolve(value);
    setState(null);
  };

  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(open) => { if (!open) close(false); }}>
      {state && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.options.title}</AlertDialogTitle>
            {state.options.description && <AlertDialogDescription>{state.options.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>{state.options.cancelLabel || 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              variant={state.options.destructive ? 'destructive' : 'default'}
              onClick={() => close(true)}
            >
              {state.options.confirmLabel || (state.options.destructive ? 'Delete' : 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );

  return { confirm, dialog };
}
