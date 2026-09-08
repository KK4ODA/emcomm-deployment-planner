import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RadioTower, Plus, Copy, Ban, CheckCircle2, AlertTriangle, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Section } from '@/components/common/Section';
import { QueryState } from '@/components/common/QueryState';
import { FormField } from '@/components/common/FormField';
import { CallSign } from '@/components/common/CallSign';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useAresGroups, useUsers, useAprsBridges, useAprsActions, useAprsOutbox, useAprsLatest, reportMutationError } from '@/hooks/useEntities';
import { createBridge, revokeBridge, functionsBaseUrl } from '@/api/aprs';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { ageMinutes, ageBucket, positionsByUser, newBridgeToken, sha256Hex, APRS_ACTIONS } from '@/lib/aprs';
import { formatDateTime, relativeTime } from '@/lib/time';

/** /aprs: Graywolf bridges, heard stations, APRS check-ins and outbound messages. */
export default function Aprs() {
  const { user } = useAuth();
  const { deployment } = useCurrentDeployment();
  const queryClient = useQueryClient();
  const groupsQ = useAresGroups();
  const usersQ = useUsers();
  const bridgesQ = useAprsBridges();
  const actionsQ = useAprsActions();
  const outboxQ = useAprsOutbox();
  const latestQ = useAprsLatest();
  const canManage = hasPermission(user?.app_role, 'MANAGE_APRS');

  const myGroups = useMemo(() => {
    const all = groupsQ.data ?? [];
    return user?.app_role === 'admin' ? all : all.filter(g => user?.ares_group_ids?.includes(g.id));
  }, [groupsQ.data, user]);
  const [groupId, setGroupId] = useState('');
  const activeGroup = groupId || deployment?.ares_group_id || myGroups[0]?.id || '';
  const [newName, setNewName] = useState('');
  const [issued, setIssued] = useState(/** @type {{ name: string, token: string }|null} */ (null));
  const [maxAge, setMaxAge] = useState('180');

  const bridges = useMemo(() => (bridgesQ.data ?? []).filter(b => b.ares_group_id === activeGroup), [bridgesQ.data, activeGroup]);
  const latest = useMemo(() => (latestQ.data ?? []).filter(p => p.ares_group_id === activeGroup), [latestQ.data, activeGroup]);
  const members = useMemo(() => (usersQ.data ?? []).filter(u => user?.app_role === 'admin' || u.ares_group_ids?.includes(activeGroup)), [usersQ.data, activeGroup, user]);
  const byUser = useMemo(() => positionsByUser(latest, members), [latest, members]);
  const userByCall = useMemo(() => { const m = new Map(); for (const [uid, p] of byUser) m.set(p.callsign, members.find(u => u.id === uid)); return m; }, [byUser, members]);
  const now = new Date();
  const shown = useMemo(() => latest.filter(p => ageMinutes(p.heard_at, now) <= Number(maxAge)).sort((a, b) => new Date(b.heard_at).getTime() - new Date(a.heard_at).getTime()), [latest, maxAge]); // eslint-disable-line react-hooks/exhaustive-deps
  const actions = useMemo(() => (actionsQ.data ?? []).filter(a => a.ares_group_id === activeGroup).slice(0, 50), [actionsQ.data, activeGroup]);
  const outbox = useMemo(() => (outboxQ.data ?? []).filter(o => o.ares_group_id === activeGroup).slice(0, 50), [outboxQ.data, activeGroup]);
  const online = bridges.filter(b => !b.revoked_at && b.last_seen_at && ageMinutes(b.last_seen_at, now) <= 5).length;

  const create = useMutation({
    mutationFn: async () => {
      const token = newBridgeToken();
      const row = await createBridge({ groupId: activeGroup, name: newName.trim() || 'Graywolf', tokenHash: await sha256Hex(token), createdBy: user?.id ?? null });
      return { row, token };
    },
    onSuccess: ({ row, token }) => { queryClient.invalidateQueries({ queryKey: queryKeys.aprsBridges }); setIssued({ name: row.name, token }); setNewName(''); },
    onError: reportMutationError('Create bridge'),
  });
  const revoke = useMutation({ mutationFn: (/** @type {string} */ id) => revokeBridge(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.aprsBridges }); toast.success('Bridge revoked'); }, onError: reportMutationError('Revoke bridge') });
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast.success('Copied')).catch(() => toast.error('Clipboard unavailable'));
  const base = functionsBaseUrl();

  return (
    <QueryState queries={[groupsQ, usersQ, bridgesQ]}>
      <PageHeader
        icon={RadioTower}
        title="APRS"
        description="Graywolf hears the operators; a small bridge forwards what it hears here. Operators check in over APRS, net control sees who is where, and notifications can go out over the air."
        actions={myGroups.length > 1 && (
          <Select value={activeGroup} onValueChange={setGroupId}>
            <SelectTrigger className="w-48" aria-label="ARES group"><SelectValue /></SelectTrigger>
            <SelectContent>{myGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Bridges online" value={online} icon={RadioTower} tone={online ? 'success' : bridges.length ? 'warning' : 'neutral'} hint={bridges.length ? `${bridges.filter(b => !b.revoked_at).length} configured` : 'none yet'} />
        <StatCard label="Stations heard" value={shown.length} icon={CheckCircle2} tone="info" hint={`last ${maxAge} min`} />
        <StatCard label="Operators located" value={[...byUser.values()].filter(p => ageMinutes(p.heard_at, now) <= Number(maxAge)).length} icon={CheckCircle2} tone="accent" hint={`of ${members.filter(m => m.call_sign).length} members`} />
        <StatCard label="APRS check-ins" value={actions.filter(a => a.result === 'ok').length} icon={MessageSquare} hint="recent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {canManage && (
            <Section title="Bridges" icon={RadioTower} aside={<span>{bridges.filter(b => !b.revoked_at).length} active</span>} bodyClassName="p-0">
              <ul className="divide-y text-sm">
                {bridges.map(b => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{b.name}{b.station_call && <span className="ml-2 font-mono text-xs text-muted-foreground">{b.station_call}</span>}</p>
                      <p className="text-xs text-muted-foreground">{b.revoked_at ? `Revoked ${formatDateTime(b.revoked_at)}` : b.last_seen_at ? `Last report ${relativeTime(b.last_seen_at)}${b.last_stations != null ? `, ${b.last_stations} stations` : ''}` : 'Never reported yet'}{b.last_error ? ` · ${b.last_error}` : ''}</p>
                    </div>
                    {b.revoked_at ? <Badge variant="muted">revoked</Badge> : b.last_seen_at && ageMinutes(b.last_seen_at, now) <= 5 ? <Badge variant="success">online</Badge> : <Badge variant="warning">quiet</Badge>}
                    {!b.revoked_at && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => revoke.mutate(b.id)}><Ban /> Revoke</Button>}
                  </li>
                ))}
                {bridges.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No bridge yet. Create one per Graywolf station; the token is shown once.</li>}
              </ul>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="flex gap-2 border-t p-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Bridge name, e.g. EOC Graywolf" aria-label="Bridge name" />
                <Button type="submit" loading={create.isPending} disabled={!activeGroup}><Plus /> Create bridge</Button>
              </form>
            </Section>
          )}

          <Section title="Stations heard" icon={CheckCircle2} aside={(
            <Select value={maxAge} onValueChange={setMaxAge}>
              <SelectTrigger className="h-7 w-28 text-xs" aria-label="Age window"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="30">30 min</SelectItem><SelectItem value="180">3 h</SelectItem><SelectItem value="720">12 h</SelectItem><SelectItem value="1440">24 h</SelectItem><SelectItem value="20160">14 d</SelectItem></SelectContent>
            </Select>
          )} bodyClassName="p-0">
            {shown.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{latest.length ? 'Nothing heard in this window.' : 'Nothing received yet. Once a bridge reports, stations appear here and on the Sites map.'}</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Station</TableHead><TableHead>Member</TableHead><TableHead>Heard</TableHead><TableHead>Position</TableHead></TableRow></TableHeader>
                <TableBody>
                  {shown.slice(0, 200).map(p => {
                    const u = userByCall.get(p.callsign);
                    const b = ageBucket(ageMinutes(p.heard_at, now));
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.callsign}{p.is_object && <Badge variant="outline" className="ml-2">object</Badge>}</TableCell>
                        <TableCell className="text-sm">{u ? <><CallSign value={u.call_sign} /> <span className="text-muted-foreground">{u.full_name}</span></> : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-sm"><span style={{ color: b.color }}>●</span> {b.label}{p.via ? <span className="ml-1 text-xs text-muted-foreground">via {p.via}</span> : null}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.lat != null ? `${Number(p.lat).toFixed(4)}, ${Number(p.lon).toFixed(4)}${p.speed_kt ? ` · ${Math.round(p.speed_kt * 1.151)} mph` : ''}` : 'no position'}{p.comment ? <span className="block truncate font-sans">{p.comment}</span> : null}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Set up Graywolf" icon={AlertTriangle}>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Create a bridge above and copy its token.</li>
              <li>In <strong>Emcomm Objects</strong> (next to Graywolf), open Settings › EmComm Planner, paste <span className="font-mono text-xs">{base}</span> and the token, and enable <em>Forward heard stations</em>. Stations then appear here within a minute.</li>
              <li>For APRS check-ins, add a Graywolf <strong>Action</strong> per command with a webhook handler. Method POST, URL:
                <p className="mt-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">{base}/aprs-ingest/action?token=YOUR-TOKEN</p>
                Leave the body as the default form fields. Create one Action each for <span className="font-mono">checkin</span>, <span className="font-mono">onpos</span>, <span className="font-mono">checkout</span> and <span className="font-mono">status</span>. Graywolf sends our reply back to the operator.</li>
              <li>Operators then send Graywolf's station an APRS message such as {APRS_ACTIONS.map(a => <span key={a.action} className="mr-1 font-mono">{a.example}</span>)} from any APRS radio or app. Their profile's APRS call, or any SSID of their call sign, identifies them.</li>
              <li>Outbound: operators who turn on <em>APRS</em> under Profile › Notifications get offers and packet changes as APRS messages, sent by the bridge through Graywolf.</li>
            </ol>
          </Section>

          <Section title="APRS check-ins" icon={MessageSquare} aside={`${actions.length}`} bodyClassName="p-0">
            {actions.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No APRS commands received yet.</p> : (
              <ul className="divide-y text-sm">
                {actions.map(a => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                    <span className="tnum text-xs text-muted-foreground">{formatDateTime(a.received_at, 'MMM d HH:mm')}</span>
                    <span className="font-mono">{a.from_callsign}</span>
                    <span className="font-mono text-xs">#{a.action}</span>
                    <Badge variant={a.result === 'ok' ? 'success' : a.result === 'error' ? 'critical' : 'warning'}>{a.result.replace('_', ' ')}</Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{a.reply}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {canManage && (
            <Section title="Outbound APRS messages" icon={Send} aside={`${outbox.filter(o => o.status === 'pending').length} pending`} bodyClassName="p-0">
              {outbox.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing queued. Messages appear here when an operator with APRS delivery on gets a notification.</p> : (
                <ul className="divide-y text-sm">
                  {outbox.map(o => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                      <span className="tnum text-xs text-muted-foreground">{formatDateTime(o.created_at, 'MMM d HH:mm')}</span>
                      <span className="font-mono">{o.to_callsign}</span>
                      <span className="min-w-0 flex-1 truncate">{o.text}</span>
                      <Badge variant={o.status === 'sent' ? 'success' : o.status === 'pending' ? 'warning' : 'muted'}>{o.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
      </div>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bridge token for {issued?.name}</DialogTitle>
            <DialogDescription>Copy it now. It is shown once and stored only as a hash; if you lose it, revoke this bridge and create another.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={issued?.token ?? ''} className="font-mono text-xs" aria-label="Bridge token" onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => copy(issued?.token ?? '')}><Copy /> Copy</Button>
          </div>
          <FormField label="Webhook URL for Graywolf Actions">
            {({ id }) => <div className="flex items-center gap-2"><Input id={id} readOnly value={`${base}/aprs-ingest/action?token=${issued?.token ?? ''}`} className="font-mono text-xs" onFocus={(e) => e.target.select()} /><Button variant="outline" onClick={() => copy(`${base}/aprs-ingest/action?token=${issued?.token ?? ''}`)}><Copy /></Button></div>}
          </FormField>
          <DialogFooter><Button onClick={() => setIssued(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </QueryState>
  );
}
