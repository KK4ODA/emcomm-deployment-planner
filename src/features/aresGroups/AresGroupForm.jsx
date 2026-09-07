import React, { useEffect, useState } from 'react';
import { Shield, X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/common/FormField';
import { CallSign } from '@/components/common/CallSign';
import { cn } from '@/lib/utils';

const EMPTY = { name: '', description: '', region: '', admin_user_ids: [] };

/** @param {{ open: boolean, onClose: () => void, onSubmit: (data: typeof EMPTY) => void, group?: Object|null, users: Object[], submitting?: boolean }} props */
export function AresGroupForm({ open, onClose, onSubmit, group, users, submitting }) {
  const [form, setForm] = useState(EMPTY);
  useEffect(() => {
    if (open) setForm(group ? { name: group.name || '', description: group.description || '', region: group.region || '', admin_user_ids: group.admin_user_ids || [] } : EMPTY);
  }, [group, open]);

  const toggleAdmin = (id) => setForm(f => ({ ...f, admin_user_ids: f.admin_user_ids.includes(id) ? f.admin_user_ids.filter(x => x !== id) : [...f.admin_user_ids, id] }));
  const admins = users.filter(u => form.admin_user_ids.includes(u.id));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? 'Edit ARES group' : 'New ARES group'}</DialogTitle>
          <DialogDescription>Groups scope who can see which deployments.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Group name" required>
              {({ id }) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Duval County ARES" required autoFocus />}
            </FormField>
            <FormField label="Region">
              {({ id }) => <Input id={id} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g., Northern Florida" />}
            </FormField>
          </div>
          <FormField label="Description" hint="Optional">
            {({ id }) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </FormField>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-muted-foreground" /> Group admins</Label>
            {admins.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {admins.map(a => (
                  <button key={a.id} type="button" onClick={() => toggleAdmin(a.id)} aria-label={`Remove ${a.full_name}`} className="group rounded-md">
                    <Badge variant="warning" className="gap-1 pr-1">{a.call_sign || a.full_name}<X className="h-3 w-3 opacity-70 group-hover:opacity-100" /></Badge>
                  </button>
                ))}
              </div>
            )}
            <ul className="max-h-48 divide-y overflow-y-auto rounded-md border" role="listbox" aria-multiselectable="true">
              {users.map(u => {
                const selected = form.admin_user_ids.includes(u.id);
                return (
                  <li key={u.id}>
                    <button type="button" role="option" aria-selected={selected} onClick={() => toggleAdmin(u.id)} className={cn('flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted', selected && 'bg-warning/5')}>
                      <span className="flex min-w-0 items-center gap-2">
                        {u.call_sign && <CallSign value={u.call_sign} />}
                        <span className="truncate">{u.full_name || u.email}</span>
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-warning" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={submitting}>{group ? 'Save changes' : 'Create group'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
