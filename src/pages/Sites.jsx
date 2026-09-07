import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, MapPin, List, Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useLocations, useItems, useUsers, useIcs205Forms, useTasks, useEntityMutations, useRealtimeInvalidation } from '@/hooks/useEntities';
import { queryKeys } from '@/lib/queryKeys';
import { canCreate, canEdit, canDelete } from '@/lib/permissions';
import { locationsOf, locationItemStats } from '@/lib/deployments';
import { summarizeTasks } from '@/lib/tasks';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { SiteCard } from '@/features/sites/SiteCard';
import { SiteForm } from '@/features/sites/SiteForm';
import { SiteMap } from '@/features/sites/SiteMap';
import { Ics205Dialog } from '@/features/ics205/Ics205Dialog';

export default function Sites() {
  return <DeploymentGate><SitesContent /></DeploymentGate>;
}

function SitesContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const locationsQ = useLocations();
  const itemsQ = useItems();
  const usersQ = useUsers();
  const formsQ = useIcs205Forms();
  const tasksQ = useTasks();
  useRealtimeInvalidation('locations', queryKeys.locations);

  const [view, setView] = useLocalStorage('emcomm_sites_view', 'list');
  const [form, setForm] = useState({ open: false, location: null });
  const [ics205Site, setIcs205Site] = useState(null);
  const { confirm, dialog } = useConfirm();
  const mutations = useEntityMutations('locations', queryKeys.locations, { label: 'site' });

  const role = user?.app_role;
  const mayCreate = canCreate(role, 'location');
  const mayEdit = canEdit(role, 'location');
  const mayDelete = canDelete(role, 'location');

  const locations = useMemo(() => locationsOf(locationsQ.data ?? [], deploymentId), [locationsQ.data, deploymentId]);
  const items = itemsQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const forms = formsQ.data ?? [];
  const usersWithCallSign = useMemo(() => (usersQ.data ?? []).filter(u => u.call_sign), [usersQ.data]);

  const submit = (data) => {
    const payload = { ...data, deployment_id: deploymentId };
    const close = () => setForm({ open: false, location: null });
    if (form.location) mutations.update.mutate({ id: form.location.id, data: payload }, { onSuccess: () => { close(); toast.success('Site updated'); } });
    else mutations.create.mutate(payload, { onSuccess: () => { close(); toast.success('Site created'); } });
  };

  const remove = async (location) => {
    if (await confirm({ title: `Delete “${location.name}”?`, description: 'All items, tasks and the ICS 205 form for this site will be deleted.', destructive: true })) {
      mutations.remove.mutate(location.id, { onSuccess: () => toast.success('Site deleted') });
    }
  };

  return (
    <QueryState queries={[locationsQ, itemsQ, usersQ, formsQ]}>
      <PageHeader
        icon={MapPin}
        eyebrow={deployment.name}
        title="Sites"
        description="Where operators deploy: EOCs, shelters, relay points, staging areas"
        actions={mayCreate && <Button onClick={() => setForm({ open: true, location: null })}><Plus /> Add site</Button>}
      />

      {locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No sites yet"
          description={mayCreate ? 'Add the sites for this deployment. Each site gets its own equipment list, setup tasks and ICS 205 radio plan.' : 'Sites will appear here once an admin adds them.'}
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
              {locations.map(loc => (
                <SiteCard
                  key={loc.id}
                  location={loc}
                  itemStats={locationItemStats(items, loc.id)}
                  taskSummary={summarizeTasks(tasks.filter(t => t.deployment_location_id === loc.id))}
                  hasIcs205={forms.some(f => f.deployment_location_id === loc.id)}
                  canEdit={mayEdit}
                  canDelete={mayDelete}
                  onEdit={() => setForm({ open: true, location: loc })}
                  onDelete={() => remove(loc)}
                  onIcs205={() => setIcs205Site(loc)}
                />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="map">
            <SiteMap locations={locations} items={items} onSelect={mayEdit ? (loc) => setForm({ open: true, location: loc }) : undefined} />
          </TabsContent>
        </Tabs>
      )}

      <SiteForm
        open={form.open}
        location={form.location}
        users={usersWithCallSign}
        allLocations={locations}
        onClose={() => setForm({ open: false, location: null })}
        onSubmit={submit}
        submitting={mutations.create.isPending || mutations.update.isPending}
      />
      <Ics205Dialog
        open={!!ics205Site}
        location={ics205Site}
        deployment={deployment}
        form={ics205Site ? forms.find(f => f.deployment_location_id === ics205Site.id) ?? null : null}
        onClose={() => setIcs205Site(null)}
      />
      {dialog}
    </QueryState>
  );
}
