import React from 'react';
import { Users, X, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Multi-select for ARES groups: chips for the selected groups plus a
 * scrollable list of the remaining ones. Shared by Profile, invite, edit
 * and first-run dialogs.
 *
 * @param {{
 *   groups: Array<{ id: string, name: string, region?: string }>,
 *   value: string[], onChange: (ids: string[]) => void,
 *   label?: React.ReactNode, hint?: React.ReactNode, required?: boolean, maxHeight?: string, disabled?: boolean
 * }} props
 */
export function AresGroupPicker({ groups, value, onChange, label = 'ARES groups', hint, required, maxHeight = 'max-h-44', disabled }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter(g => g !== id) : [...value, id]);
  const selected = groups.filter(g => value.includes(g.id));

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {label}
        {required && <span className="text-destructive" aria-hidden>*</span>}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(group => (
            <button key={group.id} type="button" onClick={() => toggle(group.id)} disabled={disabled} className="group rounded-md" aria-label={`Remove ${group.name}`}>
              <Badge variant="info" className="gap-1 pr-1">
                {group.name}
                <X className="h-3 w-3 opacity-70 group-hover:opacity-100" aria-hidden />
              </Badge>
            </button>
          ))}
        </div>
      )}

      <div className={cn('overflow-y-auto rounded-md border bg-card', maxHeight)} role="listbox" aria-multiselectable="true">
        {groups.length === 0 ? (
          <p className="p-3 text-center text-sm text-muted-foreground">No ARES groups have been created yet.</p>
        ) : (
          <ul className="divide-y">
            {groups.map(group => {
              const isSelected = value.includes(group.id);
              return (
                <li key={group.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={disabled}
                    onClick={() => toggle(group.id)}
                    className={cn('flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted', isSelected && 'bg-info/5')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{group.name}</span>
                      {group.region && <span className="block truncate text-xs text-muted-foreground">{group.region}</span>}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-info" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
