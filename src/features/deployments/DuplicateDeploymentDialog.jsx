import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/common/FormField';
import { toDateTimeLocal, formatDateTime } from '@/lib/time';

/**
 * Copy a deployment for a recurring event: structure, positions, shifts,
 * comms plan, and optionally the same people (re-offered) and setup tasks.
 * A new start date moves every time by the same offset.
 * @param {{
 *   open: boolean, onClose: () => void, source: Object|null,
 *   counts: { sites: number, categories: number, items: number, tasks: number, positions: number, shifts: number, channels: number },
 *   onSubmit: (data: { name: string, withAssignments: boolean, withTasks: boolean, withPlan: boolean, newStartsAt: string|null }) => void, submitting?: boolean
 * }} props
 */
export function DuplicateDeploymentDialog({ open, onClose, source, counts, onSubmit, submitting }) {
  const [form, setForm] = useState({ name: '', withAssignments: true, withTasks: true, withPlan: true, newStart: '' });
  useEffect(() => {
    if (open && source) setForm({ name: `${source.name} (copy)`, withAssignments: true, withTasks: true, withPlan: true, newStart: '' });
  }, [open, source]);

  if (!source) return null;
  const anchor = source.starts_at;
  const list = [
    `${counts.sites} site${counts.sites === 1 ? '' : 's'}`,
    `${counts.positions} position${counts.positions === 1 ? '' : 's'} with ${counts.shifts} shift${counts.shifts === 1 ? '' : 's'}`,
    `${counts.items} item${counts.items === 1 ? '' : 's'}`,
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate “{source.name}”</DialogTitle>
          <DialogDescription>Creates a new deployment in Planning with {list.join(', ')}. Its published plan version starts over.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) onSubmit({ name: form.name.trim(), withAssignments: form.withAssignments, withTasks: form.withTasks, withPlan: form.withPlan, newStartsAt: form.newStart ? new Date(form.newStart).toISOString() : null }); }} className="space-y-4">
          <FormField label="New deployment name" required>
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />}
          </FormField>
          <FormField label="New start" hint={anchor ? `Original start ${formatDateTime(anchor)}. Every shift, muster time and period moves by the same amount. Leave empty to keep the original dates and fix them later.` : 'The original has no start time; dates are copied as they are.'}>
            {({ id }) => <Input id={id} type="datetime-local" value={form.newStart} onChange={(e) => setForm({ ...form, newStart: e.target.value })} disabled={!anchor} min={toDateTimeLocal(new Date().toISOString())} />}
          </FormField>
          <div className="space-y-3 rounded-md border p-3 text-sm">
            <label className="flex items-start gap-3">
              <Checkbox checked={form.withPlan} onCheckedChange={(v) => setForm({ ...form, withPlan: v === true })} className="mt-0.5" />
              <span>
                <span className="font-medium">Copy the communications plan ({counts.channels} channel{counts.channels === 1 ? '' : 's'})</span>
                <span className="block text-xs text-muted-foreground">Same channels, conditions and instructions. Review before publishing.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <Checkbox checked={form.withAssignments} onCheckedChange={(v) => setForm({ ...form, withAssignments: v === true })} className="mt-0.5" />
              <span>
                <span className="font-medium">Keep the same people</span>
                <span className="block text-xs text-muted-foreground">Everyone who held a position is offered it again and must accept for the new date. Site rosters and equipment assignments are copied. Uncheck to start with a blank crew.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <Checkbox checked={form.withTasks} onCheckedChange={(v) => setForm({ ...form, withTasks: v === true })} className="mt-0.5" />
              <span>
                <span className="font-medium">Copy setup tasks ({counts.tasks})</span>
                <span className="block text-xs text-muted-foreground">All tasks are re-created as Pending without due dates.</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting}>Create copy</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
