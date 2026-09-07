import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/time';
import { ROUTES } from '@/app/routes';

/**
 * One-line pointer to the signed-in operator's packet, shown on the dashboard
 * when they hold an assignment in the current deployment.
 * @param {{ assignment: Object, shifts: Object[], positions: Object[] }} props
 */
export function PacketBanner({ assignment, shifts, positions }) {
  const shift = shifts.find(s => s.id === assignment.shift_id);
  const position = shift ? positions.find(p => p.id === shift.position_id) : null;
  if (!shift || !position) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <BookOpen className="h-4 w-4 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        Your assignment: <strong>{position.name}</strong>{position.tactical_callsign && <span className="ml-1 font-mono text-primary">{position.tactical_callsign}</span>}
        <span className="text-muted-foreground"> · {formatDateTime(shift.muster_at || shift.starts_at, 'EEE MMM d, HH:mm')}</span>
        {assignment.status === 'offered' && <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">awaiting your reply</span>}
      </span>
      <Button asChild size="sm"><Link to={assignment.status === 'offered' ? ROUTES.myAssignments : ROUTES.packet}>{assignment.status === 'offered' ? 'Respond' : 'Open my packet'} <ArrowRight /></Link></Button>
    </div>
  );
}
