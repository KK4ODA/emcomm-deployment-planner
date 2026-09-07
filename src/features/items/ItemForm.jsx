import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { CallSign } from '@/components/common/CallSign';
import { ITEM_PRIORITY } from '@/lib/constants';
import { assigneesOf } from '@/lib/assignments';

const NEW_ITEM = '__new__';

/**
 * @param {{
 *   open: boolean, onClose: () => void, onSubmit: (data: Object) => void, item?: Object|null,
 *   categories: Object[], locations: Object[], users: Object[], allItems?: Object[],
 *   defaultCategoryId?: string|null, defaultLocationId?: string|null, submitting?: boolean
 * }} props
 */
export function ItemForm({ open, onClose, onSubmit, item, categories, locations = [], users, allItems = [], defaultCategoryId, defaultLocationId, submitting }) {
  const blank = useMemo(() => ({
    name: '', description: '', category_id: defaultCategoryId || categories[0]?.id || '',
    deployment_location_id: defaultLocationId || locations[0]?.id || '', assigned_to: [], quantity: 1, priority: 'important',
  }), [categories, locations, defaultCategoryId, defaultLocationId]);

  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(item ? {
      name: item.name || '', description: item.description || '', category_id: item.category_id || '',
      deployment_location_id: item.deployment_location_id || '', assigned_to: assigneesOf(item),
      quantity: item.quantity || 1, priority: item.priority || 'important',
    } : blank);
  }, [item, open, blank]);

  // Distinct item names already used anywhere, so recurring kit can be re-added quickly.
  const previous = useMemo(() => {
    const byName = new Map();
    for (const i of allItems) if (!byName.has(i.name)) byName.set(i.name, i);
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  const applyPrevious = (name) => {
    if (name === NEW_ITEM) { setForm(f => ({ ...f, name: '', description: '', quantity: 1, priority: 'important' })); return; }
    const src = previous.find(i => i.name === name);
    if (src) setForm(f => ({ ...f, name: src.name, description: src.description || '', quantity: src.quantity || 1, priority: src.priority || 'important' }));
  };

  const toggle = (cs) => setForm(f => ({ ...f, assigned_to: f.assigned_to.includes(cs) ? f.assigned_to.filter(x => x !== cs) : [...f.assigned_to, cs] }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.category_id) { setError('Choose a category'); return; }
    if (!form.deployment_location_id) { setError('Choose a site'); return; }
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{item ? 'Edit item' : 'New item'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {!item && previous.length > 0 && (
            <FormField label="Start from a previous item" hint="Copies name, notes, quantity and priority">
              {({ id }) => (
                <Select onValueChange={applyPrevious}>
                  <SelectTrigger id={id}><SelectValue placeholder="Choose an item used before…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_ITEM}>Blank item</SelectItem>
                    {previous.map(p => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}

          <FormField label="Item name" required>
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Dual-band HT" required autoFocus={!previous.length} />}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category" required>
              {({ id }) => (
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger id={id}><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Site" required>
              {({ id }) => (
                <Select value={form.deployment_location_id} onValueChange={(v) => setForm({ ...form, deployment_location_id: v })}>
                  <SelectTrigger id={id}><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Quantity">
              {({ id }) => <Input id={id} type="number" min={1} inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} />}
            </FormField>
            <FormField label="Priority">
              {({ id }) => (
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ITEM_PRIORITY).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
          </div>

          <div className="space-y-1.5">
            <Label>Assigned to</Label>
            {form.assigned_to.length > 0 && (
              <div className="flex flex-wrap gap-1">{form.assigned_to.map(cs => <CallSign key={cs} value={cs} />)}</div>
            )}
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
              {users.length === 0 ? (
                <p className="py-1 text-center text-xs text-muted-foreground">No members with a call sign</p>
              ) : users.map(u => (
                <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                  <Checkbox checked={form.assigned_to.includes(u.call_sign)} onCheckedChange={() => toggle(u.call_sign)} />
                  <span className="font-mono text-xs font-semibold">{u.call_sign}</span>
                  <span className="truncate text-xs text-muted-foreground">{u.full_name}</span>
                </label>
              ))}
            </div>
          </div>

          <FormField label="Notes" hint="Optional" error={error}>
            {({ id }) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={submitting}>{item ? 'Save changes' : 'Add item'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
