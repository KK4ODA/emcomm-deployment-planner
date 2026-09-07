import React, { useState } from 'react';
import { HandHelping, Clock, MapPin, Check, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/common/Section';
import { formatDateTime } from '@/lib/time';
import { requirementLabel } from '@/lib/capabilities';
import { cn } from '@/lib/utils';

/**
 * The sign-up sheet: open shifts the operator can take with one confirmation.
 * @param {{
 *   items: ReturnType<import('@/lib/staffing').openShifts>,
 *   siteName?: Map<string, string>,
 *   positionName?: Map<string, string>,
 *   onTake: (shiftId: string) => void,
 *   busyId?: string|null,
 *   limit?: number
 * }} props
 */
export function OpenShiftBoard({ items, siteName = new Map(), positionName = new Map(), onTake, busyId, limit = 12 }) {
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;
  const visible = showAll ? items : items.slice(0, limit);
  const takeable = items.filter(i => i.canTake).length;
  return (
    <Section title="Open shifts" icon={HandHelping} aside={`${takeable} you could take`} bodyClassName="p-0">
      <p className="border-b px-3 py-2 text-xs text-muted-foreground">Take a shift and it is yours; the coordinator is told. You can still withdraw from My positions.</p>
      <ul className="divide-y">
        {visible.map(item => <OpenShiftRow key={item.shift.id} item={item} siteName={siteName} positionName={positionName} onTake={onTake} busy={busyId === item.shift.id} />)}
      </ul>
      {items.length > limit && (
        <button type="button" onClick={() => setShowAll(v => !v)} className="w-full border-t px-3 py-2 text-xs text-primary hover:underline">
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </Section>
  );
}

function OpenShiftRow({ item, siteName, positionName, onTake, busy }) {
  const { shift, position, open, headcount, match, overlaps, canTake } = item;
  const [confirming, setConfirming] = useState(false);
  const reasons = [
    ...match.unmet.map(r => ({ tone: 'critical', text: `Needs ${requirementLabel(r)}` })),
    ...overlaps.map(a => ({ tone: 'critical', text: `Overlaps your shift${positionName.get(a.shift_id) ? ` at ${positionName.get(a.shift_id)}` : ''}` })),
    ...match.unknown.map(r => ({ tone: 'warning', text: `Confirm ${requirementLabel(r)} on your profile` })),
    ...match.optionalUnmet.map(r => ({ tone: 'muted', text: `Prefers ${requirementLabel(r)}` })),
  ];
  return (
    <li className={cn('px-3 py-3', !canTake && 'opacity-80')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">
            {position.name}
            {position.tactical_callsign && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">{position.tactical_callsign}</span>}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDateTime(shift.starts_at, 'EEE MMM d, HH:mm')}–{formatDateTime(shift.ends_at, 'HH:mm')}{shift.muster_at && <> · report {formatDateTime(shift.muster_at, 'HH:mm')}</>}</span>
            {position.site_id && siteName.get(position.site_id) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {siteName.get(position.site_id)}</span>}
          </p>
          {reasons.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {reasons.map((r, i) => <Badge key={i} variant={r.tone === 'critical' ? 'critical' : r.tone === 'warning' ? 'warning' : 'outline'} className="font-normal">{r.tone === 'critical' && <AlertTriangle className="mr-1 h-3 w-3" />}{r.text}</Badge>)}
            </p>
          )}
        </div>
        <Badge variant={open === headcount ? 'critical' : 'warning'}>{open} of {headcount} open</Badge>
      </div>
      {confirming ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
          <Button size="lg" className="h-12 text-base" onClick={() => { onTake(shift.id); setConfirming(false); }} loading={busy}><Check /> Yes, I will be there</Button>
          <Button size="lg" variant="outline" className="h-12 text-base" onClick={() => setConfirming(false)} disabled={busy}><X /> Not now</Button>
        </div>
      ) : (
        <div className="mt-2">
          <Button variant={canTake ? 'default' : 'outline'} size="sm" onClick={() => setConfirming(true)} disabled={!canTake || busy} title={canTake ? undefined : reasons.find(r => r.tone === 'critical')?.text}>
            <HandHelping /> Take this shift
          </Button>
        </div>
      )}
    </li>
  );
}
