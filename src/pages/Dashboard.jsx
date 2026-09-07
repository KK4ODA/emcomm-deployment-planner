import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Package, Users, Layers, PackageX, ListTodo, FolderPlus, MapPin, UserCheck, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState } from '@/components/common/EmptyState';
import { SearchInput } from '@/components/common/SearchInput';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { DeploymentStatusBadge } from '@/components/common/Badges';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useCategories, useItems, useLocations, useUsers, useTasks, usePositions, useShifts, useAssignments, useRealtimeInvalidation } from '@/hooks/useEntities';
import { coverageSummary } from '@/lib/staffing';
import { queryKeys } from '@/lib/queryKeys';
import { canCreate, canEdit, canDelete, hasPermission } from '@/lib/permissions';
import { assigneesOf, isUnassigned, toggleAssignee } from '@/lib/assignments';
import { summarizeTasks, tasksInDeployment } from '@/lib/tasks';
import { locationsOf, itemsOf } from '@/lib/deployments';
import { CategoryBoard } from '@/features/items/CategoryBoard';
import { CategoryForm } from '@/features/items/CategoryForm';
import { ItemForm } from '@/features/items/ItemForm';
import { BulkAssignDialog } from '@/features/items/BulkAssignDialog';
import { useCategoryMutations, useItemMutations } from '@/features/items/useItemMutations';
import { SiteOverview } from '@/features/dashboard/SiteOverview';
import { SiteFilter, SiteFilterBanner } from '@/features/dashboard/SiteFilter';
import { ROUTES } from '@/app/routes';

