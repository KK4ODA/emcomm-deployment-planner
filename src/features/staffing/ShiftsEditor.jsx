import React from 'react';
import { Plus, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toDateTimeLocal } from '@/lib/time';

const NONE = '__none__';

/** ISO string from a datetime-local value, or null. */
export function fromDateTimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A blank shift draft, defaulting to the first period or the deployment window. */
export function blankShift(periods, deployment) {
  const p = periods[0];
  const start = p?.starts_at || deployment?.starts_at || new Date(Date.now() + 86_400_000).toISOString();
  const end = p?.ends_at || deployment?.ends_at || new Date(new Date(start).getTime() + 8 * 3_600_000).toISOString();
  return { starts_at: start, ends_at: end, muster_at: null, headcount: '', operational_period_id: p?.id || '', notes: '' };
}

/**
 * Edit the shifts of a position. Values are ISO strings; inputs are
 * datetime-local in the browser's zone.
 * @param {{ value: Object[], onChange: (rows: Object[]) => void, periods: Object[], deployment: Object, error?: string }} props
 */
export function ShiftsEditor({ value, onChange, periods, deployment, error }) {
  const update = (i, patch) => onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, blankShift(periods, deployment)]);
  const duplicate = (i) => { const { id: _id, ...copy } = value[i]; onChange([...value.slice(0, i + 1), copy, ...value.slice(i + 1)]); };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Shifts <span className="font-normal text-muted-foreground">(when this position is staffed)</span></Label>
        <Button type="button" variant="outline" size="sm" onClick={add}><Plus /> Add shift</Button>
      </div>
      {value.length === 0 && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No shifts yet. A position without a shift cannot be assigned.</p>}
      <ul className="space-y-2">
        {value.map((s, i) => (
          <li key={s.id || `new-${i}`} className="rounded-md border p-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_5rem]">
              <label className="text-xs">
                <span className="text-muted-foreground">Start</span>
                <Input type="datetime-local" value={toDateTimeLocal(s.starts_at)} onChange={(e) => update(i, { starts_at: fromDateTimeLocal(e.target.value) })} required />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">End</span>
                <Input type="datetime-local" value={toDateTimeLocal(s.ends_at)} onChange={(e) => update(i, { ends_at: fromDateTimeLocal(e.target.value) })} required />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Muster / report time <span className="opacity-70">(optional)</span></span>
                <Input type="datetime-local" value={toDateTimeLocal(s.muster_at)} onChange={(e) => update(i, { muster_at: fromDateTimeLocal(e.target.value) })} />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">People</span>
                <Input type="number" min={1} placeholder="pos." value={s.headcount ?? ''} onChange={(e) => update(i, { headcount: e.target.value })} title="Leave blank to use the position headcount" />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {periods.length > 0 && (
                <Select value={s.operational_period_id || NONE} onValueChange={(v) => update(i, { operational_period_id: v === NONE ? '' : v })}>
                  <SelectTrigger className="h-8 w-56 text-xs" aria-label="Operational period"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No operational period</SelectItem>
                    {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.label || `Period ${p.sequence}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Input className="h-8 flex-1 text-xs" placeholder="Shift note, e.g. bring lunch; relieved by SAG 5" value={s.notes || ''} onChange={(e) => update(i, { notes: e.target.value })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Duplicate shift" onClick={() => duplicate(i)}><Copy /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove shift" className="text-destructive hover:text-destructive" onClick={() => remove(i)}><Trash2 /></Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
