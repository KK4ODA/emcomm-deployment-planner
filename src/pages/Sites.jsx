import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, MapPin, List, Map as MapIcon, Layers, RadioTower, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useLocations, useItems, useUsers, useTasks, useMapLayers, useCoverageLog, useAprsLatest, usePositions, useEntityMutations, useRealtimeInvalidation, reportMutationError } from '@/hooks/useEntities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/db';
import { hasPermission } from '@/lib/permissions';
import { coverageGeoJson, coverageSummary, filterCoverage, coverageCsv, COVERAGE_RESULTS } from '@/lib/coverage';
import { aprsGeoJson, positionsByUser, sitesToAprsObjects, aprsObjectsCsv } from '@/lib/aprs';
import { downloadBlob } from '@/lib/download';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CoverageReportDialog } from '@/features/coverage/CoverageReportDialog';
import { queryKeys } from '@/lib/queryKeys';
import { canCreate, canEdit, canDelete } from '@/lib/permissions';
import { locationsOf, locationItemStats, missingSiteOperators } from '@/lib/deployments';
import { summarizeTasks } from '@/lib/tasks';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { SiteCard } from '@/features/sites/SiteCard';
import { SiteForm } from '@/features/sites/SiteForm';
import { SiteMap } from '@/features/sites/SiteMap';
import { MapLayersDialog } from '@/features/sites/MapLayersDialog';

export default function Sites() {
  return <DeploymentGate><SitesContent /></DeploymentGate>;
}

function SitesContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const locationsQ = useLocations();
  const itemsQ = useItems();
  const usersQ = useUsers();
  const tasksQ = useTasks();
  const layersQ = useMapLayers();
  const coverageQ = useCoverageLog();
  const aprsQ = useAprsLatest();
  const positionsQ = usePositions();
  const [aprsAge, setAprsAge] = useState('180');
  const queryClient = useQueryClient();
  useRealtimeInvalidation('locations', queryKeys.locations);
  const [layersOpen, setLayersOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [coverageFilter, setCoverageFilter] = useState({ result: 'all', scope: 'group' });

  const [view, setView] = useLocalStorage('emcomm_sites_view', 'list');
  const [form, setForm] = useState({ open: false, location: null });
  const { confirm, dialog } = useConfirm();
  const mutations = useEntityMutations('locations', queryKeys.locations, { label: 'site' });

  const role = user?.app_role;
  const mayCreate = canCreate(role, 'location');
  const mayEdit = canEdit(role, 'location');
  const mayDelete = canDelete(role, 'location');

  const locations = useMemo(() => locationsOf(locationsQ.data ?? [], deploymentId), [locationsQ.data, deploymentId]);
  const items = itemsQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const layers = useMemo(() => (layersQ.data ?? []).filter(l => l.deployment_id === deploymentId), [layersQ.data, deploymentId]);
  const coverageEntries = useMemo(() => filterCoverage((coverageQ.data ?? []).filter(e => e.ares_group_id === deployment.ares_group_id), { result: coverageFilter.result, deploymentId: coverageFilter.scope === 'deployment' ? deploymentId : null }), [coverageQ.data, coverageFilter, deployment.ares_group_id, deploymentId]);
  const allSitesById = useMemo(() => new Map((locationsQ.data ?? []).map(l => [l.id, l])), [locationsQ.data]);
  const coverageGeo = useMemo(() => coverageGeoJson(coverageEntries, allSitesById), [coverageEntries, allSitesById]);
  const coverageStats = useMemo(() => coverageSummary(coverageEntries), [coverageEntries]);
  const aprsLatest = useMemo(() => (aprsQ.data ?? []).filter(p => p.ares_group_id === deployment.ares_group_id), [aprsQ.data, deployment.ares_group_id]);
  const aprsGeo = useMemo(() => {
    const byUser = positionsByUser(aprsLatest, usersQ.data ?? []);
    const userByCall = new Map();
    for (const [uid, p] of byUser) userByCall.set(p.callsign, (usersQ.data ?? []).find(u => u.id === uid));
    return aprsGeoJson(aprsLatest, { maxAgeMinutes: Number(aprsAge), userByCall, usersById: new Map((usersQ.data ?? []).map(u => [u.id, u])) });
  }, [aprsLatest, usersQ.data, aprsAge]);
  const depPositions = useMemo(() => (positionsQ.data ?? []).filter(p => p.deployment_id === deploymentId), [positionsQ.data, deploymentId]);
  const usersById = useMemo(() => new Map((usersQ.data ?? []).map(u => [u.id, u])), [usersQ.data]);
  const logCoverage = useMutation({
    mutationFn: (/** @type {Object} */ data) => db.coverageLog.create({ ...data, ares_group_id: deployment.ares_group_id, deployment_id: deploymentId, reported_by: user.id, occurred_at: new Date().toISOString() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.coverageLog }); setCoverageOpen(false); toast.success('Coverage check recorded'); },
    onError: reportMutationError('Record coverage check'),
  });

  const usersWithCallSign = useMemo(() => (usersQ.data ?? []).filter(u => u.call_sign), [usersQ.data]);

  const submit = (data) => {
    const payload = { ...data, deployment_id: deploymentId };
    const close = () => setForm({ open: false, location: null });
    if (form.location) mutations.update.mutate({ id: form.location.id, data: payload }, { onSuccess: () => { close(); toast.success('Site updated'); } });
    else mutations.create.mutate(payload, { onSuccess: () => { close(); toast.success('Site created'); } });
  };

  const [rosterBusyId, setRosterBusyId] = useState(null);
  const addToRoster = (location, callSigns) => {
    setRosterBusyId(location.id);
    mutations.update.mutate(
      { id: location.id, data: { assigned_call_signs: [...(location.assigned_call_signs || []), ...callSigns] } },
      { onSettled: () => setRosterBusyId(null), onSuccess: () => toast.success(`${callSigns.join(', ')} added to ${location.name}`) },
    );
  };

  const remove = async (location) => {
    if (await confirm({ title: `Delete “${location.name}”?`, description: 'All items, tasks and positions at this site will be deleted.', destructive: true })) {
      mutations.remove.mutate(location.id, { onSuccess: () => toast.success('Site deleted') });
    }
  };

  return (
    <QueryState queries={[locationsQ, itemsQ, usersQ]}>
      <PageHeader
        icon={MapPin}
        eyebrow={deployment.name}
        title="Sites"
        description="Where operators deploy: EOCs, shelters, relay points, staging areas"
        actions={mayCreate && (
          <>
            <Button variant="outline" onClick={() => { setLayersOpen(true); setView('map'); }}><Layers /> Map layers{layers.length ? ` (${layers.length})` : ''}</Button>
            <Button onClick={() => setForm({ open: true, location: null })}><Plus /> Add site</Button>
          </>
        )}
      />

      {locations.length === 0 && layers.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No sites yet"
          description={mayCreate ? 'Add the sites for this deployment. Each site gets positions, an equipment list and setup tasks.' : 'Sites will appear here once an admin adds them.'}
          action={mayCreate && <Button onClick={() => setForm({ open: true, location: null })}><Plus /> Create first site</Button>}
        />
      ) : (
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="list"><List className="h-4 w-4" /> List</TabsTrigger>
            <TabsTrigger value="map"><MapIcon className="h-4 w-4" /> Map</TabsTrigger>
          </TabsList>
          <TabsContent value="list">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {locations.map(loc => {
                const missing = missingSiteOperators(loc, items, tasks);
                return (
                <SiteCard
                  key={loc.id}
                  location={loc}
                  itemStats={locationItemStats(items, loc.id)}
                  taskSummary={summarizeTasks(tasks.filter(t => t.deployment_location_id === loc.id))}
                  missingOperators={missing}
                  onAddOperators={() => addToRoster(loc, missing)}
                  addingOperators={rosterBusyId === loc.id}
                  canEdit={mayEdit}
                  canDelete={mayDelete}
                  onEdit={() => setForm({ open: true, location: loc })}
                  onDelete={() => remove(loc)}
                />
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="map">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <RadioTower className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Coverage checks</span>
              <span className="text-muted-foreground">{coverageStats.total ? `${coverageStats.direct} direct · ${coverageStats.relay} relay · ${coverageStats.fail} failed` : 'none recorded yet'}</span>
              <Select value={coverageFilter.scope} onValueChange={(v) => setCoverageFilter(f => ({ ...f, scope: v }))}>
                <SelectTrigger className="h-8 w-40" aria-label="Coverage scope"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="group">Whole group history</SelectItem><SelectItem value="deployment">This deployment</SelectItem></SelectContent>
              </Select>
              <Select value={coverageFilter.result} onValueChange={(v) => setCoverageFilter(f => ({ ...f, result: v }))}>
                <SelectTrigger className="h-8 w-32" aria-label="Coverage result"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All results</SelectItem>{Object.entries(COVERAGE_RESULTS).map(([k, r]) => <SelectItem key={k} value={k}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
              {hasPermission(role, 'LOG_COVERAGE') && <Button size="sm" variant="outline" onClick={() => setCoverageOpen(true)}><RadioTower /> Log a check</Button>}
              {coverageEntries.length > 0 && <Button size="sm" variant="ghost" onClick={() => downloadBlob(coverageCsv(coverageEntries, usersById, allSitesById), 'coverage-log.csv', 'text/csv;charset=utf-8')}><Download /> CSV</Button>}
            </div>
            {(aprsLatest.length > 0 || mayEdit) && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <RadioTower className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">APRS</span>
                <span className="text-muted-foreground">{aprsGeo.features.length ? `${aprsGeo.features.length} station${aprsGeo.features.length === 1 ? '' : 's'} on the map` : 'no stations heard in this window'}</span>
                <Select value={aprsAge} onValueChange={setAprsAge}>
                  <SelectTrigger className="h-8 w-28" aria-label="APRS age"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="30">30 min</SelectItem><SelectItem value="180">3 h</SelectItem><SelectItem value="720">12 h</SelectItem><SelectItem value="1440">24 h</SelectItem></SelectContent>
                </Select>
                {mayEdit && <Button size="sm" variant="ghost" onClick={() => downloadBlob(aprsObjectsCsv(sitesToAprsObjects({ sites: locations, positions: depPositions, deploymentName: deployment.name })), `aprs-objects-${deployment.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`, 'text/csv;charset=utf-8')} title="Sites as APRS objects for Emcomm Objects (CSV import)"><Download /> APRS objects</Button>}
              </div>
            )}
            <SiteMap locations={locations} items={items} layers={layers} coverage={coverageGeo} aprs={aprsGeo} onSelect={mayEdit ? (loc) => setForm({ open: true, location: loc }) : undefined} />
            {coverageStats.byChannel.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                {coverageStats.byChannel.map(c => <li key={c.label} className="rounded-md border px-2 py-1"><span className="font-mono">{c.label}</span>: <span className="text-success">{c.direct} ok</span>, <span className="text-warning">{c.relay} relay</span>, <span className="text-destructive">{c.fail} fail</span></li>)}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}

      <CoverageReportDialog open={coverageOpen} onClose={() => setCoverageOpen(false)} channels={[]} sites={locations} defaultToLabel="Net control" onSubmit={(data) => logCoverage.mutate(data)} submitting={logCoverage.isPending} />
      <MapLayersDialog open={layersOpen} onClose={() => setLayersOpen(false)} deployment={deployment} layers={layers} locations={locations} userId={user?.id ?? null} />
      <SiteForm
        open={form.open}
        location={form.location}
        users={usersWithCallSign}
        allLocations={locations}
        onClose={() => setForm({ open: false, location: null })}
        onSubmit={submit}
        submitting={mutations.create.isPending || mutations.update.isPending}
      />
      {dialog}
    </QueryState>
  );
}
