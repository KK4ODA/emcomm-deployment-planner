import React from 'react';
import { Calendar, Globe, Pencil, Trash2, Save, FileDown, ArrowRight, MoreHorizontal, Check } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DeploymentStatusBadge } from '@/components/common/Badges';
import { formatDate } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * @param {{
 *   deployment: Object, stats: { sites: number, categories: number, items: number, assigned: number, unassigned: number },
 *   isCurrent: boolean, permissions: { canEdit: boolean, canDelete: boolean, canExport: boolean, canTemplate: boolean },
 *   onOpen: () => void, onEdit: () => void, onDelete: () => void, onExport: (includeGoKit: boolean) => void, onSaveTemplate: () => void, exporting?: boolean
 * }} props
 */
export function DeploymentCard({ deployment, stats, isCurrent, permissions, onOpen, onEdit, onDelete, onExport, onSaveTemplate, exporting }) {
  const hasMenu = permissions.canEdit || permissions.canDelete || permissions.canExport || permissions.canTemplate;
  return (
    <Card className={cn('flex h-full flex-col', isCurrent && 'ring-1 ring-accent/60')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold leading-tight">{deployment.name}</h3>
              <DeploymentStatusBadge status={deployment.status} />
              {isCurrent && <span className="inline-flex items-center gap-1 text-xs text-accent"><Check className="h-3 w-3" /> Active</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {deployment.location && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{deployment.location}</span>}
              {deployment.start_date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(deployment.start_date)}{deployment.end_date && ` – ${formatDate(deployment.end_date)}`}
                </span>
              )}
            </div>
          </div>
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Deployment actions"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {permissions.canEdit && <DropdownMenuItem onClick={onEdit}><Pencil /> Edit details</DropdownMenuItem>}
                {permissions.canTemplate && <DropdownMenuItem onClick={onSaveTemplate}><Save /> Save as template</DropdownMenuItem>}
                {permissions.canExport && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onExport(true)} disabled={exporting}><FileDown /> Export text (with go-kit list)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onExport(false)} disabled={exporting}><FileDown /> Export text (without go-kit)</DropdownMenuItem>
                  </>
                )}
                {permissions.canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 /> Delete deployment</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {deployment.description && <p className="line-clamp-2 text-sm text-muted-foreground">{deployment.description}</p>}
        <dl className="grid grid-cols-4 gap-2 text-center">
          <Stat label="Sites" value={stats.sites} />
          <Stat label="Items" value={stats.items} />
          <Stat label="Assigned" value={stats.assigned} />
          <Stat label="Open" value={stats.unassigned} critical={stats.unassigned > 0} />
        </dl>
        <Button className="mt-auto w-full" variant={isCurrent ? 'outline' : 'default'} onClick={onOpen}>
          {isCurrent ? 'Go to dashboard' : 'Open deployment'} <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, critical = false }) {
  return (
    <div className="rounded-md bg-muted/60 px-1 py-1.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('tnum text-lg font-semibold leading-tight', critical && 'text-destructive')}>{value}</dd>
    </div>
  );
}
