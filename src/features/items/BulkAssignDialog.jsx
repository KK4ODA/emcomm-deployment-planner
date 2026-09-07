import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { isUnassigned } from '@/lib/assignments';

const ALL = '__all__';

/**
 * Assign every unassigned item (at one site or across the deployment) to a
 * single operator in one step. Defaults to the signed-in operator.
 * @param {{
 *   open: boolean, onClose: () => void, items: Object[], locations: Object[], users: Object[],
 *   defaultLocationId?: string|null, currentCallSign?: string|null,
 *   onSubmit: (data: { items: Object[], callSign: string }) => void, submitting?: boolean
 * }} props
 */
export function BulkAssignDialog({ open, onClose, items, locations, users, defaultLocationId = null, currentCallSign = null, onSubmit, submitting }) {
  const [locationId, setLocationId] = useState(/** @type {string|null} */ (defaultLocationId));
  const [callSign, setCallSign] = useState(currentCallSign || '');

  useEffect(() => {
    if (open) { setLocationId(defaultLocationId); setCallSign(currentCallSign || users[0]?.call_sign || ''); }
  }, [open, defaultLocationId, currentCallSign, users]);

  const candidates = useMemo(
    () => items.filter(i => isUnassigned(i) && (!locationId || i.deployment_location_id === locationId)),
    [items, locationId],
  );
  const siteName = locations.find(l => l.id === locationId)?.name;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign unassigned items</DialogTitle>
          <DialogDescription>Give every item that nobody has claimed yet to one operator. You can still change individual items afterwards.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (callSign && candidates.length) onSubmit({ items: candidates, callSign }); }} className="space-y-4">
          {locations.length > 1 && (
            <FormField label="Scope">
              {({ id }) => (
                <Select value={locationId ?? ALL} onValueChange={(v) => setLocationId(v === ALL ? null : v)}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sites</SelectItem>
                    {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}
          <FormField label="Assign to" required>
            {({ id }) => (
              <Select value={callSign} onValueChange={setCallSign}>
                <SelectTrigger id={id}><SelectValue placeholder="Choose an operator" /></SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.call_sign} value={u.call_sign}>
                      <span className="font-mono">{u.call_sign}</span>
                      {u.call_sign === currentCallSign && <span className="ml-1.5 text-xs text-muted-foreground">(me)</span>}
                      {u.full_name && <span className="ml-1.5 text-xs text-muted-foreground">{u.full_name}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            {candidates.length === 0
              ? <>Nothing is unassigned{siteName ? ` at ${siteName}` : ''}.</>
              : <><span className="tnum font-semibold">{candidates.length}</span> item{candidates.length === 1 ? '' : 's'}{siteName ? ` at ${siteName}` : ' across all sites'} will be assigned to <span className="font-mono font-semibold">{callSign || '…'}</span>.</>}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting} disabled={!callSign || candidates.length === 0}>Assign {candidates.length || ''}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
