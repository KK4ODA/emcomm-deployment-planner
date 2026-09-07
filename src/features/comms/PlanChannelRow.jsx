import React from 'react';
import { Trash2, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Hint } from '@/components/ui/tooltip';
import { channelSummary, PATH_ROLES, CHANNEL_FUNCTIONS, CONDITIONS, snapshotStale } from '@/lib/comms';
import { cn } from '@/lib/utils';

const NONE = '__none__';
const ROLE_VARIANT = { primary: 'success', alternate: 'info', contingency: 'warning', emergency: 'critical' };

/**
 * One plan row: the channel snapshot plus its use in this plan. Planners edit
 * inline; others see a static line.
 * @param {{
 *   row: Object, libraryChannel?: Object|null, canEdit: boolean,
 *   onChange: (patch: Object) => void, onRemove: () => void, onSync: () => void,
 *   onMove?: (dir: -1|1) => void, first?: boolean, last?: boolean
 * }} props
 */
export function PlanChannelRow({ row, libraryChannel, canEdit, onChange, onRemove, onSync, onMove, first, last }) {
  const stale = snapshotStale(row, libraryChannel);
  const commit = (key) => (e) => { const v = e.target.value; if ((row[key] ?? '') !== v) onChange({ [key]: v || null }); };
  return (
    <li className={cn('grid gap-2 px-3 py-2 text-sm md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-start', stale && 'bg-warning/5')}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          <Badge variant={ROLE_VARIANT[row.path_role] || 'outline'}>{PATH_ROLES[row.path_role]?.label || row.path_role}</Badge>
          {row.channel_name}
          {row.net && <span className="text-xs font-normal text-muted-foreground">· {row.net} net</span>}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{channelSummary(row)}</p>
        {stale && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-warning">
            Library copy changed.
            {canEdit && <button type="button" onClick={onSync} className="inline-flex items-center gap-1 underline"><RefreshCw className="h-3 w-3" /> Update from library</button>}
          </p>
        )}
      </div>

      {canEdit ? (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          <Select value={row.path_role} onValueChange={(v) => onChange({ path_role: v })}>
            <SelectTrigger className="h-8 text-xs" aria-label="Role"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(PATH_ROLES).map(([k, r]) => <SelectItem key={k} value={k}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(row.condition_level)} onValueChange={(v) => onChange({ condition_level: Number(v) })}>
            <SelectTrigger className="h-8 text-xs" aria-label="Condition"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CONDITIONS).map(([k, c]) => <SelectItem key={k} value={k}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={row.function || NONE} onValueChange={(v) => onChange({ function: v === NONE ? null : v })}>
            <SelectTrigger className="h-8 text-xs" aria-label="Function"><SelectValue placeholder="Function" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No function</SelectItem>
              {CHANNEL_FUNCTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="h-8 text-xs" defaultValue={row.net || ''} onBlur={commit('net')} placeholder="Net (RACE)" aria-label="Net" key={`net-${row.id}-${row.net}`} />
          <Input className="h-8 text-xs sm:col-span-2" defaultValue={row.assignment || ''} onBlur={commit('assignment')} placeholder="Who uses it (All AID stations)" aria-label="Assignment" key={`as-${row.id}-${row.assignment}`} />
          <Input className="h-8 text-xs" defaultValue={row.channel_number || ''} onBlur={commit('channel_number')} placeholder="Ch #" aria-label="Channel number" key={`ch-${row.id}-${row.channel_number}`} />
          <Input className="h-8 text-xs sm:col-span-2" defaultValue={row.remarks || ''} onBlur={commit('remarks')} placeholder="Remarks" aria-label="Remarks" key={`rm-${row.id}-${row.remarks}`} />
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {[row.function, row.assignment, row.remarks].filter(Boolean).join(' · ')}
        </div>
      )}

      {canEdit && (
        <div className="flex items-start gap-0.5 md:justify-end">
          {onMove && <Hint label="Move up"><Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}><ArrowUp /></Button></Hint>}
          {onMove && <Hint label="Move down"><Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={last} onClick={() => onMove(1)}><ArrowDown /></Button></Hint>}
          <Hint label="Remove from plan"><Button variant="ghost" size="icon-sm" aria-label={`Remove ${row.channel_name}`} className="text-destructive hover:text-destructive" onClick={onRemove}><Trash2 /></Button></Hint>
        </div>
      )}
    </li>
  );
}
