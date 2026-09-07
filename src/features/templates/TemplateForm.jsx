import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/common/FormField';

/** @param {{ open: boolean, onClose: () => void, onSubmit: (data: { name: string, description: string }) => void, template?: Object|null, submitting?: boolean, sourceName?: string }} props */
export function TemplateForm({ open, onClose, onSubmit, template, submitting, sourceName }) {
  const [form, setForm] = useState({ name: '', description: '' });
  useEffect(() => {
    if (open) setForm({ name: template?.name || '', description: template?.description || '' });
  }, [template, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit template' : 'Save as template'}</DialogTitle>
          <DialogDescription>
            {template ? 'Rename or describe this template.' : `Capture the sites, categories and items of “${sourceName}” for reuse. Assignments are not included.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
          <FormField label="Template name" required>
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Field Day standard setup" required autoFocus />}
          </FormField>
          <FormField label="Description" hint="Optional">
            {({ id }) => <Textarea id={id} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={submitting}>Save template</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
