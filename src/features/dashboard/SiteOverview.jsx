import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, CheckCircle2 } from 'lucide-react';
import { Section } from '@/components/common/Section';
import { ProgressBar } from '@/components/common/ProgressBar';
import { summarizeTasks } from '@/lib/tasks';
import { locationItemStats } from '@/lib/deployments';
import { ROUTES } from '@/app/routes';
import { cn } from '@/lib/utils';

/**
 * Per-site readiness: task completion bar and unassigned item count.
 * Clicking a site's unassigned count scrolls to its first unassigned item.
 * @param {{ locations: Object[], tasks: Object[], items: Object[], onJumpToUnassigned: (locationId: string) => void }} props
 */
export function SiteOverview({ locations, tasks, items, onJumpToUnassigned }) {
  return (
    <Section title="Site readiness" icon={MapPin} aside={`${locations.length} site${locations.length === 1 ? '' : 's'}`} bodyClassName="p-0">
      <ul className="divide-y">
        {locations.map(loc => {
          const t = summarizeTasks(tasks.filter(x => x.deployment_location_id === loc.id));
          const s = locationItemStats(items, loc.id);
          const allDone = t.total > 0 && t.completed === t.total;
          return (
            <li key={loc.id} className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <Link to={ROUTES.siteTasks(loc.id)} className="truncate text-sm font-medium hover:underline">{loc.name}</Link>
                <span className={cn('tnum inline-flex items-center gap-1 text-xs', allDone ? 'text-success' : 'text-muted-foreground')}>
                  {allDone && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {t.completed}/{t.total} tasks
                </span>
              </div>
              <ProgressBar value={t.completed} max={t.total} tone={allDone ? 'success' : 'info'} className="mt-1.5" label={`${loc.name} task progress`} />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="tnum">{s.itemCount} items · {s.assigneeCount} operators</span>
                {s.unassignedCount > 0 ? (
                  <button type="button" onClick={() => onJumpToUnassigned(loc.id)} className="tnum rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive hover:bg-destructive/15">
                    {s.unassignedCount} unassigned
                  </button>
                ) : s.itemCount > 0 ? (
                  <span className="text-success">all assigned</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
