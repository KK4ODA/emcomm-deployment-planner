import React, { useMemo, useState } from 'react';
import { BadgeCheck, ExternalLink, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Section } from '@/components/common/Section';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { openExternal } from '@/lib/platform';
import { REGISTRATION_STATUS, registrationRoster, registrationSummary, registrationUrgency, registrationBlocking } from '@/lib/registration';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const TONE_BADGE = { neutral: 'outline', info: 'info', warning: 'warning', success: 'success', muted: 'muted', critical: 'critical' };

/**
 * Who the served agency has actually accepted. Assigning an operator here
 * does not put them on the host's roster, and the gap between the two lists
 * is what cost the UASI exercise a team leader on the morning of the event.
 * @param {{
 *   deployment: Object, assignments: Object[], usersById: Map<string, Object>, registrations: Object[],
 *   canEdit: boolean, onSet: (userId: string, patch: Object) => void, busyUserId?: string|null, now?: Date
 * }} props
 */
export function RegistrationPanel({ deployment, assignments, usersById, registrations, canEdit, onSet, busyUserId = null, now = new Date() }) {
  const [editing, setEditing] = useState(/** @type {string|null} */ (null));
  const [reference, setReference] = useState('');
  const roster = useMemo(() => registrationRoster({ assignments, usersById, registrations }), [assignments, usersById, registrations]);
  const summary = registrationSummary(roster);
  const urgency = registrationUrgency(deployment, now);
  const deadline = deployment.registration_deadline;

  const aside = (
    <span className="flex items-center gap-2">
      <span className={cn(summary.outstanding ? (urgency === 'critical' ? 'text-destructive' : urgency === 'warning' ? 'text-warning' : '') : 'text-success')}>
        {summary.confirmed} of {summary.total} confirmed
      </span>
      {deadline && <span>· by {formatDateTime(deadline, 'MMM d HH:mm')}</span>}
    </span>
  );

  return (
    <Section title="Agency registration" icon={BadgeCheck} aside={aside} bodyClassName="p-0">
      {(deployment.registration_notes || deployment.registration_url) && (
        <p className="border-b px-3 py-2 text-xs text-muted-foreground sm:px-4">
          {deployment.registration_notes}
          {deployment.registration_url && (
            <Button variant="link" size="sm" className="h-auto px-1.5 py-0 text-xs" onClick={() => openExternal(deployment.registration_url)}>
              Registration page <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </p>
      )}
      {summary.rejected > 0 && (
        <p className="flex items-center gap-1.5 border-b border-destructive/40 bg-destructive/5 px-3 py-2 text-xs sm:px-4">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          {summary.rejected} operator{summary.rejected === 1 ? ' was' : 's were'} rejected by the agency. Reassign their position or resolve it with the host before the day.
        </p>
      )}
      <ul className="divide-y text-sm">
        {roster.map(r => {
          const meta = REGISTRATION_STATUS[r.status] || REGISTRATION_STATUS.not_submitted;
          return (
            <li key={r.userId} className={cn('flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4', r.status === 'rejected' && 'bg-destructive/5')}>
              <span className="font-mono text-sm font-semibold">{r.user?.call_sign || '—'}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{r.user?.full_name}</span>
              {r.row?.reference && <span className="font-mono text-[11px] text-muted-foreground">#{r.row.reference}</span>}
              <Badge variant={TONE_BADGE[meta.tone]}>{meta.short}</Badge>
              {canEdit && (
                <Select value={r.status} onValueChange={(v) => onSet(r.userId, { status: v })} disabled={busyUserId === r.userId}>
                  <SelectTrigger className="h-8 w-40" aria-label={`Registration for ${r.user?.call_sign || 'operator'}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(REGISTRATION_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {canEdit && editing === r.userId ? (
                <form
                  className="flex gap-1"
                  onSubmit={(e) => { e.preventDefault(); onSet(r.userId, { reference: reference.trim() || null }); setEditing(null); }}
                >
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Agency reference" className="h-8 w-36" autoFocus />
                  <Button type="submit" size="sm" className="h-8">Save</Button>
                </form>
              ) : canEdit && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setEditing(r.userId); setReference(r.row?.reference || ''); }}>
                  {r.row?.reference ? 'Edit ref' : 'Add ref'}
                </Button>
              )}
            </li>
          );
        })}
        {roster.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground sm:px-4">Nobody is assigned yet. Operators appear here as soon as they are offered a shift.</li>}
      </ul>
      {roster.length > 0 && (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground sm:px-4">
          {summary.outstanding === 0
            ? 'Everyone assigned is on the agency roster.'
            : `${summary.outstanding} still to confirm: ${roster.filter(r => registrationBlocking(r.status)).slice(0, 6).map(r => r.user?.call_sign || '?').join(', ')}${summary.outstanding > 6 ? ', …' : ''}`}
        </p>
      )}
    </Section>
  );
}
