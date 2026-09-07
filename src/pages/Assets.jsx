import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Boxes, Plus, Pencil, Download, History, PackageCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { SearchInput } from '@/components/common/SearchInput';
import { CallSign } from '@/components/common/CallSign';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useAresGroups, useUsers, useDeployments, useLocations, useAssets, useAssetCustody, useEntityMutations, reportMutationError } from '@/hooks/useEntities';
import { moveAsset } from '@/api/assets';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { ASSET_KINDS, ASSET_STATUS, assetActions, assetSummary, custodyLine, outstandingAssets, assetsCsv } from '@/lib/assets';
import { downloadBlob } from '@/lib/download';
import { formatDateTime } from '@/lib/time';
import { AssetForm } from '@/features/assets/AssetForm';
import { AssetMoveDialog } from '@/features/assets/AssetMoveDialog';
import { cn } from '@/lib/utils';

const TONE = { success: 'success', info: 'info', warning: 'warning', muted: 'muted' };

/** The group's shared equipment and who has it. */
export default function Assets() {
  const { user } = useAuth();
  const { deployment } = useCurrentDeployment();
  const queryClient = useQueryClient();
  const groupsQ = useAresGroups();
  const usersQ = useUsers();
  const deploymentsQ = useDeployments();
  const locationsQ = useLocations();
  const assetsQ = useAssets();
  const canManage = hasPermission(user?.app_role, 'MANAGE_ASSETS');
  const canMove = hasPermission(user?.app_role, 'MOVE_ASSETS');

  const myGroups = useMemo(() => {
    const all = groupsQ.data ?? [];
    return user?.app_role === 'admin' ? all : all.filter(g => user?.ares_group_ids?.includes(g.id));
  }, [groupsQ.data, user]);
  const [groupId, setGroupId] = useState('');
  const activeGroup = groupId || deployment?.ares_group_id || myGroups[0]?.id || '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [form, setForm] = useState({ open: false, asset: null });
  const [move, setMove] = useState(/** @type {{ asset: Object, action: string }|null} */ (null));
  const [historyFor, setHistoryFor] = useState(/** @type {Object|null} */ (null));

  const usersById = useMemo(() => new Map((usersQ.data ?? []).map(u => [u.id, u])), [usersQ.data]);
  const members = useMemo(() => (usersQ.data ?? []).filter(u => u.call_sign && (user?.app_role === 'admin' || u.ares_group_ids?.includes(activeGroup))), [usersQ.data, activeGroup, user]);
  const deploymentName = useMemo(() => new Map((deploymentsQ.data ?? []).map(d => [d.id, d.name])), [deploymentsQ.data]);
  const siteName = useMemo(() => new Map((locationsQ.data ?? []).map(l => [l.id, l.name])), [locationsQ.data]);
  const groupAssets = useMemo(() => (assetsQ.data ?? []).filter(a => a.ares_group_id === activeGroup), [assetsQ.data, activeGroup]);
  const summary = assetSummary(groupAssets);
  const outstanding = deployment ? outstandingAssets(groupAssets, deployment.id) : [];
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupAssets
      .filter(a => statusFilter === 'all' ? true : statusFilter === 'active' ? a.status !== 'retired' : statusFilter === 'out' ? a.status === 'with_person' || a.status === 'on_site' : a.status === statusFilter)
      .filter(a => !q || [a.name, a.serial, a.home_location, a.notes, ASSET_KINDS[a.kind], usersById.get(a.custodian_user_id)?.call_sign].some(v => v?.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groupAssets, statusFilter, search, usersById]);

  const mutations = useEntityMutations('assets', queryKeys.assets, { label: 'asset' });
  const doMove = useMutation({
    mutationFn: (/** @type {{ asset: Object, action: string, toUserId: string|null, deploymentId: string|null, siteId: string|null, note: string }} */ { asset, action, toUserId, deploymentId, siteId, note }) =>
      moveAsset({ assetId: asset.id, action, toUserId, deploymentId, siteId, note }),
    onSuccess: (a) => { queryClient.invalidateQueries({ queryKey: queryKeys.assets }); queryClient.invalidateQueries({ queryKey: queryKeys.assetCustody }); setMove(null); toast.success(`${a.name}: ${ASSET_STATUS[a.status]?.label || a.status}`); },
    onError: reportMutationError('Move asset'),
  });
  const submitForm = (data) => {
    const close = () => setForm({ open: false, asset: null });
    if (form.asset) mutations.update.mutate({ id: form.asset.id, data }, { onSuccess: () => { close(); toast.success('Asset updated'); } });
    else mutations.create.mutate({ ...data, ares_group_id: activeGroup, created_by: user?.id ?? null }, { onSuccess: () => { close(); toast.success('Asset added'); } });
  };
  const returnAll = async () => {
    for (const a of outstanding) await moveAsset({ assetId: a.id, action: 'returned', note: 'Teardown' }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: queryKeys.assets });
    queryClient.invalidateQueries({ queryKey: queryKeys.assetCustody });
    toast.success('Everything marked returned');
  };

  return (
    <QueryState queries={[groupsQ, usersQ, assetsQ]}>
      <PageHeader
        icon={Boxes}
        title="Assets"
        description="Shared equipment: who owns it, where it lives, who has it right now. Every move is recorded."
        actions={(
          <>
            {myGroups.length > 1 && (
              <Select value={activeGroup} onValueChange={setGroupId}>
                <SelectTrigger className="w-48" aria-label="ARES group"><SelectValue /></SelectTrigger>
                <SelectContent>{myGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button variant="outline" onClick={() => downloadBlob(assetsCsv(groupAssets, usersById, deploymentName), 'assets.csv', 'text/csv;charset=utf-8')} disabled={!groupAssets.length}><Download /> CSV</Button>
            {canManage && <Button onClick={() => setForm({ open: true, asset: null })}><Plus /> Add asset</Button>}
          </>
        )}
      />

      {groupAssets.length === 0 ? (
        <EmptyState icon={Boxes} title="No assets yet" description={canManage ? 'List the shared equipment the group needs to find again: cords, masts, go-boxes, the generator.' : 'Planners add the group equipment here.'} action={canManage && <Button onClick={() => setForm({ open: true, asset: null })}><Plus /> Add the first asset</Button>} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="In storage" value={summary.storage} icon={PackageCheck} tone="success" onClick={() => setStatusFilter('storage')} />
            <StatCard label="With people" value={summary.with_person} icon={Boxes} tone="info" onClick={() => setStatusFilter('with_person')} />
            <StatCard label="On site" value={summary.on_site} icon={Boxes} tone="warning" onClick={() => setStatusFilter('on_site')} />
            <StatCard label={deployment ? `Out for ${deployment.name}` : 'Out'} value={outstanding.length} icon={AlertTriangle} tone={outstanding.length ? 'warning' : 'success'} hint={outstanding.length && canManage ? 'Teardown checklist below' : undefined} />
          </div>

          {deployment && outstanding.length > 0 && (
            <div className="mb-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold"><AlertTriangle className="mr-1 inline h-4 w-4 text-warning" /> Teardown: {outstanding.length} asset{outstanding.length === 1 ? '' : 's'} still out for {deployment.name}</p>
                {canManage && <Button size="sm" variant="outline" onClick={returnAll}><PackageCheck /> Mark all returned</Button>}
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">{outstanding.map(a => <li key={a.id}>{a.name}: {custodyLine(a, usersById, null, siteName.get(a.site_id))}</li>)}</ul>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Name, serial, kind, call sign" className="w-64" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44" aria-label="Status filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">In service</SelectItem>
                <SelectItem value="out">Out (with people or on site)</SelectItem>
                {Object.entries(ASSET_STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                <SelectItem value="all">Everything</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Asset</TableHead><TableHead>Owner</TableHead><TableHead>Where / who</TableHead><TableHead>Status</TableHead><TableHead className="w-44"><span className="sr-only">Actions</span></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(a => {
                  const actions = canMove ? assetActions(a, user, canManage) : [];
                  const owner = a.owner_user_id ? usersById.get(a.owner_user_id) : null;
                  const primary = actions.find(x => x.primary) || actions[0];
                  const rest = actions.filter(x => x !== primary);
                  return (
                    <TableRow key={a.id} className={cn(a.status === 'retired' && 'opacity-60')}>
                      <TableCell>
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{ASSET_KINDS[a.kind] || a.kind}{a.serial ? ` · ${a.serial}` : ''}{a.notes ? ` · ${a.notes}` : ''}</p>
                      </TableCell>
                      <TableCell className="text-sm">{owner ? <CallSign value={owner.call_sign} /> : <span className="text-muted-foreground">Group</span>}</TableCell>
                      <TableCell className="text-sm">
                        {custodyLine(a, usersById, a.deployment_id ? deploymentName.get(a.deployment_id) : null, a.site_id ? siteName.get(a.site_id) : null)}
                        <p className="text-xs text-muted-foreground">since {formatDateTime(a.status_changed_at, 'MMM d HH:mm')}</p>
                      </TableCell>
                      <TableCell><Badge variant={TONE[ASSET_STATUS[a.status]?.tone] || 'outline'}>{ASSET_STATUS[a.status]?.label || a.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {primary && <Button size="sm" variant={primary.primary ? 'default' : 'outline'} onClick={() => setMove({ asset: a, action: primary.action })}>{primary.label}</Button>}
                          {(rest.length > 0 || canManage) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" aria-label={`More for ${a.name}`}>…</Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {rest.map(x => <DropdownMenuItem key={x.action} onClick={() => setMove({ asset: a, action: x.action })}>{x.label}</DropdownMenuItem>)}
                                <DropdownMenuItem onClick={() => setHistoryFor(a)}><History /> History</DropdownMenuItem>
                                {canManage && <DropdownMenuItem onClick={() => setForm({ open: true, asset: a })}><Pencil /> Edit</DropdownMenuItem>}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {shown.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nothing matches.</p>}
          </div>
        </>
      )}

      <AssetForm open={form.open} asset={form.asset} users={members} onClose={() => setForm({ open: false, asset: null })} onSubmit={submitForm} submitting={mutations.create.isPending || mutations.update.isPending} />
      <AssetMoveDialog
        open={!!move} asset={move?.asset ?? null} action={move?.action ?? null}
        users={members} deployments={(deploymentsQ.data ?? []).filter(d => d.ares_group_id === activeGroup && d.status !== 'archived')} sites={locationsQ.data ?? []}
        currentDeploymentId={deployment?.id ?? null}
        onClose={() => setMove(null)}
        onConfirm={(args) => move && doMove.mutate({ asset: move.asset, action: move.action, ...args })}
        submitting={doMove.isPending}
      />
      <AssetHistoryDialog asset={historyFor} onClose={() => setHistoryFor(null)} usersById={usersById} deploymentName={deploymentName} siteName={siteName} />
    </QueryState>
  );
}

function AssetHistoryDialog({ asset, onClose, usersById, deploymentName, siteName }) {
  const custodyQ = useAssetCustody(asset?.id ?? null);
  const who = (id) => (id ? (usersById.get(id)?.call_sign || usersById.get(id)?.full_name || '?') : null);
  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>History: {asset?.name}</DialogTitle></DialogHeader>
        {custodyQ.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (custodyQ.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No moves recorded yet.</p> : (
          <ul className="max-h-80 divide-y overflow-y-auto text-sm">
            {(custodyQ.data ?? []).map(c => (
              <li key={c.id} className="py-1.5">
                <p><span className="tnum text-xs text-muted-foreground">{formatDateTime(c.at, 'MMM d HH:mm')}</span> · {c.action.replace('_', ' ')}{c.to_user_id ? ` → ${who(c.to_user_id)}` : ''}{c.from_user_id && c.action === 'returned' ? ` (from ${who(c.from_user_id)})` : ''}</p>
                <p className="text-xs text-muted-foreground">{[c.deployment_id && deploymentName.get(c.deployment_id), c.site_id && siteName.get(c.site_id), c.note, c.recorded_by && who(c.recorded_by) && `recorded by ${who(c.recorded_by)}`].filter(Boolean).join(' · ')}</p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
