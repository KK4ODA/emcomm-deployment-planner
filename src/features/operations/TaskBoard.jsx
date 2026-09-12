import React, { useMemo, useState } from 'react';
import { ListTodo, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/common/Section';
import { TASK_STATUS, TASK_PRIORITY, TASK_KINDS, deskTaskActions, taskRoute, taskAgeMinutes, taskAttention, sortTasks, isOpenTask } from '@/lib/tasking';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const ATTENTION_CLASS = { critical: 'border-destructive/60 bg-destructive/5', warning: 'border-warning/60 bg-warning/5', none: '' };
const TONE_BADGE = { neutral: 'outline', info: 'info', warning: 'warning', success: 'success', muted: 'muted', critical: 'critical' };

/**
 * The desk's task list: open tasks first (urgent, then oldest), with the
 * next steps as buttons, then the closed ones folded away.
 * @param {{
 *   tasks: Object[], positionsById: Map<string, Object>, sitesById: Map<string, Object>, usersById?: Map<string, Object>,
 *   canDispatch: boolean, onDispatch: () => void, onStep: (task: Object, status: string) => void, busyId?: string|null, now?: Date
 * }} props
 */
export function TaskBoard({ tasks, positionsById, sitesById, canDispatch, onDispatch, onStep, busyId = null, now = new Date() }) {
  const [showClosed, setShowClosed] = useState(false);
  const sorted = useMemo(() => sortTasks(tasks, now), [tasks, now]);
  const open = sorted.filter(isOpenTask);
  const closed = sorted.filter(t => !isOpenTask(t));
  const kindLabel = (k) => TASK_KINDS.find(x => x.id === k)?.label || k;
  const Row = ({ t }) => {
    const unit = t.position_id ? positionsById.get(t.position_id) : null;
    const st = TASK_STATUS[t.status] || TASK_STATUS.issued;
    const att = taskAttention(t, now);
    const age = taskAgeMinutes(t, now);
    const route = taskRoute(t, sitesById);
    const actions = canDispatch ? deskTaskActions(t.status) : [];
    return (
      <li className={cn('px-3 py-2', ATTENTION_CLASS[att])}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="tnum text-xs text-muted-foreground">#{t.seq}</span>
          <span className="font-mono text-sm font-semibold">{unit ? (unit.tactical_callsign || unit.name) : 'Any unit'}</span>
          {t.priority !== 'routine' && <Badge variant={TONE_BADGE[TASK_PRIORITY[t.priority].tone]}>{TASK_PRIORITY[t.priority].label}</Badge>}
          <Badge variant={TONE_BADGE[st.tone]}>{st.short}</Badge>
          {isOpenTask(t) && <span className={cn('tnum text-xs', att === 'critical' ? 'text-destructive' : att === 'warning' ? 'text-warning' : 'text-muted-foreground')}>{age} min</span>}
          <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(t.issued_at, 'HH:mm')}</span>
        </div>
        <p className="mt-0.5 text-sm">{t.title}{route ? <span className="text-muted-foreground"> · {route}</span> : null}</p>
        {(t.detail || t.outcome) && <p className="text-xs text-muted-foreground">{t.detail}{t.outcome ? ` → ${t.outcome}` : ''}</p>}
        {actions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {actions.map(a => <Button key={a.status} size="sm" variant={a.destructive ? 'ghost' : a.status === 'complete' ? 'default' : 'outline'} className={cn('h-9 sm:h-7 text-xs', a.destructive && 'text-destructive hover:text-destructive')} disabled={busyId === t.id} onClick={() => onStep(t, a.status)}>{a.label}</Button>)}
            <span className="ml-auto self-center text-[11px] text-muted-foreground">{kindLabel(t.kind)}</span>
          </div>
        )}
      </li>
    );
  };
  return (
    <Section title="Tasks" icon={ListTodo} aside={<span className="flex items-center gap-2">{open.length ? `${open.length} open` : 'none open'}{canDispatch && <Button size="sm" onClick={onDispatch}><Plus /> Dispatch</Button>}</span>} bodyClassName="p-0">
      <ul className="max-h-[28rem] divide-y overflow-y-auto text-sm">
        {open.map(t => <Row key={t.id} t={t} />)}
        {open.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">Nothing open. Dispatch sends a unit somewhere with something to do; they acknowledge and close it from their packet or over APRS, and every step feeds the ICS 214.</li>}
      </ul>
      {closed.length > 0 && (
        <div className="border-t">
          <button type="button" onClick={() => setShowClosed(v => !v)} className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">{closed.length} closed{showClosed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
          {showClosed && <ul className="max-h-[16rem] divide-y overflow-y-auto border-t text-sm opacity-80">{closed.map(t => <Row key={t.id} t={t} />)}</ul>}
        </div>
      )}
    </Section>
  );
}
