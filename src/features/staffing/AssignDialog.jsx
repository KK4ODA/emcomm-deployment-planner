import React, { useMemo, useState } from 'react';
import { UserPlus, Check, X, AlertTriangle, Clock, HelpCircle, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/common/SearchInput';
import { CallSign } from '@/components/common/CallSign';
import { AssignmentStatusBadge } from '@/components/common/Badges';
import { UserAvatar } from '@/components/common/UserAvatar';
import { rankCandidates, shiftCoverage, occupies, compareAssignments } from '@/lib/staffing';
import { requirementLabel, normalizeRequirements } from '@/lib/capabilities';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * Assign operators to one shift. Shows who is on it and a ranked list of
 * everyone else: qualified and free first, with the reasons inline. The
 * coordinator can still pick anyone.
 * @param {{
 *   open: boolean, onClose: () => void, position: Object|null, shift: Object|null,
 *   users: Object[], assignments: Object[], shifts: Object[],
 *   onOffer: (userId: string, status: 'offered'|'accepted') => void,
 *   onSetStatus: (assignmentId: string, status: string) => void,
 *   onRemove: (assignmentId: string) => void, busy?: boolean
 * }} props
 */
export function AssignDialog({ open, onClose, position, shift, users, assignments, shifts, onOffer, onSetStatus, onRemove, busy }) {
  const [search, setSearch] = useState('');
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  if (!position || !shift) return null;

  const current = assignments.filter(a => a.shift_id === shift.id).sort(compareAssignments);
  const coverage = shiftCoverage(shift, position, assignments, usersById);
  const requirements = normalizeRequirements(position.requirements);
  const q = search.trim().toLowerCase();
  const candidates = rankCandidates(position, shift, users, assignments, shifts)
    .filter(c => !c.alreadyHere || !occupies(current.find(a => a.user_id === c.user.id)?.status))
    .filter(c => !q || [c.user.call_sign, c.user.full_name, c.user.locality].some(v => v?.toLowerCase().includes(q)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {position.name}
            {position.tactical_callsign && <span className="font-mono text-base font-normal text-muted-foreground">{position.tactical_callsign}</span>}
          </DialogTitle>
          <DialogDescription>
            {formatDateTime(shift.starts_at, 'EEE MMM d, HH:mm')} → {formatDateTime(shift.ends_at, 'HH:mm')}
            {shift.muster_at && <> · report {formatDateTime(shift.muster_at, 'HH:mm')}</>}
            {' · '}{coverage.covered}/{coverage.headcount} covered{coverage.pending ? `, ${coverage.pending} awaiting reply` : ''}
          </DialogDescription>
        </DialogHeader>

        {requirements.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Needs:</span>
            {requirements.map((r, i) => <Badge key={i} variant={r.mandatory ? 'outline' : 'muted'}>{requirementLabel(r)}</Badge>)}
          </div>
        )}

        <section aria-label="Assigned operators" className="rounded-md border">
          <h3 className="border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this shift</h3>
          {current.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nobody yet.</p> : (
            <ul className="divide-y">
              {current.map(a => {
                const u = usersById.get(a.user_id);
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <UserAvatar user={u || { email: '?' }} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">{u?.call_sign && <CallSign value={u.call_sign} />} {u?.full_name || u?.email || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.status === 'offered' ? `Offered ${formatDateTime(a.offered_at, 'MMM d HH:mm')}, no reply yet` : a.status === 'declined' && a.decline_reason ? `Declined: ${a.decline_reason}` : ''}
                      </p>
                    </div>
                    <AssignmentStatusBadge status={a.status} />
                    <div className="flex gap-1">
                      {a.status === 'offered' && <Button size="sm" variant="outline" onClick={() => onSetStatus(a.id, 'accepted')} disabled={busy} title="Confirm on their behalf"><Check /> Confirm</Button>}
                      {['offered', 'accepted'].includes(a.status) && <Button size="sm" variant="ghost" onClick={() => onSetStatus(a.id, 'cancelled')} disabled={busy}><X /> Cancel</Button>}
                      {['declined', 'cancelled', 'no_show'].includes(a.status) && <Button size="sm" variant="ghost" onClick={() => onRemove(a.id)} disabled={busy} aria-label="Remove record"><Trash2 /></Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Candidates" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who could take it</h3>
            <SearchInput value={search} onChange={setSearch} placeholder="Call sign or name" className="w-56" />
          </div>
          {candidates.length === 0 ? <p className="text-sm text-muted-foreground">No members with a call sign match.</p> : (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
              {candidates.map(({ user, match, overlaps }) => {
                const problems = [];
                for (const r of match.unmet) problems.push({ tone: 'critical', icon: AlertTriangle, text: `Missing ${requirementLabel(r)}` });
                for (const r of match.unknown) problems.push({ tone: 'warning', icon: HelpCircle, text: `Profile does not say: ${requirementLabel(r)}` });
                for (const r of match.optionalUnmet) problems.push({ tone: 'muted', icon: HelpCircle, text: `Nice to have: ${requirementLabel(r)}` });
                if (overlaps.length) problems.push({ tone: 'critical', icon: Clock, text: `Already on another shift at this time` });
                const clean = problems.length === 0;
                return (
                  <li key={user.id} className={cn('flex flex-wrap items-center gap-2 px-3 py-2 text-sm', clean && 'bg-success/5')}>
                    <UserAvatar user={user} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium"><CallSign value={user.call_sign} /> {user.full_name}{user.locality && <span className="text-xs font-normal text-muted-foreground">· {user.locality}</span>}</p>
                      {clean ? <p className="text-xs text-success">Meets every requirement, free at this time</p> : (
                        <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                          {problems.map((p, i) => {
                            const Icon = p.icon;
                            return <li key={i} className={cn('inline-flex items-center gap-1', p.tone === 'critical' ? 'text-destructive' : p.tone === 'warning' ? 'text-warning' : 'text-muted-foreground')}><Icon className="h-3 w-3" /> {p.text}</li>;
                          })}
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => onOffer(user.id, 'offered')} disabled={busy}><UserPlus /> Offer</Button>
                      <Button size="sm" variant="ghost" onClick={() => onOffer(user.id, 'accepted')} disabled={busy} title="Skip the acceptance step (they already said yes)">Assign as confirmed</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground"><strong>Offer</strong> notifies the operator and waits for their acceptance. <strong>Assign as confirmed</strong> records them as accepted right away.</p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
