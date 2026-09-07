import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/common/FormField';

const EMPTY = { title: '', description: '', category: '', points: '' };

/**
 * Add or edit an objective (planner). Several at once: one title per line.
 * @param {{ open: boolean, onClose: () => void, objective?: Object|null, onSubmit: (rows: Object[]) => void, submitting?: boolean }} props
 */
export function ObjectiveForm({ open, onClose, objective = null, onSubmit, submitting }) {
  const [form, setForm] = useState(EMPTY);
  useEffect(() => {
    if (!open) return;
    setForm(objective ? { title: objective.title || '', description: objective.description || '', category: objective.category || '', points: objective.points ?? '' } : EMPTY);
  }, [open, objective]);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    const titles = objective ? [form.title.trim()] : form.title.split('\n').map(t => t.trim()).filter(Boolean);
    if (!titles.length) return;
    const points = form.points === '' ? null : Math.max(0, Number(form.points) || 0);
    onSubmit(titles.map(title => ({ title, description: form.description.trim() || null, category: form.category.trim() || null, points })));
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{objective ? 'Edit objective' : 'Add objectives'}</DialogTitle>
          <DialogDescription>Something a person can take and finish: “Pass 10 formal messages”, “Make a satellite contact”, “Solar-powered QSO”. Posted where everyone sees it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <FormField label={objective ? 'Objective' : 'Objectives'} required hint={objective ? undefined : 'One per line to add several at once'}>
            {({ id }) => objective
              ? <Input id={id} value={form.title} onChange={set('title')} required autoFocus />
              : <Textarea id={id} rows={4} value={form.title} onChange={set('title')} required autoFocus placeholder={'Pass 10 formal messages\nMake a satellite contact\nCopy the W1AW bulletin'} />}
          </FormField>
          <FormField label="Details" hint="How to prove it, who to tell">
            {({ id }) => <Textarea id={id} rows={2} value={form.description} onChange={set('description')} />}
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Category" hint="Bonus, Training, Traffic…">
              {({ id }) => <Input id={id} value={form.category} onChange={set('category')} />}
            </FormField>
            <FormField label="Points" hint="Field Day bonus, or leave empty">
              {({ id }) => <Input id={id} type="number" min={0} value={form.points} onChange={set('points')} />}
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting}>{objective ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
