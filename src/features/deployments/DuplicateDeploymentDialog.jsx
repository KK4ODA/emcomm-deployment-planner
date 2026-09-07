import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/common/FormField';

/**
 * Copy a deployment for a recurring event. Unlike a template, the copy can
 * keep who brings what and who staffs which site.
 * @param {{
 *   open: boolean, onClose: () => void, source: Object|null,
 *   counts: { sites: number, categories: number, items: number, tasks: number },
 *   onSubmit: (data: { name: string, withAssignments: boolean, withTasks: boolean }) => void, submitting?: boolean
 * }} props
 */
export function DuplicateDeploymentDialog({ open, onClose, source, counts, onSubmit, submitting }) {
  const [form, setForm] = useState({ name: '', withAssignments: true, withTasks: true });
  useEffect(() => {
    if (open && source) setForm({ name: `${source.name} (copy)`, withAssignments: true, withTasks: true });
  }, [open, source]);

  if (!source) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate “{source.name}”</DialogTitle>
          <DialogDescription>
            Creates a new deployment in Planning with {counts.sites} site{counts.sites === 1 ? '' : 's'}, {counts.categories} categor{counts.categories === 1 ? 'y' : 'ies'} and {counts.items} item{counts.items === 1 ? '' : 's'}. Dates are cleared; ICS 205 forms are not copied.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) onSubmit({ ...form, name: form.name.trim() }); }} className="space-y-4">
          <FormField label="New deployment name" required>
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />}
          </FormField>
          <div className="space-y-3 rounded-md border p-3 text-sm">
            <label className="flex items-start gap-3">
              <Checkbox checked={form.withAssignments} onCheckedChange={(v) => setForm({ ...form, withAssignments: v === true })} className="mt-0.5" />
              <span>
                <span className="font-medium">Keep assignments</span>
                <span className="block text-xs text-muted-foreground">Site operator rosters, who brings each item, and task assignees. Uncheck to start with a blank crew.</span>
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
