import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { CATEGORY_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const EMPTY = { name: '', color: 'sky', description: '' };

/** @param {{ open: boolean, onClose: () => void, onSubmit: (data: typeof EMPTY) => void, category?: Object|null, submitting?: boolean }} props */
export function CategoryForm({ open, onClose, onSubmit, category, submitting }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm(category ? { name: category.name || '', color: category.color || 'sky', description: category.description || '' } : EMPTY);
  }, [category, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
          <FormField label="Category name" required>
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Radio equipment" required autoFocus />}
          </FormField>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category colour">
              {Object.entries(CATEGORY_COLORS).map(([name, hex]) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={form.color === name}
                  aria-label={name}
                  onClick={() => setForm({ ...form, color: name })}
                  className={cn('h-7 w-7 rounded-full border-2 transition-transform', form.color === name ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105')}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>
          <FormField label="Description" hint="Optional">
            {({ id }) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={submitting}>{category ? 'Save changes' : 'Create category'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
