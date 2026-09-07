import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ListTodo, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROUTES } from '@/app/routes';
import { cn } from '@/lib/utils';

const SEGMENTED_MAX = 5;

/**
 * Site filter for the dashboard. Segmented buttons up to five sites (the
 * selection is visible at a glance), a dropdown beyond that. Hidden with a
 * single site.
 * @param {{ locations: Object[], value: string|null, onChange: (id: string|null) => void, className?: string }} props
 */
export function SiteFilter({ locations, value, onChange, className }) {
  if (locations.length < 2) return null;

  if (locations.length > SEGMENTED_MAX) {
    return (
      <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? null : v)}>
        <SelectTrigger className={cn('w-full sm:w-56', className)} aria-label="Filter by site">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sites</SelectItem>
          {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div role="group" aria-label="Filter by site" className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-1', className)}>
      <SegmentButton active={!value} onClick={() => onChange(null)}>All sites</SegmentButton>
      {locations.map(l => (
        <SegmentButton key={l.id} active={value === l.id} onClick={() => onChange(l.id)}>{l.name}</SegmentButton>
      ))}
    </div>
  );
}

function SegmentButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'max-w-[12rem] truncate whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Banner shown while the dashboard is narrowed to one site, so the state is
 * unmistakable and one click away from being cleared.
 * @param {{ location: Object|undefined, onClear: () => void }} props
 */
export function SiteFilterBanner({ location, onClear }) {
  if (!location) return null;
  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-info" aria-hidden /> Showing equipment for <strong>{location.name}</strong> only</span>
      <Link to={ROUTES.siteTasks(location.id)} className="inline-flex items-center gap-1 text-info underline-offset-4 hover:underline"><ListTodo className="h-3.5 w-3.5" /> Site tasks</Link>
      <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /> Show all sites</button>
    </div>
  );
}
