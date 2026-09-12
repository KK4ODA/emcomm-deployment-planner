import React, { useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { TASK_KINDS, TASK_PRIORITY } from '@/lib/tasking';

const NONE = '__none__';

/** Site or free text. Lives outside the dialog so typing does not remount the input. */
function SitePicker({ label, sites, value, onChange, text, onText }) {
  return (
    <FormField label={label}>
      {({ id }) => (
        <div className="space-y-1.5">
          <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
            <SelectTrigger id={id}><SelectValue placeholder="Site" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not a site (type below)</SelectItem>
              {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {!value && <Input value={text} onChange={(e) => onText(e.target.value)} placeholder="e.g. Mile 12 ramp, corner of Peachtree and MLK" className="text-sm" />}
        </div>
      )}
    </FormField>
  );
}

/**
 * Dispatch a task to a unit. Kept to the fields a desk actually fills under
 * pressure: who, what, from, to, priority. Everything else is optional.
 * @param {{
 *   open: boolean, onClose: () => void, positions: Object[], sites: Object[], onSubmit: (data: Object) => void, submitting?: boolean,
 *   presetPositionId?: string|null
 * }} props
 */
export function TaskDispatchDialog({ open, onClose, positions, sites, onSubmit, submitting, presetPositionId = null }) {
  const [form, setForm] = useState({ positionId: '', kind: 'other', priority: 'routine', title: '', detail: '', fromSiteId: '', fromText: '', toSiteId: '', toText: '' });
  useEffect(() => { if (open) setForm({ positionId: presetPositionId || '', kind: 'other', priority: 'routine', title: '', detail: '', fromSiteId: '', fromText: '', toSiteId: '', toText: '' }); }, [open, presetPositionId]);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const units = useMemo(() => [...positions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name))), [positions]);
  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit({
      title: form.title.trim(), kind: form.kind, priority: form.priority, positionId: form.positionId || null, detail: form.detail.trim() || null,
      fromSiteId: form.fromSiteId || null, toSiteId: form.toSiteId || null, fromText: form.fromSiteId ? null : form.fromText.trim() || null, toText: form.toSiteId ? null : form.toText.trim() || null,
    });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dispatch a task</DialogTitle>
          <DialogDescription>The unit sees it on their packet and by notification; they acknowledge, go en route, arrive, and close it. Every step lands in the log for the ICS 214.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <FormField label="Unit" hint="Leave empty for a task any operator may take">
              {({ id }) => (
                <Select value={form.positionId || NONE} onValueChange={(v) => set('positionId')(v === NONE ? '' : v)}>
                  <SelectTrigger id={id}><SelectValue placeholder="Pick a unit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Any operator</SelectItem>
                    {units.map(p => <SelectItem key={p.id} value={p.id}>{p.tactical_callsign ? `${p.tactical_callsign} · ${p.name}` : p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Priority">
              {({ id }) => (
                <Select value={form.priority} onValueChange={set('priority')}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TASK_PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
          </div>
          <FormField label="Kind">
            {({ id }) => (
              <Select value={form.kind} onValueChange={set('kind')}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_KINDS.map(k => <SelectItem key={k.id} value={k.id}>{k.label}{k.hint ? <span className="ml-2 text-xs text-muted-foreground">{k.hint}</span> : null}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="What to do" required hint="One line, as you would say it on the air. Fits an APRS message at 60 characters.">
            {({ id }) => <Input id={id} value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="e.g. Pick up bib 1234, ankle, ambulatory" required autoFocus maxLength={120} />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <SitePicker label="From" sites={sites} value={form.fromSiteId} onChange={set('fromSiteId')} text={form.fromText} onText={set('fromText')} />
            <SitePicker label="To" sites={sites} value={form.toSiteId} onChange={set('toSiteId')} text={form.toText} onText={set('toText')} />
          </div>
          <FormField label="Details" hint="Optional: contact on scene, condition, what to bring">
            {({ id }) => <Textarea id={id} rows={2} value={form.detail} onChange={(e) => set('detail')(e.target.value)} />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting} disabled={!form.title.trim()}><Send /> Dispatch</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
