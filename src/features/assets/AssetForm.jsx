import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { ASSET_KINDS } from '@/lib/assets';

const NONE = '__group__';
const EMPTY = { name: '', kind: 'other', serial: '', owner_user_id: '', home_location: '', notes: '' };

/**
 * Add or edit an asset (planner). Custody is changed through the move
 * actions, not here.
 * @param {{ open: boolean, onClose: () => void, asset?: Object|null, users: Object[], onSubmit: (data: Object) => void, submitting?: boolean }} props
 */
export function AssetForm({ open, onClose, asset = null, users, onSubmit, submitting }) {
  const [form, setForm] = useState(EMPTY);
  useEffect(() => {
    if (!open) return;
    setForm(asset ? { name: asset.name || '', kind: asset.kind || 'other', serial: asset.serial || '', owner_user_id: asset.owner_user_id || '', home_location: asset.home_location || '', notes: asset.notes || '' } : EMPTY);
  }, [open, asset]);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({ name: form.name.trim(), kind: form.kind, serial: form.serial.trim() || null, owner_user_id: form.owner_user_id || null, home_location: form.home_location.trim() || null, notes: form.notes.trim() || null });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{asset ? 'Edit asset' : 'Add asset'}</DialogTitle>
          <DialogDescription>Shared equipment the group needs to find again: who owns it, where it lives, what it is.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Name" required hint="As people say it on the air: “50 A Anderson cord”, “Blue go-box”">
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => set('name')(e.target.value)} required autoFocus />}
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Kind">
              {({ id }) => (
                <Select value={form.kind} onValueChange={set('kind')}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ASSET_KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Serial / ID" hint="Optional">
              {({ id }) => <Input id={id} value={form.serial} onChange={(e) => set('serial')(e.target.value)} className="font-mono" />}
            </FormField>
          </div>
          <FormField label="Owner" hint="Group-owned unless a member lends it">
            {({ id }) => (
              <Select value={form.owner_user_id || NONE} onValueChange={(v) => set('owner_user_id')(v === NONE ? '' : v)}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>The group</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.call_sign || u.full_name || u.email}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="Home location" hint="Where it lives between events: “EOC cage, shelf 2”, “With W4CEF”">
            {({ id }) => <Input id={id} value={form.home_location} onChange={(e) => set('home_location')(e.target.value)} />}
          </FormField>
          <FormField label="Notes" hint="Accessories, quirks, what it needs">
            {({ id }) => <Textarea id={id} rows={2} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting}>{asset ? 'Save' : 'Add asset'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