export default function Dashboard() {
  return (
    <DeploymentGate>
      <DashboardContent />
    </DeploymentGate>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const siteFilter = searchParams.get('site') || null;

  const categoriesQ = useCategories();
  const itemsQ = useItems();
  const locationsQ = useLocations();
  const usersQ = useUsers();
  const tasksQ = useTasks();
  const positionsQ = usePositions();
  const shiftsQ = useShifts();
  const assignmentsQ = useAssignments();
  useRealtimeInvalidation('assignments', queryKeys.assignments);
  useRealtimeInvalidation('categories', queryKeys.categories);
  useRealtimeInvalidation('items', queryKeys.items);
  useRealtimeInvalidation('locations', queryKeys.locations);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [categoryDialog, setCategoryDialog] = useState({ open: false, category: null });
  const [itemDialog, setItemDialog] = useState({ open: false, item: null, categoryId: null });
  const [bulkOpen, setBulkOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const categoryMut = useCategoryMutations();
  const itemMut = useItemMutations();

  const role = user?.app_role;
  const permissions = {
    canCreateCategory: canCreate(role, 'category'),
    canEditCategory: canEdit(role, 'category'),
    canDeleteCategory: canDelete(role, 'category'),
    canCreateItem: canCreate(role, 'item'),
    canEditItem: canEdit(role, 'item'),
    canDeleteItem: canDelete(role, 'item'),
    canAssignItem: hasPermission(role, 'ASSIGN_ITEM'),
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const locations = useMemo(() => locationsOf(locationsQ.data ?? [], deploymentId), [locationsQ.data, deploymentId]);
  const filteredLocation = siteFilter ? locations.find(l => l.id === siteFilter) : undefined;
  const categories = useMemo(() => (categoriesQ.data ?? []).filter(c => c.deployment_id === deploymentId), [categoriesQ.data, deploymentId]);
  const deploymentItems = useMemo(() => itemsOf(itemsQ.data ?? [], locations), [itemsQ.data, locations]);
  const items = useMemo(() => (siteFilter ? deploymentItems.filter(i => i.deployment_location_id === siteFilter) : deploymentItems), [deploymentItems, siteFilter]);
  const usersWithCallSign = useMemo(() => (usersQ.data ?? []).filter(u => u.call_sign), [usersQ.data]);
  const siteNameById = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations]);
  const tasks = useMemo(() => tasksInDeployment(tasksQ.data ?? [], locations, siteFilter), [tasksQ.data, locations, siteFilter]);
  const taskSummary = summarizeTasks(tasks);
  const staffing = useMemo(() => {
    const positions = (positionsQ.data ?? []).filter(p => p.deployment_id === deploymentId && (!siteFilter || p.site_id === siteFilter));
    const ids = new Set(positions.map(p => p.id));
    const usersById = new Map((usersQ.data ?? []).map(u => [u.id, u]));
    return coverageSummary(positions, (shiftsQ.data ?? []).filter(s => ids.has(s.position_id)), assignmentsQ.data ?? [], usersById);
  }, [positionsQ.data, shiftsQ.data, assignmentsQ.data, usersQ.data, deploymentId, siteFilter]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.name.toLowerCase().includes(q) || assigneesOf(i).some(cs => cs.toLowerCase().includes(q)));
  }, [items, search]);

  const itemsByCategory = useMemo(() => {
    const map = new Map(categories.map(c => [c.id, []]));
    for (const item of filteredItems) {
      if (map.has(item.category_id)) map.get(item.category_id).push(item);
    }
    for (const list of map.values()) list.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    return map;
  }, [categories, filteredItems]);

  const unassignedCount = items.filter(isUnassigned).length;

  // ── Actions ───────────────────────────────────────────────────────────────
  const setSiteFilter = (id) => setSearchParams(id ? { site: id } : {}, { replace: true });

  const jumpToUnassigned = (locationId = null) => {
    const candidates = filteredItems.filter(i => isUnassigned(i) && (!locationId || i.deployment_location_id === locationId));
    if (!candidates.length) return;
    const first = candidates[0];
    setExpanded(prev => ({ ...prev, [first.category_id]: true }));
    setTimeout(() => {
      const selector = locationId ? `[data-unassigned="true"][data-location="${locationId}"]` : '[data-unassigned="true"]';
      const el = document.querySelector(selector);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-accent');
      setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 1800);
    }, 150);
  };

  const openTasks = () => navigate(siteFilter ? ROUTES.siteTasks(siteFilter) : ROUTES.sites);

  const submitCategory = (data) => {
    const payload = { ...data, deployment_id: deploymentId };
    const close = () => setCategoryDialog({ open: false, category: null });
    if (categoryDialog.category) categoryMut.update.mutate({ id: categoryDialog.category.id, data: payload }, { onSuccess: close });
    else categoryMut.create.mutate({ ...payload, sort_order: categories.length }, { onSuccess: close });
  };

  const submitItem = (data) => {
    const close = () => setItemDialog({ open: false, item: null, categoryId: null });
    if (itemDialog.item) itemMut.update.mutate({ id: itemDialog.item.id, data }, { onSuccess: close });
    else itemMut.create.mutate({ ...data, sort_order: (itemsByCategory.get(data.category_id)?.length ?? 0) }, { onSuccess: close });
  };

  const deleteCategory = async (category) => {
    if (await confirm({ title: `Delete “${category.name}”?`, description: 'Items in this category will lose their category link.', destructive: true })) {
      categoryMut.remove.mutate(category.id);
    }
  };

  const deleteItem = async (item) => {
    if (await confirm({ title: `Delete “${item.name}”?`, destructive: true })) itemMut.remove.mutate(item.id);
  };

  const toggleAssignment = (item, callSign) => {
    itemMut.update.mutate({ id: item.id, data: { assigned_to: toggleAssignee(item, callSign) } });
  };

  const bulkAssign = ({ items: targets, callSign }) => {
    itemMut.bulkAssign.mutate({ items: targets, callSign }, {
      onSuccess: (count) => { setBulkOpen(false); toast.success(`${count} item${count === 1 ? '' : 's'} assigned to ${callSign}`); },
    });
  };

  return (
    <QueryState queries={[categoriesQ, itemsQ, locationsQ, usersQ]}>
      <PageHeader
        eyebrow="Deployment dashboard"
        title={<span className="flex items-center gap-2">{deployment.name} <DeploymentStatusBadge status={deployment.status} /></span>}
        description={deployment.location || deployment.description || 'Equipment assignments and setup tasks'}
        actions={<SiteFilter locations={locations} value={siteFilter} onChange={setSiteFilter} />}
      />

      {locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No sites yet"
          description="Equipment and tasks are organised by site. Create the first site for this deployment to get started."
          action={<Button asChild><Link to={ROUTES.sites}><Plus /> Add a site</Link></Button>}
        />
      ) : (
        <>
          <SiteFilterBanner location={filteredLocation} onClear={() => setSiteFilter(null)} />

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Staffed"
              value={<>{staffing.covered}<span className="text-sm font-normal text-muted-foreground">/{staffing.slots}</span></>}
              icon={ClipboardList}
              tone={staffing.slots === 0 ? 'neutral' : staffing.open ? 'critical' : staffing.pending ? 'warning' : 'success'}
              onClick={() => navigate(ROUTES.staffing)}
              hint={staffing.slots === 0 ? 'No positions yet' : staffing.open ? `${staffing.open} open` : staffing.pending ? `${staffing.pending} awaiting reply` : 'All slots confirmed'}
            />
            <StatCard label="Items" value={items.length} icon={Package} tone="info" />
            <StatCard label="Unassigned" value={unassignedCount} icon={PackageX} tone={unassignedCount ? 'critical' : 'success'} onClick={unassignedCount ? () => jumpToUnassigned() : undefined} hint={unassignedCount ? 'Click to locate' : 'All items covered'} />
            <StatCard label="Tasks done" value={<>{taskSummary.completed}<span className="text-sm font-normal text-muted-foreground">/{taskSummary.total}</span></>} icon={ListTodo} tone={taskSummary.total && taskSummary.completed === taskSummary.total ? 'success' : 'accent'} onClick={openTasks} hint={siteFilter ? 'Open site tasks' : 'Open sites'} />
            <StatCard label="Categories" value={categories.length} icon={Layers} />
            <StatCard label="Operators" value={usersWithCallSign.length} icon={Users} hint="Members with a call sign" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchInput value={search} onChange={setSearch} placeholder="Search items or call signs…" className="flex-1" />
                {(permissions.canCreateCategory || permissions.canCreateItem || permissions.canAssignItem) && (
                  <div className="flex flex-wrap gap-2">
                    {permissions.canAssignItem && unassignedCount > 0 && (
                      <Button variant="outline" onClick={() => setBulkOpen(true)}><UserCheck /> Assign {unassignedCount} unassigned</Button>
                    )}
                    {permissions.canCreateCategory && (
                      <Button variant="outline" onClick={() => setCategoryDialog({ open: true, category: null })}><FolderPlus /> Category</Button>
                    )}
                    {permissions.canCreateItem && (
                      <Button onClick={() => setItemDialog({ open: true, item: null, categoryId: null })} disabled={categories.length === 0}><Plus /> Item</Button>
                    )}
                  </div>
                )}
              </div>

              {categories.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="No categories yet"
                  description={permissions.canCreateCategory ? 'Group equipment into categories such as Radios, Antennas, Power.' : 'An admin has not set up equipment categories for this deployment yet.'}
                  action={permissions.canCreateCategory && <Button onClick={() => setCategoryDialog({ open: true, category: null })}><FolderPlus /> Create first category</Button>}
                />
              ) : (
                <CategoryBoard
                  categories={categories}
                  itemsByCategory={itemsByCategory}
                  users={usersWithCallSign}
                  siteNameById={siteNameById}
                  showSite={!siteFilter && locations.length > 1}
                  permissions={permissions}
                  expanded={expanded}
                  onToggleExpanded={(id) => setExpanded(prev => ({ ...prev, [id]: prev[id] === false }))}
                  onEditCategory={(category) => setCategoryDialog({ open: true, category })}
                  onDeleteCategory={deleteCategory}
                  onAddItem={(category) => setItemDialog({ open: true, item: null, categoryId: category.id })}
                  onEditItem={(item) => setItemDialog({ open: true, item, categoryId: null })}
                  onDeleteItem={deleteItem}
                  onDuplicateItem={(item) => itemMut.duplicate.mutate(item)}
                  onToggleAssignee={toggleAssignment}
                  onReorderCategories={(ordered) => itemMut.reorderCategories.mutate(ordered)}
                  onReorderItems={(ordered) => itemMut.reorderItems.mutate(ordered)}
                />
              )}
            </div>

            <div className="space-y-4">
              <SiteOverview locations={siteFilter ? locations.filter(l => l.id === siteFilter) : locations} tasks={tasks} items={deploymentItems} onJumpToUnassigned={jumpToUnassigned} />
            </div>
          </div>
        </>
      )}

      <CategoryForm
        open={categoryDialog.open}
        category={categoryDialog.category}
        onClose={() => setCategoryDialog({ open: false, category: null })}
        onSubmit={submitCategory}
        submitting={categoryMut.create.isPending || categoryMut.update.isPending}
      />
      <ItemForm
        open={itemDialog.open}
        item={itemDialog.item}
        defaultCategoryId={itemDialog.categoryId}
        defaultLocationId={siteFilter}
        categories={categories}
        locations={locations}
        users={usersWithCallSign}
        allItems={itemsQ.data ?? []}
        onClose={() => setItemDialog({ open: false, item: null, categoryId: null })}
        onSubmit={submitItem}
        submitting={itemMut.create.isPending || itemMut.update.isPending}
      />
      <BulkAssignDialog
        open={bulkOpen}
        items={deploymentItems}
        locations={locations}
        users={usersWithCallSign}
        defaultLocationId={siteFilter}
        currentCallSign={user?.call_sign || null}
        onClose={() => setBulkOpen(false)}
        onSubmit={bulkAssign}
        submitting={itemMut.bulkAssign.isPending}
      />
      {confirmDialog}
    </QueryState>
  );
}
