import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Pencil, Trash2, ListTodo, Package, FileText, User, Navigation, AlertTriangle, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
import { CallSignList, CallSign } from '@/components/common/CallSign';
import { ProgressBar } from '@/components/common/ProgressBar';
import { parseCoordinates } from '@/lib/coordinates';
import { openExternal } from '@/lib/platform';
import { ROUTES } from '@/app/routes';
import { cn } from '@/lib/utils';

/**
 * @param {{
 *   location: Object, itemStats: { itemCount: number, assigneeCount: number, unassignedCount: number },
 *   taskSummary: { total: number, completed: number }, hasIcs205: boolean,
 *   missingOperators?: string[], onAddOperators?: () => void, addingOperators?: boolean,
 *   canEdit: boolean, canDelete: boolean, onEdit: () => void, onDelete: () => void, onIcs205: () => void
 * }} props
 */
export function SiteCard({ location, itemStats, taskSummary, hasIcs205, missingOperators = [], onAddOperators, addingOperators, canEdit, canDelete, onEdit, onDelete, onIcs205 }) {
  const coords = parseCoordinates(location.address);
  const mapsHref = coords ? `https://www.google.com/maps?q=${coords[0]},${coords[1]}` : null;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 rounded-md bg-info/10 p-1.5 text-info"><MapPin className="h-4 w-4" aria-hidden /></div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold leading-tight">{location.name}</h3>
              {location.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{location.description}</p>}
            </div>
          </div>
          {(canEdit || canDelete) && (
            <div className="flex shrink-0">
              {canEdit && <Hint label="Edit site"><Button variant="ghost" size="icon-sm" aria-label="Edit site" onClick={onEdit}><Pencil /></Button></Hint>}
              {canDelete && <Hint label="Delete site"><Button variant="ghost" size="icon-sm" aria-label="Delete site" className="text-destructive hover:text-destructive" onClick={onDelete}><Trash2 /></Button></Hint>}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 text-sm">
        <dl className="space-y-1 text-xs text-muted-foreground">
          {location.address && (
            <div className="flex items-start gap-1.5">
              <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {mapsHref ? (
                <a href={mapsHref} onClick={(e) => { e.preventDefault(); openExternal(mapsHref); }} className="font-mono hover:underline" title="Open in maps">{location.address}</a>
              ) : <span>{location.address}</span>}
            </div>
          )}
          {location.contact_person && (
            <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" aria-hidden /> Contact <CallSign value={location.contact_person} /></div>
          )}
        </dl>

        {location.assigned_call_signs?.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Operators</p>
            <CallSignList values={location.assigned_call_signs} max={8} />
          </div>
        )}

        {missingOperators.length > 0 && (
          <div role="note" className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              <span>
                {missingOperators.length === 1 ? 'An operator has' : `${missingOperators.length} operators have`} equipment or tasks here but {missingOperators.length === 1 ? 'is' : 'are'} not on the site roster:
              </span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5">
              <CallSignList values={missingOperators} max={6} />
              {canEdit && onAddOperators && (
                <Button size="sm" variant="outline" className="ml-auto h-6 px-2 text-[11px]" onClick={onAddOperators} loading={addingOperators}>
                  <UserPlus /> Add to roster
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="mt-auto space-y-2 border-t pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="tnum text-muted-foreground">{itemStats.itemCount} items · {itemStats.assigneeCount} operators</span>
            <span className={cn('tnum font-medium', itemStats.unassignedCount ? 'text-destructive' : 'text-success')}>
              {itemStats.unassignedCount ? `${itemStats.unassignedCount} unassigned` : itemStats.itemCount ? 'all assigned' : 'no items'}
            </span>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Setup tasks</span>
              <span className="tnum">{taskSummary.completed}/{taskSummary.total}</span>
            </div>
            <ProgressBar value={taskSummary.completed} max={taskSummary.total} tone={taskSummary.total && taskSummary.completed === taskSummary.total ? 'success' : 'info'} label={`${location.name} task progress`} />
          </div>
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <Button asChild variant="outline" size="sm"><Link to={`${ROUTES.dashboard}?site=${location.id}`} title="Equipment board filtered to this site"><Package /> Equipment</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to={ROUTES.siteTasks(location.id)}><ListTodo /> Tasks</Link></Button>
            <Button variant={hasIcs205 ? 'outline' : 'secondary'} size="sm" onClick={onIcs205}><FileText /> ICS 205</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
