import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RadioTower, Plus, Copy, Ban, CheckCircle2, AlertTriangle, MessageSquare, Send, KeyRound } from 'lucide-react';
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
import { createBridge, revokeBridge, rotateBridgeToken, functionsBaseUrl } from '@/api/aprs';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { ageMinutes, ageBucket, positionsByUser, newBridgeToken, sha256Hex, APRS_ACTIONS } from '@/lib/aprs';
import { formatDateTime, relativeTime } from '@/lib/time';

/**
 * What to type into Graywolf's New Action form, in the order the form shows
 * its sections. Kept as data so the setup guide and this page agree.
 */
const GRAYWOLF_ACTION_FIELDS = Object.freeze([
  { section: 'Identity', field: 'Name', value: 'checkin (then onpos, checkout, status). This is the word operators type after @@#.' },
  { section: 'Identity', field: 'Description', value: 'EmComm Planner check-in (optional)' },
  { section: 'Identity', field: 'Type', value: 'Webhook' },
  { section: 'Webhook', field: 'URL', value: '__URL__' },
  { section: 'Webhook', field: 'Method', value: 'POST' },
  { section: 'Webhook', field: 'Headers', value: 'none' },
  { section: 'Webhook', field: 'Body template', value: 'leave empty (Graywolf then sends its default form fields: action, sender_callsign, source)' },
  { section: 'Webhook', field: 'Timeout (s)', value: '10 (default)' },
  { section: 'Arguments', field: 'Argument mode', value: 'Key/value (default); do not add allowed args' },
  { section: 'Security', field: 'Require valid one-time code', value: 'Off. The planner checks that the sender is a member with a live assignment; a code per check-in is more than a race day can bear.' },
  { section: 'Security', field: 'Sender allowlist', value: 'Empty (anyone), or a comma-separated list such as KK4ODA-*, W4XYZ-* to limit it to your members' },
  { section: 'Throttling', field: 'Rate limit (s)', value: '5 (default)' },
  { section: 'Throttling', field: 'Queue depth', value: '8 (default)' },
  { section: 'Throttling', field: 'Max reply lines', value: '1 (default); the planner replies with one short line' },
  { section: 'Status', field: 'Enabled', value: 'On' },
]);

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
  const [issued, setIssued] = useState(/** @type {{ id: string, name: string, token: string|null }|null} */ (null));
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [maxAge, setMaxAge] = useState('180');
  const [stationFilter, setStationFilter] = useState('');
  const [membersOnly, setMembersOnly] = useState(false);

  const bridges = useMemo(() => (bridgesQ.data ?? []).filter(b => b.ares_group_id === activeGroup), [bridgesQ.data, activeGroup]);
  const latest = useMemo(() => (latestQ.data ?? []).filter(p => p.ares_group_id === activeGroup), [latestQ.data, activeGroup]);
  const members = useMemo(() => (usersQ.data ?? []).filter(u => user?.app_role === 'admin' || u.ares_group_ids?.includes(activeGroup)), [usersQ.data, activeGroup, user]);
  const byUser = useMemo(() => positionsByUser(latest, members), [latest, members]);
  const userByCall = useMemo(() => { const m = new Map(); for (const [uid, p] of byUser) m.set(p.callsign, members.find(u => u.id === uid)); return m; }, [byUser, members]);
  const now = new Date();
  const shown = useMemo(() => latest.filter(p => ageMinutes(p.heard_at, now) <= Number(maxAge)).sort((a, b) => new Date(b.heard_at).getTime() - new Date(a.heard_at).getTime()), [latest, maxAge]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => {
    const q = stationFilter.trim().toUpperCase();
    return shown
      .filter(p => !membersOnly || userByCall.has(p.callsign))
      .filter(p => !q || p.callsign.includes(q) || (userByCall.get(p.callsign)?.full_name || '').toUpperCase().includes(q))
      .sort((x, y) => Number(userByCall.has(y.callsign)) - Number(userByCall.has(x.callsign)) || new Date(y.heard_at).getTime() - new Date(x.heard_at).getTime());
  }, [shown, stationFilter, membersOnly, userByCall]);
  const memberCount = useMemo(() => shown.filter(p => userByCall.has(p.callsign)).length, [shown, userByCall]);
  const actions = useMemo(() => (actionsQ.data ?? []).filter(a => a.ares_group_id === activeGroup).slice(0, 50), [actionsQ.data, activeGroup]);
  const outbox = useMemo(() => (outboxQ.data ?? []).filter(o => o.ares_group_id === activeGroup).slice(0, 50), [outboxQ.data, activeGroup]);
  const online = bridges.filter(b => !b.revoked_at && b.last_seen_at && ageMinutes(b.last_seen_at, now) <= 5).length;

  const create = useMutation({
    mutationFn: async () => {
      const token = newBridgeToken();
      const row = await createBridge({ groupId: activeGroup, name: newName.trim() || 'Graywolf', tokenHash: await sha256Hex(token), createdBy: user?.id ?? null });
      return { row, token };
    },
    onSuccess: ({ row, token }) => { queryClient.invalidateQueries({ queryKey: queryKeys.aprsBridges }); setIssued({ id: row.id, name: row.name, token }); setNewName(''); },
    onError: reportMutationError('Create bridge'),
  });
  const rotate = useMutation({
    mutationFn: async (/** @type {string} */ id) => { const token = newBridgeToken(); await rotateBridgeToken(id, await sha256Hex(token)); return token; },
    onSuccess: (token) => { queryClient.invalidateQueries({ queryKey: queryKeys.aprsBridges }); setIssued(cur => (cur ? { ...cur, token } : cur)); toast.success('New token issued. The old one no longer works.'); },
    onError: reportMutationError('Issue a new token'),
  });
  const reissue = async () => {
    if (!issued) return;
    if (await confirm({ title: `Issue a new token for ${issued.name}?`, description: 'The current token stops working the moment the new one is issued. Paste the new token into Emcomm Objects and update the webhook URL in the four Graywolf Actions.', confirmLabel: 'Issue new token', destructive: true })) rotate.mutate(issued.id);
  };
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
                    {!b.revoked_at && <Button size="sm" variant="ghost" onClick={() => setIssued({ id: b.id, name: b.name, token: null })} title="Planner URL, webhook URL and a new token if you need one"><KeyRound /> Setup</Button>}
                    {!b.revoked_at && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => revoke.mutate(b.id)}><Ban /> Revoke</Button>}
                  </li>
                ))}
                {bridges.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No bridge yet. Create one per Graywolf station. The token is shown once; Setup reopens the URLs and can issue a new token.</li>}
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
            {shown.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b p-2">
                <Input value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} placeholder="Call sign or name" aria-label="Filter stations" className="h-8 w-44 text-xs" />
                <Button size="sm" variant={membersOnly ? 'default' : 'outline'} onClick={() => setMembersOnly(v => !v)} aria-pressed={membersOnly}>Members only{memberCount ? ` (${memberCount})` : ''}</Button>
                <span className="ml-auto text-xs text-muted-foreground">{visible.length === shown.length ? `${shown.length} stations` : `${visible.length} of ${shown.length} stations`}{visible.length > 300 ? ', first 300 shown' : ''}</span>
              </div>
            )}
            {shown.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{latest.length ? 'Nothing heard in this window.' : 'Nothing received yet. Once a bridge reports, stations appear here and on the Sites map.'}</p> : visible.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{membersOnly ? 'No member heard in this window. Members are matched by the APRS call sign on their profile or any SSID of their call sign.' : 'No station matches.'}</p> : (
              <div className="max-h-[26rem] overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Station</TableHead><TableHead>Member</TableHead><TableHead>Heard</TableHead><TableHead>Position</TableHead></TableRow></TableHeader>
                <TableBody>
                  {visible.slice(0, 300).map(p => {
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
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Set up Graywolf" icon={AlertTriangle}>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Create a bridge above. The dialog gives you three strings: the token, the planner URL and a webhook URL. Closed it? <strong>Setup</strong> next to the bridge shows the URLs again and can issue a new token.</li>
              <li>In <strong>Emcomm Objects</strong> (next to Graywolf), open Settings › EmComm Planner. <strong>Planner URL</strong> is <span className="font-mono text-xs">{base}</span> and nothing more; <strong>Bridge token</strong> is the token. Enable <em>Forward heard stations</em>, click <em>Test link</em>, save. Stations then appear here within a minute.</li>
              <li>For APRS check-ins, create four Graywolf <strong>Actions</strong> (Graywolf › Actions › New Action), one per command. Every field is the same except the name. Scroll the New Action form top to bottom and set:
                <Table className="mt-2 text-xs">
                  <TableHeader><TableRow><TableHead className="w-28">Section</TableHead><TableHead className="w-40">Field</TableHead><TableHead>Value</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {GRAYWOLF_ACTION_FIELDS.map((r, i) => (
                      <TableRow key={i}><TableCell className="font-medium">{r.section}</TableCell><TableCell>{r.field}</TableCell><TableCell>{r.value === '__URL__' ? <span className="break-all font-mono">{base}/aprs-ingest/action?token=YOUR-TOKEN</span> : r.value}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2">Save, then repeat with the names <span className="font-mono">onpos</span>, <span className="font-mono">checkout</span> and <span className="font-mono">status</span>. Graywolf sends our reply back to the operator prefixed with <span className="font-mono">ok:</span>.</p>
              </li>
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
            <DialogTitle>Bridge setup: {issued?.name}</DialogTitle>
            <DialogDescription>{issued?.token ? 'Three strings go to two places. The token is shown once and stored only as a hash.' : 'The planner keeps only a hash of the token, so it cannot be shown again. The URLs are always available here; issue a new token if you no longer have the old one.'}</DialogDescription>
          </DialogHeader>
          <FormField label="1. Bridge token" hint="Emcomm Objects › Settings › EmComm Planner › Bridge token">
            {() => issued?.token
              ? <div className="flex gap-2"><Input readOnly value={issued.token} className="font-mono text-xs" aria-label="Bridge token" onFocus={(e) => e.target.select()} /><Button variant="outline" onClick={() => copy(issued.token ?? '')}><Copy /></Button></div>
              : <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"><span className="text-muted-foreground">Not stored; only its hash is kept.</span><Button size="sm" variant="outline" onClick={reissue} loading={rotate.isPending}><KeyRound /> Issue a new token</Button></div>}
          </FormField>
          <FormField label="2. Planner URL" hint="Emcomm Objects › Settings › EmComm Planner › Planner URL. Just this address: no token, no /aprs-ingest.">
            {({ id }) => <div className="flex gap-2"><Input id={id} readOnly value={base} className="font-mono text-xs" onFocus={(e) => e.target.select()} /><Button variant="outline" onClick={() => copy(base)}><Copy /></Button></div>}
          </FormField>
          <FormField label="3. Webhook URL for Graywolf Actions" hint={issued?.token ? 'Graywolf › Actions › URL, the same in all four Actions (checkin, onpos, checkout, status). Not for Emcomm Objects.' : 'Graywolf › Actions › URL, with your token in place of YOUR-TOKEN. Not for Emcomm Objects.'}>
            {({ id }) => { const url = `${base}/aprs-ingest/action?token=${issued?.token ?? 'YOUR-TOKEN'}`; return <div className="flex items-center gap-2"><Input id={id} readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.target.select()} /><Button variant="outline" onClick={() => copy(url)}><Copy /></Button></div>; }}
          </FormField>
          <DialogFooter><Button onClick={() => setIssued(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </QueryState>
  );
}
