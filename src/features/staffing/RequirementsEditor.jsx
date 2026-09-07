import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CAPABILITIES, STATION_TYPES, LICENSE_CLASSES, REQUIREMENT_KINDS, requirementLabel } from '@/lib/capabilities';

/** @type {{ kind: string, value: string|number, mandatory: boolean }} */
const DEFAULT_ROW = { kind: 'capability', value: 'vhf_voice', mandatory: true };

/**
 * Edit the requirement list of a position: each row is a kind, a value from
 * that kind's vocabulary (or a number / free text) and a mandatory flag.
 * @param {{ value: Object[], onChange: (rows: Object[]) => void }} props
 */
export function RequirementsEditor({ value, onChange }) {
  const [draft, setDraft] = useState(/** @type {{ kind: string, value: string|number, mandatory: boolean }} */ (DEFAULT_ROW));

  const add = () => {
    if (draft.value === '' || draft.value == null) return;
    onChange([...value, { ...draft, value: draft.kind === 'power_hours' ? Number(draft.value) : draft.value }]);
    setDraft(DEFAULT_ROW);
  };
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const toggleMandatory = (i) => onChange(value.map((r, idx) => (idx === i ? { ...r, mandatory: !r.mandatory } : r)));

  const setKind = (kind) => {
    const first = kind === 'capability' ? CAPABILITIES[0].id : kind === 'station_type' ? STATION_TYPES[0].id : kind === 'license_class' ? 'technician' : kind === 'power_hours' ? 6 : '';
    setDraft({ kind, value: first, mandatory: true });
  };

  return (
    <div className="space-y-2">
      <Label>Requirements</Label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((r, i) => (
            <li key={`${r.kind}-${r.value}-${i}`} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs">
              <span className={r.mandatory ? 'font-medium' : 'text-muted-foreground'}>{requirementLabel(r, false)}</span>
              <label className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground" title="Mandatory requirements mark an assigned operator as at risk when unmet">
                <Checkbox checked={r.mandatory} onCheckedChange={() => toggleMandatory(i)} className="h-3 w-3" /> must
              </label>
              <button type="button" onClick={() => remove(i)} aria-label={`Remove requirement ${requirementLabel(r)}`} className="rounded p-0.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
        <Select value={draft.kind} onValueChange={setKind}>
          <SelectTrigger aria-label="Requirement kind"><SelectValue /></SelectTrigger>
          <SelectContent>{REQUIREMENT_KINDS.map(k => <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>)}</SelectContent>
        </Select>
        {draft.kind === 'capability' && (
          <Select value={String(draft.value)} onValueChange={(v) => setDraft({ ...draft, value: v })}>
            <SelectTrigger aria-label="Capability"><SelectValue /></SelectTrigger>
            <SelectContent>{CAPABILITIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {draft.kind === 'station_type' && (
          <Select value={String(draft.value)} onValueChange={(v) => setDraft({ ...draft, value: v })}>
            <SelectTrigger aria-label="Station type"><SelectValue /></SelectTrigger>
            <SelectContent>{STATION_TYPES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {draft.kind === 'license_class' && (
          <Select value={String(draft.value)} onValueChange={(v) => setDraft({ ...draft, value: v })}>
            <SelectTrigger aria-label="Minimum licence class"><SelectValue /></SelectTrigger>
            <SelectContent>{LICENSE_CLASSES.filter(l => l.id !== 'none' && l.id !== 'other').map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {draft.kind === 'power_hours' && (
          <Input type="number" min={1} max={72} step={1} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} aria-label="Hours of independent power" />
        )}
        {draft.kind === 'other' && (
          <Input value={String(draft.value)} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="e.g. Bring a folding table" aria-label="Other requirement" />
        )}
        <Button type="button" variant="outline" onClick={add}><Plus /> Add</Button>
      </div>
      <p className="text-xs text-muted-foreground">Requirements are matched against operator profiles when you assign. "Must" ones flag an assignment as at risk when unmet.</p>
    </div>
  );
}
