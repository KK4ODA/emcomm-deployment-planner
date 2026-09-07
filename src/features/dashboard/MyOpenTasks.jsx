import React from 'react';
import { Link } from 'react-router-dom';
import { ListTodo, Play, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/common/Section';
import { TaskPriorityBadge } from '@/components/common/Badges';
import { NEXT_TASK_STATUS } from '@/lib/constants';
import { formatDate } from '@/lib/time';
import { ROUTES } from '@/app/routes';

/**
 * The signed-in operator's open tasks in this deployment, most urgent first,
 * with a one-click "advance" action.
 * @param {{ tasks: Object[], callSign: string, siteNameById: Map<string,string>, onAdvance: (task: Object) => void, limit?: number }} props
 */
export function MyOpenTasks({ tasks, callSign, siteNameById, onAdvance, limit = 8 }) {
  const shown = tasks.slice(0, limit);
  return (
    <Section id="my-open-tasks" title={<>My open tasks <span className="font-mono text-xs font-normal text-muted-foreground">{callSign}</span></>} icon={ListTodo} aside={`${tasks.length} open`} bodyClassName="p-0">
      {shown.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">Nothing assigned to you is open. Nice.</p>
      ) : (
        <ul className="divide-y">
          {shown.map(task => {
            const next = NEXT_TASK_STATUS[task.status];
            const inProgress = task.status === 'in_progress';
            return (
              <li key={task.id} className="flex items-center gap-2 px-3 py-2">
                <Link to={ROUTES.siteTasks(task.deployment_location_id)} className="min-w-0 flex-1 rounded focus-visible:outline-none">
                  <p className="truncate text-sm font-medium">{task.name}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <TaskPriorityBadge priority={task.priority} className="px-1 py-0 text-[10px]" />
                    <span className="inline-flex items-center gap-1">{inProgress ? <Play className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{inProgress ? 'In progress' : 'Pending'}</span>
                    {siteNameById.get(task.deployment_location_id) && <span>· {siteNameById.get(task.deployment_location_id)}</span>}
                    {task.due_date && <span>· due {formatDate(task.due_date, 'MMM d')}</span>}
                  </p>
                </Link>
                {next && (
                  <Button size="sm" variant={inProgress ? 'default' : 'outline'} className="h-7 shrink-0 px-2 text-xs" onClick={() => onAdvance(task)}>
                    {inProgress ? <Check /> : <Play />} {inProgress ? 'Done' : 'Start'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {tasks.length > limit && <p className="border-t px-3 py-1.5 text-center text-xs text-muted-foreground">Showing {limit} of {tasks.length}</p>}
    </Section>
  );
}
