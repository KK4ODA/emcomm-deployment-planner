import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { Checkbox } from '@/components/ui/checkbox';
import { RequirementsEditor } from './RequirementsEditor';
import { ShiftsEditor, blankShift } from './ShiftsEditor';
import { POSITION_TYPES, normalizeRequirements } from '@/lib/capabilities';
import { deriveTactical, matchScheme, schemeDefaults } from '@/lib/naming';

const NONE = '__none__';
const EMPTY = { name: '', tactical_callsign: '', position_type: 'station', site_id: '', headcount: 1, net: '', supervisor_position_id: '', briefing_notes: '', requirements: [], open_signup: true };

/**
 * Create or edit a position with its requirements and shifts.
 * @param {{
 *   open: boolean, onClose: () => void, position?: Object|null, shifts?: Object[],
 *   sites: Object[], positions: Object[], periods: Object[], deployment: Object,
 *   onSubmit: (data: Object, shifts: Object[]) => void, submitting?: boolean
 *   schemes?: Object[]
 * }} props
 */
export function PositionForm({ open, onClose, position, shifts: existingShifts = [], sites, positions, periods, deployment, onSubmit, submitting, schemes = [] }) {
  const [form, setForm] = useState(EMPTY);
  const [shiftRows, setShiftRows] = useState(/** @type {Object[]} */ ([]));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (position) {
      setForm({
        name: position.name || '', tactical_callsign: position.tactical_callsign || '', position_type: position.position_type || 'station',
        site_id: position.site_id || '', headcount: position.headcount || 1, net: position.net || '',
        supervisor_position_id: position.supervisor_position_id || '', briefing_notes: position.briefing_notes || '',
        requirements: normalizeRequirements(position.requirements),
        open_signup: position.open_signup !== false,
      });
      setShiftRows(existingShifts.map(s => ({ ...s, headcount: s.headcount ?? '' })));
    } else {
      setForm(EMPTY);
      setShiftRows([blankShift(periods, deployment)]);
    }
  }, [open, position]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));
  // Naming schemes: typing "AID MILE 12" suggests the tactical call and the
  // scheme's type, net and requirements when those are still empty.
  const setName = (value) => setForm(f => {
    const next = { ...f, name: value };
    if (position) return next;
    const hit = matchScheme(value, schemes);
    if (!hit) return next;
    const tactical = deriveTactical(value, schemes);
    if (tactical && (!f.tactical_callsign || f.tactical_callsign === deriveTactical(f.name, schemes))) next.tactical_callsign = tactical;
    const d = schemeDefaults(hit.scheme);
    if (d.position_type && f.position_type === 'station') next.position_type = d.position_type;
    if (d.net && !f.net) next.net = d.net;
    if (d.requirements && !f.requirements.length) next.requirements = d.requirements;
    return next;
  });

  const submit = (e) => {
    e.preventDefault();
    for (const s of shiftRows) {
      if (!s.starts_at || !s.ends_at) { setError('Every shift needs a start and an end.'); return; }
      if (new Date(s.ends_at) <= new Date(s.starts_at)) { setError('A shift must end after it starts.'); return; }
    }
    setError('');
    onSubmit({
      name: form.name.trim(),
      tactical_callsign: form.tactical_callsign.trim().toUpperCase() || null,
      position_type: form.position_type || null,
      site_id: form.site_id || null,
      headcount: Math.max(1, Number(form.headcount) || 1),
      net: form.net.trim() || null,
      supervisor_position_id: form.supervisor_position_id || null,
      briefing_notes: form.briefing_notes.trim() || null,
      requirements: form.requirements,
      open_signup: form.open_signup !== false,
    }, shiftRows);
  };

  const supervisors = positions.filter(p => p.id !== position?.id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{position ? 'Edit position' : 'New position'}</DialogTitle>
          <DialogDescription>A position is a job to staff: where, when, what it needs, and who supervises it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem_6rem]">
            <FormField label="Position name" required>
              {({ id }) => <Input id={id} value={form.name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AID MILE 12, SAG 3, Net Control" required autoFocus />}
            </FormField>
            <FormField label="Tactical call" hint="Used on the air">
              {({ id }) => <Input id={id} value={form.tactical_callsign} onChange={(e) => set('tactical_callsign')(e.target.value.toUpperCase())} placeholder="AID 12" className="font-mono uppercase" />}
            </FormField>
            <FormField label="People">
              {({ id }) => <Input id={id} type="number" min={1} value={form.headcount} onChange={(e) => set('headcount')(e.target.value)} />}
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type">
              {({ id }) => (
                <Select value={form.position_type} onValueChange={set('position_type')}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>{POSITION_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Site" hint="Leave empty for mobile positions">
              {({ id }) => (
                <Select value={form.site_id || NONE} onValueChange={(v) => set('site_id')(v === NONE ? '' : v)}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No fixed site (mobile)</SelectItem>
                    {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Net" hint="Which net this position reports to">
              {({ id }) => <Input id={id} value={form.net} onChange={(e) => set('net')(e.target.value)} placeholder="e.g. RACE, SAG" />}
            </FormField>
            <FormField label="Reports to">
              {({ id }) => (
                <Select value={form.supervisor_position_id || NONE} onValueChange={(v) => set('supervisor_position_id')(v === NONE ? '' : v)}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Net control / none</SelectItem>
                    {supervisors.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.tactical_callsign ? ` (${p.tactical_callsign})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>

          <RequirementsEditor value={form.requirements} onChange={set('requirements')} />

          <ShiftsEditor value={shiftRows} onChange={setShiftRows} periods={periods} deployment={deployment} error={error} />

          <FormField label="Briefing notes" hint="Shown to the assigned operator in their packet">
            {({ id }) => <Textarea id={id} rows={3} value={form.briefing_notes} onChange={(e) => set('briefing_notes')(e.target.value)} placeholder="What to do, who to contact, anything specific to this position" />}
          </FormField>

          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={form.open_signup !== false} onCheckedChange={(v) => setForm(f => ({ ...f, open_signup: v === true }))} className="mt-0.5" />
            <span><span className="font-medium">Operators may sign themselves up</span><span className="block text-xs text-muted-foreground">Open shifts on this position appear on every operator's My assignments page. Untick for positions you fill by hand (net control, shadows).</span></span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting}>{position ? 'Save changes' : 'Create position'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
