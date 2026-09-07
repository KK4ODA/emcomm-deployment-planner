import React, { useState } from 'react';
import { Check, X, MapPin, Clock, Radio, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/common/Section';
import { AssignmentStatusBadge } from '@/components/common/Badges';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

export const DECLINE_REASONS = ['Schedule conflict', 'Cannot travel there', 'Not equipped for it', 'Other'];

/**
 * The operator's position assignments in this deployment: offers to answer
 * first, then confirmed ones. Plain language, two big buttons per offer.
 * @param {{
 *   items: Array<{ assignment: Object, shift: Object, position: Object, site?: Object|null }>,
 *   onRespond: (assignmentId: string, status: 'accepted'|'declined', reason?: string) => void,
 *   busyId?: string|null
 * }} props
 */
export function OfferList({ items, onRespond, busyId }) {
  const offers = items.filter(i => i.assignment.status === 'offered');
  const others = items.filter(i => i.assignment.status !== 'offered');
  if (!items.length) return null;
  return (
    <Section title="My positions" icon={Radio} aside={offers.length ? `${offers.length} to answer` : `${others.length}`} bodyClassName="p-0">
      <ul className="divide-y">
        {offers.map(item => <OfferRow key={item.assignment.id} item={item} onRespond={onRespond} busy={busyId === item.assignment.id} />)}
        {others.map(item => <OfferRow key={item.assignment.id} item={item} onRespond={onRespond} busy={busyId === item.assignment.id} />)}
      </ul>
    </Section>
  );
}

function OfferRow({ item, onRespond, busy }) {
  const { assignment, shift, position, site } = item;
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const offered = assignment.status === 'offered';
  const done = ['declined', 'cancelled', 'released', 'no_show'].includes(assignment.status);
  return (
    <li className={cn('px-3 py-3', offered && 'bg-accent/5', done && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">
            {position.name}
            {position.tactical_callsign && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">{position.tactical_callsign}</span>}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDateTime(shift.starts_at, 'EEE MMM d, HH:mm')}–{formatDateTime(shift.ends_at, 'HH:mm')}{shift.muster_at && <> · report {formatDateTime(shift.muster_at, 'HH:mm')}</>}</span>
            {site && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {site.name}</span>}
          </p>
        </div>
        <AssignmentStatusBadge status={assignment.status} />
      </div>

      {offered && !declining && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
          <Button size="lg" className="h-12 text-base" onClick={() => onRespond(assignment.id, 'accepted')} loading={busy}><Check /> I will be there</Button>
          <Button size="lg" variant="outline" className="h-12 text-base" onClick={() => setDeclining(true)} disabled={busy}><X /> I cannot</Button>
        </div>
      )}
      {offered && declining && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="w-56" aria-label="Reason"><SelectValue /></SelectTrigger>
            <SelectContent>{DECLINE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="destructive" onClick={() => onRespond(assignment.id, 'declined', reason)} loading={busy}>Decline</Button>
          <Button variant="ghost" onClick={() => setDeclining(false)} disabled={busy}>Back</Button>
        </div>
      )}
      {assignment.status === 'accepted' && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"><ChevronDown className="h-3 w-3" /> Need to back out?</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-56" aria-label="Reason"><SelectValue /></SelectTrigger>
              <SelectContent>{DECLINE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => onRespond(assignment.id, 'declined', reason)} loading={busy}>Withdraw and tell the coordinator</Button>
          </div>
        </details>
      )}
    </li>
  );
}
