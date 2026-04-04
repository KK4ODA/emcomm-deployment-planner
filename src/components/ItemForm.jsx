import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export default function ItemForm({ open, onClose, onSubmit, item, categories, locations = [], users, allItems = [] }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    category_id: '',
    deployment_location_id: '',
    assigned_to: [],
    quantity: 1,
    priority: 'important'
  });

  // Get unique previous items for the dropdown
  const previousItems = Array.from(new Set(allItems.map(i => i.name)))
    .sort()
    .map(name => {
      const exampleItem = allItems.find(i => i.name === name);
      return { name, exampleItem };
    });

  useEffect(() => {
    if (item) {
      const assignedCallSigns = Array.isArray(item.assigned_to) ? item.assigned_to : (item.assigned_to ? [item.assigned_to] : []);
      setForm({
        name: item.name || '',
        description: item.description || '',
        category_id: item.category_id || '',
        deployment_location_id: item.deployment_location_id || '',
        assigned_to: assignedCallSigns,
        quantity: item.quantity || 1,
        priority: item.priority || 'important'
      });
    } else {
      setForm({
        name: '',
        description: '',
        category_id: categories[0]?.id || '',
        deployment_location_id: locations[0]?.id || '',
        assigned_to: [],
        quantity: 1,
        priority: 'important'
      });
    }
  }, [item, open, categories, locations]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  const toggleAssignment = (callSign) => {
    setForm(prev => ({
      ...prev,
      assigned_to: prev.assigned_to.includes(callSign)
        ? prev.assigned_to.filter(cs => cs !== callSign)
        : [...prev.assigned_to, callSign]
    }));
  };

  const removeAssignment = (callSign) => {
    setForm(prev => ({
      ...prev,
      assigned_to: prev.assigned_to.filter(cs => cs !== callSign)
    }));
  };

  const handleSelectPreviousItem = (itemName) => {
    if (itemName === "new") {
      setForm(prev => ({
        ...prev,
        name: '',
        description: '',
        quantity: 1,
        priority: 'important'
      }));
    } else {
      const selectedItem = allItems.find(i => i.name === itemName);
      if (selectedItem) {
        setForm(prev => ({
          ...prev,
          name: selectedItem.name,
          description: selectedItem.description || '',
          quantity: selectedItem.quantity || 1,
          priority: selectedItem.priority || 'important'
        }));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Item' : 'New Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {!item && previousItems.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="previous-item">Choose from Previous Items</Label>
              <Select onValueChange={handleSelectPreviousItem}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a previous item or create new" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create New Item</SelectItem>
                  {previousItems.map(({ name }) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="item-name">Item Name</Label>
            <Input
              id="item-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Handheld Radio"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={form.category_id}
              onValueChange={(value) => setForm({ ...form, category_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Select
              value={form.deployment_location_id}
              onValueChange={(value) => setForm({ ...form, deployment_location_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value) => setForm({ ...form, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="essential">Essential</SelectItem>
                  <SelectItem value="important">Important</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign To (multiple allowed)</Label>
            {form.assigned_to.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.assigned_to.map(callSign => (
                  <Badge key={callSign} variant="secondary" className="text-xs gap-1">
                    {callSign}
                    <button
                      type="button"
                      onClick={() => removeAssignment(callSign)}
                      className="hover:text-rose-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
              {users.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-2">No members available</p>
              ) : (
                users.map(user => (
                  <div key={user.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`user-${user.id}`}
                      checked={form.assigned_to.includes(user.call_sign)}
                      onCheckedChange={() => toggleAssignment(user.call_sign)}
                    />
                    <label
                      htmlFor={`user-${user.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {user.call_sign} - {user.full_name}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Notes (optional)</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Additional details about this item"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
              {item ? 'Save Changes' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}