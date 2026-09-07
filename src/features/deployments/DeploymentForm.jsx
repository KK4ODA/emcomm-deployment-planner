import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { useAresGroups, useTemplates } from '@/hooks/useEntities';
import { DEPLOYMENT_STATUS, DEPLOYMENT_PROFILES } from '@/lib/constants';
import { toDateTimeLocal } from '@/lib/time';

const BLANK = '__blank__';
const EMPTY = {
  name: '', description: '', status: 'planning', profile: 'public_service', starts_at: '', ends_at: '', location: '', ares_group_id: '', template_id: '',
  served_agency: '', requesting_official: '', tasking_reference: '',
};

/** ISO from a datetime-local input value, or '' */
function isoFromLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

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
      profile: deployment.profile || 'public_service',
      starts_at: deployment.starts_at || (deployment.start_date ? new Date(`${deployment.start_date}T00:00`).toISOString() : ''),
      ends_at: deployment.ends_at || (deployment.end_date ? new Date(`${deployment.end_date}T23:59`).toISOString() : ''),
      location: deployment.location || '', ares_group_id: deployment.ares_group_id || '', template_id: '',
      served_agency: deployment.served_agency || '', requesting_official: deployment.requesting_official || '', tasking_reference: deployment.tasking_reference || '',
    } : EMPTY);
  }, [deployment, open]);

  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.ares_group_id) { setError('Choose the ARES group that owns this deployment'); return; }
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) { setError('The end must be after the start'); return; }
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{deployment ? 'Edit deployment' : 'New deployment'}</DialogTitle>
          <DialogDescription>{deployment ? 'Update the details of this deployment.' : 'A deployment groups positions, sites, equipment and the comms plan for one activation, event or exercise.'}</DialogDescription>
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
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g., Publix Atlanta Marathon 2027" required autoFocus />}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Kind">
              {({ id }) => (
                <Select value={form.profile} onValueChange={set('profile')}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(DEPLOYMENT_PROFILES).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
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
            <FormField label="Starts" hint="First shift start">
              {({ id }) => <Input id={id} type="datetime-local" value={toDateTimeLocal(form.starts_at)} onChange={(e) => set('starts_at')(isoFromLocal(e.target.value))} />}
            </FormField>
            <FormField label="Ends" error={error && form.ares_group_id ? error : undefined}>
              {({ id }) => <Input id={id} type="datetime-local" value={toDateTimeLocal(form.ends_at)} min={toDateTimeLocal(form.starts_at) || undefined} onChange={(e) => set('ends_at')(isoFromLocal(e.target.value))} />}
            </FormField>
            <FormField label="Region / area">
              {({ id }) => <Input id={id} value={form.location} onChange={(e) => set('location')(e.target.value)} placeholder="e.g., Atlanta, GA" />}
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

          <details className="rounded-md border p-3" open={!!(form.served_agency || form.requesting_official || form.tasking_reference)}>
            <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium"><ChevronDown className="h-4 w-4" /> Served agency and authorization <span className="text-xs font-normal text-muted-foreground">(optional; printed on the deployment order)</span></summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField label="Served agency">
                {({ id }) => <Input id={id} value={form.served_agency} onChange={(e) => set('served_agency')(e.target.value)} placeholder="e.g., Atlanta Track Club, DeKalb EMA" />}
              </FormField>
              <FormField label="Requesting official">
                {({ id }) => <Input id={id} value={form.requesting_official} onChange={(e) => set('requesting_official')(e.target.value)} placeholder="Name and role" />}
              </FormField>
              <FormField label="Tasking reference" className="sm:col-span-2">
                {({ id }) => <Input id={id} value={form.tasking_reference} onChange={(e) => set('tasking_reference')(e.target.value)} placeholder="e.g., EMA mission number, email of request" />}
              </FormField>
            </div>
          </details>

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
