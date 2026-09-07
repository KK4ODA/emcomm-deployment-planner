import React from 'react';
import { Pencil, Trash2, MapPin, Users, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Hint } from '@/components/ui/tooltip';
import { CallSign } from '@/components/common/CallSign';
import { shiftCoverage, occupies } from '@/lib/staffing';
import { requirementLabel, normalizeRequirements, positionTypeLabel } from '@/lib/capabilities';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const STATE_STYLES = {
  covered: 'border-success/40 bg-success/10 text-success hover:bg-success/15',
  pending: 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15',
  open: 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15',
  at_risk: 'border-warning bg-warning/15 text-warning hover:bg-warning/20',
  over: 'border-info/40 bg-info/10 text-info hover:bg-info/15',
};
export const STATE_LABELS = { covered: 'Covered', pending: 'Awaiting reply', open: 'Open', at_risk: 'At risk', over: 'Over-staffed' };

/**
 * One position with its shifts as clickable coverage chips.
 * @param {{
 *   position: Object, shifts: Object[], assignments: Object[], usersById: Map<string, Object>,
 *   siteName?: string, supervisorName?: string, canEdit: boolean,
 *   onEdit: () => void, onDelete: () => void, onOpenShift: (shift: Object) => void
 * }} props
 */
export function PositionCard({ position, shifts, assignments, usersById, siteName, supervisorName, canEdit, onEdit, onDelete, onOpenShift }) {
  const requirements = normalizeRequirements(position.requirements);
  return (
    <article className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {position.name}
            {position.tactical_callsign && <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">{position.tactical_callsign}</span>}
            {position.headcount > 1 && <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"><Users className="h-3 w-3" /> {position.headcount}</span>}
          </h3>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            {position.position_type && <span>{positionTypeLabel(position.position_type)}</span>}
            {siteName && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {siteName}</span>}
            {position.net && <span>Net: {position.net}</span>}
            {supervisorName && <span>Reports to {supervisorName}</span>}
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0">
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${position.name}`} onClick={onEdit}><Pencil /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${position.name}`} className="text-destructive hover:text-destructive" onClick={onDelete}><Trash2 /></Button>
          </div>
        )}
      </div>

      {requirements.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {requirements.map((r, i) => <Badge key={i} variant={r.mandatory ? 'outline' : 'muted'} className="text-[10px]">{requirementLabel(r)}</Badge>)}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {shifts.length === 0 && <span className="inline-flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3 w-3" /> No shift yet</span>}
        {shifts.map(shift => {
          const c = shiftCoverage(shift, position, assignments, usersById);
          const people = assignments.filter(a => a.shift_id === shift.id && occupies(a.status)).map(a => usersById.get(a.user_id)?.call_sign).filter(Boolean);
          return (
            <Hint key={shift.id} label={`${STATE_LABELS[c.state]}: ${c.covered} of ${c.headcount} confirmed${c.pending ? `, ${c.pending} offered` : ''}${c.atRisk ? `, ${c.atRisk} missing a requirement` : ''}`}>
              <button
                type="button"
                onClick={() => onOpenShift(shift)}
                disabled={!canEdit}
                aria-label={`${position.name} shift ${formatDateTime(shift.starts_at, 'MMM d HH:mm')}: ${STATE_LABELS[c.state]}`}
                className={cn('flex min-w-[9rem] flex-col rounded-md border px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-default', STATE_STYLES[c.state])}
              >
                <span className="tnum font-medium">{formatDateTime(shift.starts_at, 'EEE HH:mm')}–{formatDateTime(shift.ends_at, 'HH:mm')}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[11px]">
                  {people.length ? people.map(cs => <CallSign key={cs} value={cs} muted className="border-current/20 bg-transparent text-current" />) : <span>{c.headcount > 1 ? `${c.headcount} open` : 'Open'}</span>}
                  {people.length > 0 && c.open > 0 && <span>+{c.open} open</span>}
                </span>
              </button>
            </Hint>
          );
        })}
      </div>
    </article>
  );
}
