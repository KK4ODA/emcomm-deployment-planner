import React from 'react';
import { Circle, Play, CheckCircle2, Pencil, Trash2, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import { CallSign } from '@/components/common/CallSign';
import { TaskPriorityBadge } from '@/components/common/Badges';
import { NEXT_TASK_STATUS, TASK_STATUS } from '@/lib/constants';
import { formatDate } from '@/lib/time';
import { cn } from '@/lib/utils';

const STATUS_ICON = { pending: Circle, in_progress: Play, completed: CheckCircle2 };

/**
 * @param {{ task: Object, canEdit: boolean, canDelete: boolean, canAdvance: boolean, onEdit: Function, onDelete: Function, onAdvance: Function, highlight?: boolean }} props
 */
export function TaskCard({ task, canEdit, canDelete, canAdvance, onEdit, onDelete, onAdvance, highlight }) {
  const Icon = STATUS_ICON[task.status] || Circle;
  const next = NEXT_TASK_STATUS[task.status];
  const done = task.status === 'completed';
  const overdue = !done && task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());
  const advanceLabel = task.status === 'pending' ? 'Start' : 'Mark done';
  return (
    <article className={cn('group flex gap-2.5 rounded-md border bg-card p-2.5 text-sm shadow-sm', done && 'opacity-75', highlight && 'ring-1 ring-accent/60')}>
      <Hint label={next && canAdvance ? `${advanceLabel} (${TASK_STATUS[next].label})` : TASK_STATUS[task.status]?.label || task.status}>
        <button
          type="button"
          disabled={!next || !canAdvance}
          onClick={() => onAdvance(task)}
          aria-label={next && canAdvance ? advanceLabel : TASK_STATUS[task.status]?.label}
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-default',
            done ? 'border-success bg-success text-success-foreground' : task.status === 'in_progress' ? 'border-info text-info hover:bg-info/10' : 'border-input text-muted-foreground hover:border-info hover:text-info',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </Hint>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('font-medium leading-snug', done && 'line-through')}>{task.name}</p>
          {(canEdit || canDelete) && (
            <div className="-mr-1 -mt-1 flex shrink-0 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100">
              {canEdit && <Button variant="ghost" size="icon-sm" aria-label="Edit task" onClick={() => onEdit(task)}><Pencil className="h-3.5 w-3.5" /></Button>}
              {canDelete && <Button variant="ghost" size="icon-sm" aria-label="Delete task" className="text-destructive hover:text-destructive" onClick={() => onDelete(task)}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          )}
        </div>
        {task.description && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <TaskPriorityBadge priority={task.priority} />
          {task.assigned_to_call_sign ? <CallSign value={task.assigned_to_call_sign} /> : <span className="text-[11px] text-muted-foreground">Unassigned</span>}
          {task.due_date && (
            <span className={cn('inline-flex items-center gap-1 text-[11px]', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              <CalendarClock className="h-3 w-3" /> {overdue ? 'Overdue · ' : 'Due '}{formatDate(task.due_date, 'MMM d')}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
