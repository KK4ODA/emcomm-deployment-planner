import React from 'react';
import { Target, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/common/Section';
import { CallSign } from '@/components/common/CallSign';
import { OBJECTIVE_STATUS, objectiveActions, sortObjectives } from '@/lib/objectives';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const TONE = { warning: 'warning', info: 'info', success: 'success', muted: 'muted' };

/**
 * Objectives with claim / done buttons. Used on the Objectives page and,
 * compactly, on My assignments.
 * @param {{ objectives: Object[], user: Object, isPlanner: boolean, usersById: Map<string, Object>, onStatus: (id: string, status: string) => void, onEdit?: (o: Object) => void, onDelete?: (o: Object) => void, busyId?: string|null, compact?: boolean, title?: string }} props
 */
export function ObjectiveList({ objectives, user, isPlanner, usersById, onStatus, onEdit, onDelete, busyId, compact = false, title = 'Objectives' }) {
  const list = sortObjectives(objectives);
  const done = list.filter(o => o.status === 'done').length;
  if (!list.length) return null;
  return (
    <Section title={title} icon={Target} aside={`${done} of ${list.filter(o => o.status !== 'dropped').length} done`} bodyClassName="p-0">
      <ul className="divide-y">
        {list.map(o => {
          const actions = objectiveActions(o, user, isPlanner);
          const primary = actions.find(a => a.primary);
          const rest = actions.filter(a => a !== primary);
          const claimer = o.claimed_by ? usersById.get(o.claimed_by) : null;
          return (
            <li key={o.id} className={cn('flex flex-wrap items-start gap-2 px-3 py-2 text-sm', o.status === 'done' && 'opacity-80', o.status === 'dropped' && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <p className={cn('font-medium', o.status === 'done' && 'line-through decoration-success/60')}>{o.title}{o.points ? <span className="ml-2 tnum text-xs text-muted-foreground">{o.points} pts</span> : null}</p>
                {!compact && o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {o.category && <span className="mr-2">{o.category}</span>}
                  {o.status === 'claimed' && claimer && <>taken by <CallSign value={claimer.call_sign} /> {formatDateTime(o.claimed_at, 'MMM d HH:mm')}</>}
                  {o.status === 'done' && <>done {formatDateTime(o.completed_at, 'MMM d HH:mm')}{claimer ? <> by <CallSign value={claimer.call_sign} /></> : ''}{o.evidence ? ` · ${o.evidence}` : ''}</>}
                </p>
              </div>
              <Badge variant={TONE[OBJECTIVE_STATUS[o.status]?.tone] || 'outline'}>{OBJECTIVE_STATUS[o.status]?.label || o.status}</Badge>
              <div className="flex flex-wrap gap-1">
                {primary && <Button size="sm" onClick={() => onStatus(o.id, primary.status)} loading={busyId === o.id}>{primary.label}</Button>}
                {rest.map(a => <Button key={a.status} size="sm" variant="ghost" onClick={() => onStatus(o.id, a.status)} disabled={busyId === o.id}>{a.label}</Button>)}
                {isPlanner && onEdit && <Button size="icon-sm" variant="ghost" aria-label={`Edit ${o.title}`} onClick={() => onEdit(o)}><Pencil /></Button>}
                {isPlanner && onDelete && <Button size="icon-sm" variant="ghost" aria-label={`Delete ${o.title}`} className="text-destructive hover:text-destructive" onClick={() => onDelete(o)}><Trash2 /></Button>}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
