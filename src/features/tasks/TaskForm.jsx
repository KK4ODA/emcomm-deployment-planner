import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { TASK_PRIORITY, TASK_STATUS } from '@/lib/constants';

const UNASSIGNED = '__unassigned__';

/**
 * @param {{
 *   open: boolean, onClose: () => void, onSubmit: (data: Object) => void, task?: Object|null, locationId: string,
 *   callSigns: string[], submitting?: boolean
 * }} props
 */
export function TaskForm({ open, onClose, onSubmit, task, locationId, callSigns = [], submitting }) {
  const blank = { name: '', description: '', deployment_location_id: locationId, assigned_to_call_sign: '', status: 'pending', priority: 'medium', due_date: '' };
  const [form, setForm] = useState(blank);

  useEffect(() => {
    if (!open) return;
    setForm(task ? {
      name: task.name || '', description: task.description || '', deployment_location_id: task.deployment_location_id || locationId,
      assigned_to_call_sign: task.assigned_to_call_sign || '', status: task.status || 'pending', priority: task.priority || 'medium', due_date: task.due_date || '',
    } : blank);
  }, [task, open, locationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a call sign that is assigned but no longer on the site's roster selectable.
  const options = form.assigned_to_call_sign && !callSigns.includes(form.assigned_to_call_sign) ? [form.assigned_to_call_sign, ...callSigns] : callSigns;

  const submit = (e) => {
    e.preventDefault();
    if (submitting) return;
    onSubmit({ ...form, assigned_to_call_sign: form.assigned_to_call_sign || null, due_date: form.due_date || null, description: form.description || null });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Task" required>
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Raise the VHF mast" required autoFocus />}
          </FormField>
          <FormField label="Details" hint="Optional">
            {({ id }) => <Textarea id={id} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </FormField>
          <FormField label="Assigned to" hint={callSigns.length === 0 ? 'Assign operators to this site first to pick from a roster.' : undefined}>
            {({ id }) => (
              <Select value={form.assigned_to_call_sign || UNASSIGNED} onValueChange={(v) => setForm({ ...form, assigned_to_call_sign: v === UNASSIGNED ? '' : v })}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {options.map(cs => <SelectItem key={cs} value={cs}><span className="font-mono">{cs}</span></SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Priority">
              {({ id }) => (
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TASK_PRIORITY).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Status" hint={task ? 'Status only moves forward once synced.' : undefined}>
              {({ id }) => (
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TASK_STATUS).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
          </div>
          <FormField label="Due date">
            {({ id }) => <Input id={id} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting}>{task ? 'Save changes' : 'Create task'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
