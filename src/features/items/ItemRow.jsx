import React from 'react';
import { Pencil, Trash2, GripVertical, Copy, UserPlus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Hint } from '@/components/ui/tooltip';
import { CallSignList } from '@/components/common/CallSign';
import { ItemPriorityBadge } from '@/components/common/Badges';
import { assigneesOf } from '@/lib/assignments';
import { cn } from '@/lib/utils';

/**
 * One equipment row. Assignment is a multi-select menu of members with call
 * signs; unassigned rows carry a pulsing marker so gaps stand out.
 *
 * @param {{
 *   item: Object, users: Array<{ id: string, call_sign: string, full_name?: string }>,
 *   siteName?: string, canEdit: boolean, canDelete: boolean, canAssign: boolean,
 *   onEdit: (item: Object) => void, onDelete: (item: Object) => void, onDuplicate: (item: Object) => void,
 *   onToggleAssignee: (item: Object, callSign: string) => void, dragHandleProps?: Object, isDragging?: boolean
 * }} props
 */
export function ItemRow({ item, users, siteName, canEdit, canDelete, canAssign, onEdit, onDelete, onDuplicate, onToggleAssignee, dragHandleProps, isDragging }) {
  const assignees = assigneesOf(item);
  const unassigned = assignees.length === 0;

  return (
    <div
      data-unassigned={unassigned ? 'true' : 'false'}
      data-location={item.deployment_location_id}
      className={cn(
        'group flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm transition-shadow',
        isDragging && 'shadow-lg ring-1 ring-accent/40',
        unassigned && 'border-l-2 border-l-destructive/70',
      )}
    >
      {canEdit && dragHandleProps && (
        <button type="button" {...dragHandleProps} aria-label="Drag to reorder" className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium leading-tight">{item.name}</span>
          {item.quantity > 1 && <span className="tnum text-xs text-muted-foreground">×{item.quantity}</span>}
          <ItemPriorityBadge priority={item.priority} />
          {siteName && <span className="truncate text-xs text-muted-foreground">· {siteName}</span>}
        </div>
        {item.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {assignees.length > 0 ? (
          <CallSignList values={assignees} max={3} className="hidden sm:inline-flex" />
        ) : (
          <span className="hidden text-xs font-medium text-destructive sm:inline">Unassigned</span>
        )}

        {canAssign && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={unassigned ? 'accent' : 'outline'} size="sm" className="h-7 px-2 text-xs">
                <UserPlus className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Assign</span>
                {assignees.length > 0 && <span className="tnum sm:hidden">{assignees.length}</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
              <DropdownMenuLabel>Assign to</DropdownMenuLabel>
              {users.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No members with a call sign</p>}
              {users.map(u => (
                <DropdownMenuCheckboxItem
                  key={u.id}
                  checked={assignees.includes(u.call_sign)}
                  onCheckedChange={() => onToggleAssignee(item, u.call_sign)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="font-mono text-xs font-semibold">{u.call_sign}</span>
                  {u.full_name && <span className="ml-2 truncate text-xs text-muted-foreground">{u.full_name}</span>}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {(canEdit || canDelete) && (
          <div className="flex items-center opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {canEdit && (
              <>
                <Hint label="Edit item"><Button variant="ghost" size="icon-sm" onClick={() => onEdit(item)} aria-label="Edit item"><Pencil /></Button></Hint>
                <Hint label="Duplicate item"><Button variant="ghost" size="icon-sm" onClick={() => onDuplicate(item)} aria-label="Duplicate item"><Copy /></Button></Hint>
              </>
            )}
            {canDelete && (
              <Hint label="Delete item"><Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(item)} aria-label="Delete item"><Trash2 /></Button></Hint>
            )}
          </div>
        )}
        {unassigned && !canAssign && <Check className="hidden" aria-hidden />}
      </div>
    </div>
  );
}
