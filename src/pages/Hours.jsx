import React, { useMemo, useState } from 'react';
import { Clock, Download, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { CallSign } from '@/components/common/CallSign';
import { useAuth } from '@/lib/AuthContext';
import { useHourEntries, useUsers } from '@/hooks/useEntities';
import { hoursRollup } from '@/lib/icsForms';
import { hoursCsv, ACTIVITY_TYPES } from '@/lib/operations';
import { downloadBlob } from '@/lib/download';
import { formatDate } from '@/lib/time';
import { isPlanner } from '@/lib/permissions';

const BUCKETS = ['emergency', 'public_service', 'training', 'net', 'admin', 'maintenance'];

function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function addMonths(key, n) { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); }

/** Group-wide participation hours by month: the numbers the monthly ARRL report asks for. */
export default function Hours() {
  const { user } = useAuth();
  const hoursQ = useHourEntries();
  const usersQ = useUsers();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const usersById = useMemo(() => new Map((usersQ.data ?? []).map(u => [u.id, u])), [usersQ.data]);
  const scope = useMemo(() => (isPlanner(user?.app_role) ? hoursQ.data ?? [] : (hoursQ.data ?? []).filter(e => e.user_id === user?.id)), [hoursQ.data, user]);
  const { rows, totals } = useMemo(() => hoursRollup(scope, month, usersById), [scope, month, usersById]);
  const monthEntries = scope.filter(e => String(e.occurred_on).slice(0, 7) === month);

  return (
    <>
      <PageHeader
        icon={Clock}
        title="Hours"
        description={isPlanner(user?.app_role) ? 'Participation hours for your groups, by operator and activity. Derived from check-outs plus manual entries.' : 'Your participation hours by month.'}
        actions={(
          <>
            <div className="inline-flex items-center rounded-md border">
              <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))}><ChevronLeft /></Button>
              <span className="tnum px-2 text-sm font-medium">{formatDate(`${month}-01`, 'MMMM yyyy')}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))}><ChevronRight /></Button>
            </div>
            <Button variant="outline" onClick={() => downloadBlob(hoursCsv(monthEntries, usersById), `hours_${month}.csv`, 'text/csv;charset=utf-8')} disabled={monthEntries.length === 0}><Download /> CSV</Button>
          </>
        )}
      />
      <QueryState queries={[hoursQ, usersQ]}>
        {rows.length === 0 ? (
          <EmptyState icon={Clock} title={`No hours in ${formatDate(`${month}-01`, 'MMMM yyyy')}`} description="Hours appear when operators check out of a shift or add time on their profile." />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Operators" value={totals.operators} icon={Users} />
              <StatCard label="Total hours" value={totals.total} icon={Clock} tone="info" />
              <StatCard label="Public service" value={totals.public_service} icon={Clock} tone="accent" />
              <StatCard label="Emergency" value={totals.emergency} icon={Clock} tone={totals.emergency ? 'critical' : 'neutral'} />
            </div>
            <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operator</TableHead>
                    {BUCKETS.map(b => <TableHead key={b} className="text-right">{ACTIVITY_TYPES[b]}</TableHead>)}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.userId}>
                      <TableCell><span className="flex flex-wrap items-center gap-1.5">{r.callSign && <CallSign value={r.callSign} />} {r.name}{r.estimated > 0 && <span className="text-xs text-warning" title="Some entries were estimated from the schedule">~</span>}</span></TableCell>
                      {BUCKETS.map(b => <TableCell key={b} className="tnum text-right">{r[b] || ''}</TableCell>)}
                      <TableCell className="tnum text-right font-semibold">{r.total}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total</TableCell>
                    {BUCKETS.map(b => <TableCell key={b} className="tnum text-right">{totals[b] || ''}</TableCell>)}
                    <TableCell className="tnum text-right">{totals.total}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">ARRL monthly report buckets: emergency operations; public service; training, drills and nets; administration. "~" marks operators with entries estimated from the scheduled shift because a check-in or check-out time was missing.</p>
          </>
        )}
      </QueryState>
    </>
  );
}
