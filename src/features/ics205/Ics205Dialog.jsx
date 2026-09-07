import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, FileDown, HelpCircle, Radio } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Hint } from '@/components/ui/tooltip';
import { FormField } from '@/components/common/FormField';
import { EmptyState } from '@/components/common/EmptyState';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { reportMutationError } from '@/hooks/useEntities';
import { toDateTimeLocal } from '@/lib/time';
import { downloadBlob, safeFileName } from '@/lib/download';
import { renderIcs205Pdf } from './ics205Pdf';
import { useAuth } from '@/lib/AuthContext';
import { canEdit } from '@/lib/permissions';

const EMPTY_CHANNEL = { zone_group: '', channel_number: '', function: '', channel_name: '', assignment: '', rx_freq: '', rx_tone: '', tx_freq: '', tx_tone: '', mode: 'A', remarks: '' };

const CHANNEL_FIELDS = [
  { key: 'zone_group', label: 'Zone / Group', help: 'Radio zone or talkgroup designation', placeholder: 'Zone 1' },
  { key: 'channel_number', label: 'Ch #', help: 'Channel number or talkgroup number', placeholder: '1' },
  { key: 'function', label: 'Function', help: 'Command, Tactical, Support, Air-to-ground…', placeholder: 'Tactical' },
  { key: 'channel_name', label: 'Channel name', help: 'Common name or talkgroup name', placeholder: 'ARES OPS 1' },
  { key: 'assignment', label: 'Assignment', help: 'Unit or group using this channel', placeholder: 'Shelter team' },
  { key: 'rx_freq', label: 'RX freq', help: 'Receive frequency; add N (narrow) or W (wide)', placeholder: '146.520 N', mono: true },
  { key: 'rx_tone', label: 'RX tone / NAC', help: 'CTCSS/DCS tone or P25 NAC', placeholder: '100.0', mono: true },
  { key: 'tx_freq', label: 'TX freq', help: 'Transmit frequency', placeholder: '146.520 N', mono: true },
  { key: 'tx_tone', label: 'TX tone / NAC', help: 'CTCSS/DCS tone or P25 NAC', placeholder: '100.0', mono: true },
];

function emptyForm() {
  return {
    incident_name: '', operational_period_start: '', operational_period_end: '', radio_channels: [],
    special_instructions: '', prepared_by_name: '', prepared_by_position: '', preparation_date: toDateTimeLocal(new Date().toISOString()),
  };
}

function toForm(row) {
  return {
    incident_name: row.incident_name || '',
    operational_period_start: toDateTimeLocal(row.operational_period_start),
    operational_period_end: toDateTimeLocal(row.operational_period_end),
    radio_channels: Array.isArray(row.radio_channels) ? row.radio_channels : [],
    special_instructions: row.special_instructions || '',
    prepared_by_name: row.prepared_by_name || '',
    prepared_by_position: row.prepared_by_position || '',
    preparation_date: toDateTimeLocal(row.preparation_date),
  };
}

function toRow(form) {
  const ts = (v) => (v ? new Date(v).toISOString() : null);
  return { ...form, operational_period_start: ts(form.operational_period_start), operational_period_end: ts(form.operational_period_end), preparation_date: ts(form.preparation_date) };
}

/**
 * Create/edit the ICS 205 radio plan for one site and export it as PDF
 * (rendered locally, so it works offline once the form is saved).
 * @param {{ open: boolean, onClose: () => void, location: Object|null, deployment: Object|null, form: Object|null }} props
 */
