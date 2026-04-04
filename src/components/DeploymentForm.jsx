import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users } from "lucide-react";

export default function DeploymentForm({ open, onClose, onSubmit, deployment }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'planning',
    start_date: '',
    end_date: '',
    location: '',
    ares_group_id: '',
    template_id: ''
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.DeploymentTemplate.list('-created_date'),
    enabled: open && !deployment
  });

  const { data: aresGroups = [] } = useQuery({
    queryKey: ['ares-groups'],
    queryFn: () => base44.entities.ARESGroup.list('name'),
    enabled: open
  });

  useEffect(() => {
    if (deployment) {
      setForm({
        name: deployment.name || '',
        description: deployment.description || '',
        status: deployment.status || 'planning',
        start_date: deployment.start_date || '',
        end_date: deployment.end_date || '',
        location: deployment.location || '',
        ares_group_id: deployment.ares_group_id || '',
        template_id: ''
      });
    } else {
      setForm({
        name: '',
        description: '',
        status: 'planning',
        start_date: '',
        end_date: '',
        location: '',
        ares_group_id: '',
        template_id: ''
      });
    }
  }, [deployment, open]);



  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{deployment ? 'Edit Deployment' : 'New Deployment'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {!deployment && templates.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="template">Start from Template (optional)</Label>
              <Select
                value={form.template_id}
                onValueChange={(value) => setForm({ ...form, template_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template or start blank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Blank deployment</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.category_count} categories, {t.item_count} items)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Deployment Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Hurricane Response 2024"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g., Miami, FL"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ares_group_id" className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              ARES Group *
            </Label>
            <Select
              value={form.ares_group_id}
              onValueChange={(value) => setForm({ ...form, ares_group_id: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select ARES group" />
              </SelectTrigger>
              <SelectContent>
                {aresGroups.map(group => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                    {group.region && ` (${group.region})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {aresGroups.length === 0 && (
              <p className="text-xs text-amber-600">
                No ARES groups available. Please create one first.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(value) => setForm({ ...form, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of this deployment"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
              {deployment ? 'Save Changes' : 'Create Deployment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}