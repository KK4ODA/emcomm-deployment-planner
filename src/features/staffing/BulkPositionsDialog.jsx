import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { RequirementsEditor } from './RequirementsEditor';
import { ShiftsEditor, blankShift } from './ShiftsEditor';
import { POSITION_TYPES } from '@/lib/capabilities';
import { expandPattern, parseNumberList } from '@/lib/staffing';
import { schemeDefaults } from '@/lib/naming';
import { BookmarkPlus } from 'lucide-react';

/**
 * "AID MILE 2, 4, 6 … 24" in one go: a name pattern, a number list, shared
 * type, requirements and shift template.
 * @param {{ open: boolean, onClose: () => void, periods: Object[], deployment: Object, onSubmit: (data: Object) => void, submitting?: boolean, schemes?: Object[], onSaveScheme?: (data: { pattern: string, tacticalPattern: string, type: string, net: string, requirements: Object[] }) => void }} props
 */
export function BulkPositionsDialog({ open, onClose, periods, deployment, onSubmit, submitting, schemes = [], onSaveScheme }) {
  const [pattern, setPattern] = useState('AID MILE {n}');
  const [tactical, setTactical] = useState('AID {n}');
  const [numbers, setNumbers] = useState('1-10');
  const [type, setType] = useState('aid_station');
  const [requirements, setRequirements] = useState(/** @type {Object[]} */ ([]));
  const [shifts, setShifts] = useState(/** @type {Object[]} */ ([]));
  const [net, setNet] = useState('');
  const applyScheme = (id) => {
    const s = schemes.find(x => x.id === id);
    if (!s) return;
    setPattern(s.position_pattern || '');
    setTactical(s.tactical_pattern || '');
    const d = schemeDefaults(s);
    if (d.position_type) setType(d.position_type);
    setNet(d.net || '');
    setRequirements(d.requirements || []);
  };

  useEffect(() => { if (open) setShifts([blankShift(periods, deployment)]); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => parseNumberList(numbers), [numbers]);
  const preview = useMemo(() => expandPattern(pattern, list.slice(0, 4)), [pattern, list]);

  const submit = (e) => {
    e.preventDefault();
    if (!list.length || !pattern.trim()) return;
    onSubmit({
      pattern, tacticalPattern: tactical.trim() ? tactical.trim().toUpperCase() : '', numbers: list,
      base: { position_type: type, headcount: 1, requirements, net: net.trim() || null },
      shifts,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create several positions</DialogTitle>
          <DialogDescription>Numbered positions with the same type, requirements and shifts. Edit any of them afterwards.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {schemes.length > 0 && (
            <FormField label="Start from a saved scheme" hint="Fills the patterns, type, net and requirements">
              {({ id }) => (
                <Select onValueChange={applyScheme}>
                  <SelectTrigger id={id}><SelectValue placeholder="Pick a scheme" /></SelectTrigger>
                  <SelectContent>{schemes.map(s => <SelectItem key={s.id} value={s.id}>{s.name} · {s.position_pattern}{s.tactical_pattern ? ` / ${s.tactical_pattern}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Name pattern" required hint="{n} is replaced by each number">
              {({ id }) => <Input id={id} value={pattern} onChange={(e) => setPattern(e.target.value)} required autoFocus />}
            </FormField>
            <FormField label="Tactical call pattern" hint="Optional">
              {({ id }) => <Input id={id} value={tactical} onChange={(e) => setTactical(e.target.value)} className="font-mono uppercase" />}
            </FormField>
            <FormField label="Numbers" required hint="e.g. 1-14 or 2, 4, 6">
              {({ id }) => <Input id={id} value={numbers} onChange={(e) => setNumbers(e.target.value)} required />}
            </FormField>
          </div>
          <FormField label="Type">
            {({ id }) => (
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>{POSITION_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="Net" hint="Which net these positions report to (optional)">
            {({ id }) => <Input id={id} value={net} onChange={(e) => setNet(e.target.value)} placeholder="e.g. RACE" />}
          </FormField>
          <RequirementsEditor value={requirements} onChange={setRequirements} />
          <ShiftsEditor value={shifts} onChange={setShifts} periods={periods} deployment={deployment} />
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            {list.length === 0 ? 'Enter at least one number.' : <>Creates <strong>{list.length}</strong> position{list.length === 1 ? '' : 's'}: {preview.join(', ')}{list.length > 4 ? ', …' : ''}</>}
          </p>
          <DialogFooter>
            {onSaveScheme && <Button type="button" variant="ghost" className="sm:mr-auto" onClick={() => onSaveScheme({ pattern, tacticalPattern: tactical, type, net, requirements })} disabled={!pattern.trim()} title="Remember this pattern for the group"><BookmarkPlus /> Save as scheme</Button>}
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting} disabled={!list.length}>Create {list.length || ''} positions</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
