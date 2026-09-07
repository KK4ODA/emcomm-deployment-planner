import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Headphones, RefreshCw, LogIn, MapPinCheck, LogOut, CloudOff, MessageSquarePlus, Users, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { Section } from '@/components/common/Section';
import { CallSign } from '@/components/common/CallSign';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useOffline } from '@/contexts/OfflineContext';
import { usePositions, useShifts, useAssignments, useUsers, useActivityLog, useRealtimeInvalidation } from '@/hooks/useEntities';
import { useIntents } from '@/hooks/useIntents';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { buildNcsBoard, ncsSummary, NCS_STATE, nextActions } from '@/lib/operations';
import { queueStatusIntent } from '@/api/assignmentIntents';
import { db } from '@/api/db';
import { formatDateTime } from '@/lib/time';
import { syncNow } from '@/api/syncEngine';
import { buildIcs205aRows, entriesForIcs214 } from '@/lib/icsForms';
import { renderIcs214Pdf, renderIcs205aPdf } from '@/features/comms/icsRecordPdf';
import { downloadBlob, safeFileName } from '@/lib/download';
import { FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NcsBoard() {
  return <DeploymentGate><NcsContent /></DeploymentGate>;
}

const TONE_CLASS = { critical: 'border-destructive/40 bg-destructive/5', warning: 'border-warning/40 bg-warning/5', success: 'border-success/40 bg-success/5', neutral: '', muted: 'opacity-60' };
const ICONS = { checked_in: LogIn, on_position: MapPinCheck, released: LogOut };
const WINDOWS = [{ v: '2', l: 'Now ±2 h' }, { v: '6', l: 'Now ±6 h' }, { v: '24', l: 'Whole day' }, { v: '9999', l: 'Everything' }];

function NcsContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const { isOnline, pendingCount } = useOffline();
  const queryClient = useQueryClient();
  const positionsQ = usePositions();
  const shiftsQ = useShifts();
  const assignmentsQ = useAssignments();
  const usersQ = useUsers();
  const logQ = useActivityLog(deploymentId);
  const { intents } = useIntents();
  useRealtimeInvalidation('assignments', queryKeys.assignments);
  useRealtimeInvalidation('activityLog', [...queryKeys.activityLog, deploymentId]);
  const canRecord = hasPermission(user?.app_role, 'RECORD_CHECKIN_FOR_OTHERS');

  const [net, setNet] = useState('all');
  const [windowHours, setWindowHours] = useState('6');
  const [now, setNow] = useState(() => new Date());
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState(/** @type {string|null} */ (null));
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const positions = useMemo(() => (positionsQ.data ?? []).filter(p => p.deployment_id === deploymentId), [positionsQ.data, deploymentId]);
  const shifts = useMemo(() => (shiftsQ.data ?? []).filter(s => s.deployment_id === deploymentId), [shiftsQ.data, deploymentId]);
  const assignments = useMemo(() => (assignmentsQ.data ?? []).filter(a => a.deployment_id === deploymentId), [assignmentsQ.data, deploymentId]);
  const usersById = useMemo(() => new Map((usersQ.data ?? []).map(u => [u.id, u])), [usersQ.data]);
  const nets = useMemo(() => [...new Set(positions.map(p => p.net).filter(Boolean))].sort(), [positions]);
  const rows = useMemo(() => buildNcsBoard({ positions, shifts, assignments, usersById, intents, now, windowHours: Number(windowHours), net: net === 'all' ? null : net }), [positions, shifts, assignments, usersById, intents, now, windowHours, net]);
  const summary = ncsSummary(rows);
  const asOf = assignmentsQ.dataUpdatedAt ? new Date(assignmentsQ.dataUpdatedAt) : null;

  const record = async (assignment, status) => {
    setBusyId(assignment.id);
    try {
      const r = await queueStatusIntent({ assignmentId: assignment.id, deploymentId, status, online: isOnline });
      if (r.sent) { queryClient.invalidateQueries({ queryKey: queryKeys.assignments }); queryClient.invalidateQueries({ queryKey: [...queryKeys.activityLog, deploymentId] }); }
      else if (r.error?.permanent) toast.error(r.error.message);
      else toast.message('Saved on this device; sends when online.');
    } finally {
      setBusyId(null);
    }
  };

  const [exporting, setExporting] = useState('');
  const exportForm = async (which) => {
    setExporting(which);
    try {
      const blob = which === '214'
        ? await renderIcs214Pdf({ deployment, entries: entriesForIcs214(logQ.data ?? []), preparedByName: user?.full_name })
        : await renderIcs205aPdf({ deployment, rows: buildIcs205aRows({ positions, shifts, assignments, usersById }), preparedByName: user?.full_name });
      downloadBlob(blob, `ICS${which}_${safeFileName(deployment.name)}.pdf`, 'application/pdf');
    } catch (err) {
      toast.error(`PDF failed: ${err.message || 'unknown error'}`);
    } finally {
      setExporting('');
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await db.activityLog.create({ deployment_id: deploymentId, user_id: user.id, recorded_by: user.id, kind: 'note', summary: note.trim(), occurred_at: new Date().toISOString() });
      setNote('');
      queryClient.invalidateQueries({ queryKey: [...queryKeys.activityLog, deploymentId] });
    } catch (err) {
      toast.error(`Could not save note: ${err.message || 'unknown error'}`);
    }
  };

  return (
    <QueryState queries={[positionsQ, shiftsQ, assignmentsQ, usersQ]}>
      <PageHeader
        icon={Headphones}
        eyebrow={deployment.name}
        title="Net control board"
        description={<>Who is on station and who is not, as of {asOf ? formatDateTime(asOf, 'HH:mm:ss') : '—'}{!isOnline && <span className="ml-2 inline-flex items-center gap-1 text-warning"><CloudOff className="h-3.5 w-3.5" /> offline, showing the last copy</span>}{pendingCount > 0 && <span className="ml-2 text-warning">· {pendingCount} change{pendingCount === 1 ? '' : 's'} waiting to sync</span>}</>}
        actions={(
          <>
            {nets.length > 0 && (
              <Select value={net} onValueChange={setNet}>
                <SelectTrigger className="w-36" aria-label="Net"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All nets</SelectItem>{nets.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Select value={windowHours} onValueChange={setWindowHours}>
              <SelectTrigger className="w-36" aria-label="Time window"><SelectValue /></SelectTrigger>
              <SelectContent>{WINDOWS.map(w => <SelectItem key={w.v} value={w.v}>{w.l}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => exportForm('205A')} loading={exporting === '205A'} title="Communications list from the current assignments"><FileDown /> ICS 205A</Button>
            <Button variant="outline" size="sm" onClick={() => exportForm('214')} loading={exporting === '214'} title="Activity log for the deployment"><FileDown /> ICS 214</Button>
            <Button variant="outline" size="sm" onClick={() => { syncNow(); queryClient.invalidateQueries({ queryKey: queryKeys.assignments }); setNow(new Date()); }}><RefreshCw /> Refresh</Button>
          </>
        )}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Headphones} title="No shifts in this window" description="Widen the time window, or add positions and shifts on the Staffing page." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatCard label="On station" value={summary.onStation} icon={CheckCircle2} tone="success" />
            <StatCard label="Not checked in" value={summary.missing} icon={AlertTriangle} tone={summary.missing ? 'critical' : 'neutral'} hint="Shift started, nobody heard" />
            <StatCard label="Nobody assigned" value={summary.uncovered} icon={Users} tone={summary.uncovered ? 'critical' : 'neutral'} />
            <StatCard label="Arriving" value={summary.arriving} icon={Clock} tone={summary.arriving ? 'warning' : 'neutral'} />
            <StatCard label="Released" value={summary.released} icon={LogOut} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <ul className="space-y-2" aria-label="Positions">
              {rows.map(r => {
                const meta = NCS_STATE[r.state];
                return (
                  <li key={r.shift.id} className={cn('rounded-lg border bg-card p-3 shadow-sm', TONE_CLASS[meta.tone])}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{r.position.tactical_callsign || r.position.name}</h2>
                      {r.position.tactical_callsign && <span className="text-sm text-muted-foreground">{r.position.name}</span>}
                      {r.position.net && <Badge variant="outline">{r.position.net}</Badge>}
                      <Badge variant={meta.tone === 'critical' ? 'critical' : meta.tone === 'warning' ? 'warning' : meta.tone === 'success' ? 'success' : 'secondary'}>{meta.label}</Badge>
                      <span className="ml-auto tnum text-xs text-muted-foreground">{formatDateTime(r.shift.starts_at, 'HH:mm')}–{formatDateTime(r.shift.ends_at, 'HH:mm')}{r.headcount > 1 ? ` · ${r.onStation}/${r.headcount} on` : ''}</span>
                    </div>
                    {r.people.length === 0 ? (
                      <p className="mt-1 text-sm text-destructive">No operator assigned to this shift.</p>
                    ) : (
                      <ul className="mt-2 divide-y">
                        {r.people.map(p => {
                          const actions = nextActions(p.status);
                          return (
                            <li key={p.assignment.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                              {p.user?.call_sign ? <CallSign value={p.user.call_sign} size="md" /> : <span className="text-muted-foreground">Unknown</span>}
                              <span className="text-muted-foreground">{p.user?.full_name}</span>
                              <span className={cn('tnum text-xs', p.status === 'on_position' ? 'text-success' : p.status === 'checked_in' ? 'text-info' : p.status === 'released' ? 'text-muted-foreground' : 'text-warning')}>
                                {p.status === 'accepted' || p.status === 'offered' ? 'not heard from yet' : `${p.status.replace('_', ' ')}${p.time ? ` ${formatDateTime(p.time, 'HH:mm')}` : ''}`}
                                {p.pending && <span className="ml-1 inline-flex items-center gap-0.5 text-warning"><CloudOff className="h-3 w-3" /> pending</span>}
                              </span>
                              {p.user?.phone && <a href={`tel:${p.user.phone}`} className="font-mono text-xs text-primary underline-offset-4 hover:underline">{p.user.phone}</a>}
                              {canRecord && actions.length > 0 && (
                                <span className="ml-auto flex gap-1">
                                  {actions.map(a => { const Icon = ICONS[a.status]; return <Button key={a.status} size="sm" variant={a.primary ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => record(p.assignment, a.status)} loading={busyId === p.assignment.id} title={`Record on behalf of ${p.user?.call_sign ?? 'operator'}`}><Icon /> {a.label}</Button>; })}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>

            <aside className="space-y-4">
              <Section title="Log" icon={MessageSquarePlus} bodyClassName="p-0">
                {canRecord && (
                  <form onSubmit={addNote} className="flex gap-1.5 border-b p-2">
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log a note (relay, outage, incident)…" className="h-9" aria-label="Log note" />
                    <Button type="submit" size="sm" disabled={!note.trim() || !isOnline} title={isOnline ? 'Add to the activity log' : 'Needs a connection'}>Add</Button>
                  </form>
                )}
                <ul className="max-h-[32rem] divide-y overflow-y-auto text-sm">
                  {(logQ.data ?? []).slice(0, 100).map(e => (
                    <li key={e.id} className="px-3 py-1.5">
                      <span className="tnum mr-2 text-xs text-muted-foreground">{formatDateTime(e.occurred_at, 'HH:mm')}</span>
                      <span className={cn(e.kind === 'note' && 'italic')}>{e.summary}</span>
                    </li>
                  ))}
                  {(logQ.data ?? []).length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">Check-ins and notes appear here and feed the ICS 214.</li>}
                </ul>
              </Section>
            </aside>
          </div>
        </>
      )}
    </QueryState>
  );
}
