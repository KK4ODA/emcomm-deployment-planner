import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { useAresGroups, useTemplates } from '@/hooks/useEntities';
import { DEPLOYMENT_STATUS } from '@/lib/constants';

const BLANK = '__blank__';
const EMPTY = { name: '', description: '', status: 'planning', start_date: '', end_date: '', location: '', ares_group_id: '', template_id: '' };

/**
 * Create/edit a deployment. On create, an optional template seeds sites,
 * categories and items.
 * @param {{ open: boolean, onClose: () => void, onSubmit: (data: typeof EMPTY) => void, deployment?: Object|null, submitting?: boolean }} props
 */
export function DeploymentForm({ open, onClose, onSubmit, deployment, submitting }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const { data: templates = [] } = useTemplates();
  const { data: aresGroups = [] } = useAresGroups({ enabled: open });

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(deployment ? {
      name: deployment.name || '', description: deployment.description || '', status: deployment.status || 'planning',
      start_date: deployment.start_date || '', end_date: deployment.end_date || '', location: deployment.location || '',
      ares_group_id: deployment.ares_group_id || '', template_id: '',
    } : EMPTY);
  }, [deployment, open]);

  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.ares_group_id) { setError('Choose the ARES group that owns this deployment'); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { setError('End date is before the start date'); return; }
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{deployment ? 'Edit deployment' : 'New deployment'}</DialogTitle>
          <DialogDescription>{deployment ? 'Update the details of this deployment.' : 'A deployment groups sites, equipment and tasks for one activation or exercise.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {!deployment && templates.length > 0 && (
            <FormField label="Start from a template" hint="Copies sites, categories and items (without assignments)">
              {({ id }) => (
                <Select value={form.template_id || BLANK} onValueChange={(v) => set('template_id')(v === BLANK ? '' : v)}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BLANK}>Blank deployment</SelectItem>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} <span className="text-muted-foreground">· {t.location_count} sites, {t.item_count} items</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}

          <FormField label="Deployment name" required>
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g., Hurricane response 2026" required autoFocus />}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Region / area">
              {({ id }) => <Input id={id} value={form.location} onChange={(e) => set('location')(e.target.value)} placeholder="e.g., Duval County, FL" />}
            </FormField>
            <FormField label="ARES group" required error={error && !form.ares_group_id ? error : undefined}>
              {({ id }) => (
                <Select value={form.ares_group_id} onValueChange={set('ares_group_id')}>
                  <SelectTrigger id={id}><SelectValue placeholder="Select ARES group" /></SelectTrigger>
                  <SelectContent>
                    {aresGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}{g.region ? ` (${g.region})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Start date">
              {({ id }) => <Input id={id} type="date" value={form.start_date} onChange={(e) => set('start_date')(e.target.value)} />}
            </FormField>
            <FormField label="End date" error={error && form.ares_group_id ? error : undefined}>
              {({ id }) => <Input id={id} type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => set('end_date')(e.target.value)} />}
            </FormField>
            <FormField label="Status">
              {({ id }) => (
                <Select value={form.status} onValueChange={set('status')}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(DEPLOYMENT_STATUS).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
          </div>

          <FormField label="Description" hint="Optional">
            {({ id }) => <Textarea id={id} rows={3} value={form.description} onChange={(e) => set('description')(e.target.value)} />}
          </FormField>

          {aresGroups.length === 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">No ARES groups exist yet. An admin must create one before deployments can be added.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={submitting}>{deployment ? 'Save changes' : 'Create deployment'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
