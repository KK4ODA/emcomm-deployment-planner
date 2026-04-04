import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const colors = [
  { name: 'amber', class: 'bg-amber-500' },
  { name: 'emerald', class: 'bg-emerald-500' },
  { name: 'sky', class: 'bg-sky-500' },
  { name: 'rose', class: 'bg-rose-500' },
  { name: 'violet', class: 'bg-violet-500' },
  { name: 'orange', class: 'bg-orange-500' },
  { name: 'indigo', class: 'bg-indigo-500' },
  { name: 'teal', class: 'bg-teal-500' },
  { name: 'pink', class: 'bg-pink-500' },
  { name: 'slate', class: 'bg-slate-500' },
];

export default function CategoryForm({ open, onClose, onSubmit, category }) {
  const [form, setForm] = useState({
    name: '',
    color: 'sky',
    description: '',
    sort_order: 0
  });

  useEffect(() => {
    if (category) {
      setForm({
        name: category.name || '',
        color: category.color || 'sky',
        description: category.description || '',
        sort_order: category.sort_order || 0
      });
    } else {
      setForm({ name: '', color: 'sky', description: '', sort_order: 0 });
    }
  }, [category, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit Category' : 'New Category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Category Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Radio Equipment"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {colors.map(c => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setForm({ ...form, color: c.name })}
                  className={`w-8 h-8 rounded-full ${c.class} transition-all duration-200 ${
                    form.color === c.name 
                      ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' 
                      : 'hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of items in this category"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sort_order">Sort Order</Label>
            <Input
              id="sort_order"
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
              {category ? 'Save Changes' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}