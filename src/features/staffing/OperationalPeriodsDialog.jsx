import React, { useState } from 'react';
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateTime, toDateTimeLocal } from '@/lib/time';
import { fromDateTimeLocal } from './ShiftsEditor';

/**
 * Manage the deployment's operational periods (ICS: the time window every
 * plan and form is scoped to). Inline editing, one row at a time.
 * @param {{ open: boolean, onClose: () => void, periods: Object[], deployment: Object, onSave: (row: { id?: string, data: Object }) => Promise<any>, onDelete: (id: string) => void, busy?: boolean }} props
 */
export function OperationalPeriodsDialog({ open, onClose, periods, deployment, onSave, onDelete, busy }) {
  const [editing, setEditing] = useState(/** @type {Object|null} */ (null));
  const [error, setError] = useState('');

  const startNew = () => {
    const last = periods[periods.length - 1];
    const start = last?.ends_at || deployment.starts_at || new Date().toISOString();
    setEditing({ id: null, sequence: (last?.sequence || 0) + 1, label: `Operational period ${(last?.sequence || 0) + 1}`, starts_at: start, ends_at: new Date(new Date(start).getTime() + 12 * 3_600_000).toISOString() });
  };

  const save = async () => {
    if (!editing.starts_at || !editing.ends_at || new Date(editing.ends_at) <= new Date(editing.starts_at)) { setError('End must be after start.'); return; }
    setError('');
    await onSave({ id: editing.id || undefined, data: { sequence: editing.sequence, label: editing.label || null, starts_at: editing.starts_at, ends_at: editing.ends_at } });
    setEditing(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Operational periods</DialogTitle>
          <DialogDescription>Shifts and the communications plan can be scoped to a period. One period is enough for a single-day event.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {periods.map(p => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {editing?.id === p.id ? (
                <PeriodRow row={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} busy={busy} />
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.label || `Period ${p.sequence}`}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(p.starts_at)} → {formatDateTime(p.ends_at)}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="Edit period" onClick={() => setEditing({ ...p })}><Pencil /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete period" className="text-destructive hover:text-destructive" onClick={() => onDelete(p.id)} disabled={periods.length === 1}><Trash2 /></Button>
                </>
              )}
            </li>
          ))}
          {editing && !editing.id && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm">
              <PeriodRow row={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} busy={busy} />
            </li>
          )}
        </ul>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        {!editing && <Button variant="outline" onClick={startNew}><Plus /> Add period</Button>}
      </DialogContent>
    </Dialog>
  );
}

function PeriodRow({ row, onChange, onSave, onCancel, busy }) {
  return (
    <div className="flex-1 space-y-2">
      <Input value={row.label || ''} onChange={(e) => onChange({ ...row, label: e.target.value })} placeholder="Label, e.g. Race day / Condition 2" className="h-8 text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <Input type="datetime-local" className="h-8 text-xs" value={toDateTimeLocal(row.starts_at)} onChange={(e) => onChange({ ...row, starts_at: fromDateTimeLocal(e.target.value) })} />
        <Input type="datetime-local" className="h-8 text-xs" value={toDateTimeLocal(row.ends_at)} onChange={(e) => onChange({ ...row, ends_at: fromDateTimeLocal(e.target.value) })} />
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={onSave} loading={busy}><Check /> Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X /> Cancel</Button>
      </div>
    </div>
  );
}