export function Ics205Dialog({ open, onClose, location, deployment, form: existing }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [exporting, setExporting] = useState(false);
  const editable = canEdit(user?.app_role, 'location');

  useEffect(() => {
    if (!open) return;
    setForm(existing ? toForm(existing) : { ...emptyForm(), incident_name: deployment?.name || '', prepared_by_name: user?.full_name || '' });
  }, [open, existing, deployment?.name, user?.full_name]);

  const save = useMutation({
    mutationFn: (/** @type {Object} */ data) => (existing ? db.ics205Forms.update(existing.id, data) : db.ics205Forms.create({ ...data, deployment_location_id: location.id })),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.ics205Forms }); toast.success('ICS 205 saved'); onClose(); },
    onError: reportMutationError('Save ICS 205'),
  });

  const exportPdf = async () => {
    setExporting(true);
    try {
      const blob = await renderIcs205Pdf({ form: toRow(form), locationName: location?.name, deploymentName: deployment?.name });
      downloadBlob(blob, `ICS205_${safeFileName(form.incident_name || location?.name)}.pdf`, 'application/pdf');
    } catch (err) {
      toast.error(`PDF export failed: ${err.message || 'unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const updateChannel = (index, key, value) => setForm(f => ({ ...f, radio_channels: f.radio_channels.map((c, i) => (i === index ? { ...c, [key]: value } : c)) }));
  const addChannel = () => setForm(f => ({ ...f, radio_channels: [...f.radio_channels, { ...EMPTY_CHANNEL }] }));
  const removeChannel = (index) => setForm(f => ({ ...f, radio_channels: f.radio_channels.filter((_, i) => i !== index) }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-2 pr-6">
            <div>
              <DialogTitle>ICS 205 · Incident Radio Communications Plan</DialogTitle>
              <DialogDescription>{location?.name}{deployment ? ` · ${deployment.name}` : ''}</DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={exportPdf} loading={exporting}><FileDown /> Export PDF</Button>
          </div>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); save.mutate(toRow(form)); }} className="space-y-5">
          <fieldset disabled={!editable} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <FormField label="1. Incident name" required>
                {({ id }) => <Input id={id} value={form.incident_name} onChange={(e) => setForm({ ...form, incident_name: e.target.value })} required />}
              </FormField>
              <FormField label="3. Operational period start">
                {({ id }) => <Input id={id} type="datetime-local" value={form.operational_period_start} onChange={(e) => setForm({ ...form, operational_period_start: e.target.value })} />}
              </FormField>
              <FormField label="Operational period end">
                {({ id }) => <Input id={id} type="datetime-local" value={form.operational_period_end} onChange={(e) => setForm({ ...form, operational_period_end: e.target.value })} />}
              </FormField>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-sm font-semibold"><Radio className="h-4 w-4 text-muted-foreground" /> 4. Basic radio channel use</Label>
                {editable && <Button type="button" size="sm" variant="outline" onClick={addChannel}><Plus /> Add channel</Button>}
              </div>
              {form.radio_channels.length === 0 ? (
                <EmptyState compact icon={Radio} title="No channels yet" description="Add each frequency or talkgroup this site will use." action={editable && <Button type="button" size="sm" onClick={addChannel}><Plus /> Add channel</Button>} />
              ) : (
                <ol className="space-y-2">
                  {form.radio_channels.map((ch, index) => (
                    <li key={index} className="rounded-md border bg-muted/30 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel {index + 1}</span>
                        {editable && <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove channel" className="text-destructive hover:text-destructive" onClick={() => removeChannel(index)}><Trash2 /></Button>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        {CHANNEL_FIELDS.map(({ key, label, help, placeholder, mono }) => (
                          <div key={key} className="space-y-1">
                            <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              {label}
                              <Hint label={help}><HelpCircle className="h-3 w-3 cursor-help" /></Hint>
                            </Label>
                            <Input value={ch[key] ?? ''} onChange={(e) => updateChannel(index, key, e.target.value)} placeholder={placeholder} className={`h-8 text-xs ${mono ? 'font-mono' : ''}`} aria-label={`${label}, channel ${index + 1}`} />
                          </div>
                        ))}
                        <div className="space-y-1">
                          <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">Mode <Hint label="A = Analog, D = Digital, M = Mixed"><HelpCircle className="h-3 w-3 cursor-help" /></Hint></Label>
                          <Select value={ch.mode || 'A'} onValueChange={(v) => updateChannel(index, 'mode', v)}>
                            <SelectTrigger className="h-8 text-xs" aria-label={`Mode, channel ${index + 1}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A">Analog</SelectItem>
                              <SelectItem value="D">Digital</SelectItem>
                              <SelectItem value="M">Mixed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2 space-y-1 sm:col-span-3 lg:col-span-4">
                          <Label className="text-[11px] text-muted-foreground">Remarks</Label>
                          <Input value={ch.remarks ?? ''} onChange={(e) => updateChannel(index, 'remarks', e.target.value)} className="h-8 text-xs" aria-label={`Remarks, channel ${index + 1}`} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <FormField label="5. Special instructions" hint="Safety notes, net procedures, tactical call signs, backup channels">
              {({ id }) => <Textarea id={id} rows={4} value={form.special_instructions} onChange={(e) => setForm({ ...form, special_instructions: e.target.value })} />}
            </FormField>

            <div className="grid gap-4 border-t pt-4 md:grid-cols-3">
              <FormField label="6. Prepared by (name)">
                {({ id }) => <Input id={id} value={form.prepared_by_name} onChange={(e) => setForm({ ...form, prepared_by_name: e.target.value })} />}
              </FormField>
              <FormField label="Position / title">
                {({ id }) => <Input id={id} value={form.prepared_by_position} onChange={(e) => setForm({ ...form, prepared_by_position: e.target.value })} placeholder="e.g., COML" />}
              </FormField>
              <FormField label="2. Date / time prepared">
                {({ id }) => <Input id={id} type="datetime-local" value={form.preparation_date} onChange={(e) => setForm({ ...form, preparation_date: e.target.value })} />}
              </FormField>
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{editable ? 'Cancel' : 'Close'}</Button>
            {editable && <Button type="submit" loading={save.isPending}>{existing ? 'Save changes' : 'Save ICS 205'}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
