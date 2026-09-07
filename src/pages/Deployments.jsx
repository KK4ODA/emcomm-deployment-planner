import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, FolderOpen, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useCategories, useItems, useLocations, useUsers, useTasks, useIcs205Forms, useEntityMutations, reportMutationError } from '@/hooks/useEntities';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { db } from '@/api/db';
import { exportDeployment } from '@/api/functions';
import { createTaskEvent } from '@/api/taskEvents';
import { queryKeys } from '@/lib/queryKeys';
import { canCreate, canEdit, canDelete, hasPermission } from '@/lib/permissions';
import { deploymentReadiness, locationsOf, itemsOf, isArchived, duplicateDeployment } from '@/lib/deployments';
import { tasksInDeployment } from '@/lib/tasks';
import { buildTemplateStructure, templateCounts, applyTemplate } from '@/lib/templates';
import { downloadBlob, safeFileName } from '@/lib/download';
import { fileTimestamp } from '@/lib/time';
import { DEPLOYMENT_STATUS, STORAGE_KEYS } from '@/lib/constants';
import { DeploymentCard } from '@/features/deployments/DeploymentCard';
import { DeploymentForm } from '@/features/deployments/DeploymentForm';
import { DuplicateDeploymentDialog } from '@/features/deployments/DuplicateDeploymentDialog';
import { TemplateForm } from '@/features/templates/TemplateForm';
import { ROUTES } from '@/app/routes';

function normalizeDeployment(data) {
  const { template_id: _template, start_date, end_date, ...rest } = data;
  return { ...rest, start_date: start_date || null, end_date: end_date || null };
}

const ALL_KEYS = [queryKeys.deployments, queryKeys.categories, queryKeys.items, queryKeys.locations, queryKeys.tasks];

export default function Deployments() {
  const { user } = useAuth();
  const { deployments, deploymentId, selectDeployment, isLoading, isError } = useCurrentDeployment();
  const { isOnline } = useOffline();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categoriesQ = useCategories();
  const itemsQ = useItems();
  const locationsQ = useLocations();
  const usersQ = useUsers();
  const tasksQ = useTasks();
  const formsQ = useIcs205Forms();

  const [form, setForm] = useState({ open: false, deployment: null });
  const [templateFor, setTemplateFor] = useState(null);
  const [duplicateFor, setDuplicateFor] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showArchived, setShowArchived] = useLocalStorage(STORAGE_KEYS.showArchivedDeployments, false);
  const { confirm, dialog } = useConfirm();

  const role = user?.app_role;
  const perms = {
    canCreate: canCreate(role, 'deployment'),
    canEdit: canEdit(role, 'deployment'),
    canDelete: canDelete(role, 'deployment'),
    canExport: hasPermission(role, 'EXPORT_DEPLOYMENT'),
    canTemplate: canCreate(role, 'template'),
  };

  const mutations = useEntityMutations('deployments', queryKeys.deployments, { label: 'deployment' });

  const archivedCount = deployments.filter(isArchived).length;
  const visible = useMemo(() => (showArchived ? deployments : deployments.filter(d => !isArchived(d))), [deployments, showArchived]);

  /** Everything that belongs to one deployment, for templates and copies. */
  const partsOf = (deployment) => {
    const locations = locationsOf(locationsQ.data ?? [], deployment.id);
    return {
      source: deployment,
      locations,
      categories: (categoriesQ.data ?? []).filter(c => c.deployment_id === deployment.id),
      items: itemsOf(itemsQ.data ?? [], locations),
      tasks: tasksInDeployment(tasksQ.data ?? [], locations),
    };
  };

  const invalidateAll = () => { for (const key of ALL_KEYS) queryClient.invalidateQueries({ queryKey: key }); };

  const createWithTemplate = useMutation({
    mutationFn: async (/** @type {Object} */ data) => {
      const deployment = await db.deployments.create({ ...normalizeDeployment(data), created_by: user?.id });
      if (data.template_id) {
        const template = await db.templates.findById(data.template_id);
        if (template?.structure) await applyTemplate(db, deployment.id, template.structure);
      }
      return deployment;
    },
    onSuccess: (deployment) => {
      invalidateAll();
      setForm({ open: false, deployment: null });
      toast.success(`Deployment “${deployment.name}” created`);
    },
    onError: reportMutationError('Create deployment'),
  });

  const saveTemplate = useMutation({
    mutationFn: async (/** @type {{ deployment: Object, name: string, description: string }} */ { deployment, name, description }) => {
      const parts = partsOf(deployment);
      const structure = buildTemplateStructure(parts);
      return db.templates.create({ name, description, structure, ...templateCounts(structure) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      setTemplateFor(null);
      toast.success('Template saved');
    },
    onError: reportMutationError('Save template'),
  });

  const duplicate = useMutation({
    mutationFn: (/** @type {{ source: Object, name: string, withAssignments: boolean, withTasks: boolean }} */ { source, name, withAssignments, withTasks }) =>
      duplicateDeployment(db, partsOf(source), {
        name, withAssignments, withTasks, createdBy: user?.id ?? null,
        createTask: (task) => createTaskEvent(task, user, isOnline),
      }),
    onSuccess: ({ deployment, counts }) => {
      invalidateAll();
      setDuplicateFor(null);
      toast.success(`“${deployment.name}” created`, {
        description: `${counts.locations} sites, ${counts.items} items, ${counts.tasks} tasks copied.`,
        action: { label: 'Open', onClick: () => { selectDeployment(deployment.id); navigate(ROUTES.dashboard); } },
      });
    },
    onError: reportMutationError('Duplicate deployment'),
  });

  const submit = (data) => {
    if (form.deployment) {
      mutations.update.mutate({ id: form.deployment.id, data: normalizeDeployment(data) }, { onSuccess: () => { setForm({ open: false, deployment: null }); toast.success('Deployment updated'); } });
    } else {
      createWithTemplate.mutate(data);
    }
  };

  const transition = (deployment, to) => {
    setBusyId(deployment.id);
    mutations.update.mutate({ id: deployment.id, data: { status: to } }, {
      onSettled: () => setBusyId(null),
      onSuccess: async () => {
        toast.success(`“${deployment.name}” is now ${DEPLOYMENT_STATUS[to]?.label ?? to}`);
        if (to === 'archived' && deployment.id === deploymentId) selectDeployment(null);
        if (to === 'completed' && perms.canTemplate) {
          const save = await confirm({
            title: 'Save this deployment as a template?',
            description: 'Captures its sites, categories and items so the next activation starts from a proven setup. Assignments are not included.',
            confirmLabel: 'Save as template',
            cancelLabel: 'Not now',
          });
          if (save) setTemplateFor(deployment);
        }
      },
    });
  };

  const remove = async (deployment) => {
    const ok = await confirm({
      title: `Delete “${deployment.name}”?`,
      description: 'All of its sites, categories, items, tasks and ICS 205 forms will be deleted. This cannot be undone. Archiving keeps the record.',
      destructive: true,
    });
    if (!ok) return;
    mutations.remove.mutate(deployment.id, {
      onSuccess: () => { if (deployment.id === deploymentId) selectDeployment(null); toast.success('Deployment deleted'); },
    });
  };

  const exportText = async (deployment, includeGoKit) => {
    if (!isOnline) { toast.error('Exports need a connection to the server.'); return; }
    setExportingId(deployment.id);
    try {
      const text = await exportDeployment({ deploymentId: deployment.id, includeGoKit });
      downloadBlob(text, `${safeFileName(deployment.name)}_${fileTimestamp()}.txt`, 'text/plain;charset=utf-8');
      toast.success('Export downloaded');
    } catch (err) {
      toast.error(`Export failed: ${err.message || 'unknown error'}`);
    } finally {
      setExportingId(null);
    }
  };

  const open = (deployment) => {
    selectDeployment(deployment.id);
    navigate(ROUTES.dashboard);
  };

  const listQuery = { isLoading, isError, error: null, refetch: () => queryClient.invalidateQueries({ queryKey: queryKeys.deployments }) };
  const duplicateCounts = duplicateFor ? (() => { const p = partsOf(duplicateFor); return { sites: p.locations.length, categories: p.categories.length, items: p.items.length, tasks: p.tasks.length }; })() : { sites: 0, categories: 0, items: 0, tasks: 0 };

  return (
    <>
      <PageHeader
        icon={FolderOpen}
        title="Deployments"
        description="Activations and exercises for your ARES groups. Active ones are listed first."
        actions={(
          <>
            {archivedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowArchived(v => !v)}>
                <Archive /> {showArchived ? 'Hide archived' : `Show ${archivedCount} archived`}
              </Button>
            )}
            {perms.canCreate && <Button onClick={() => setForm({ open: true, deployment: null })}><Plus /> New deployment</Button>}
          </>
        )}
      />
      <QueryState queries={[listQuery, categoriesQ, itemsQ, locationsQ, usersQ, formsQ]}>
        {deployments.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No deployments yet"
            description={perms.canCreate ? 'Create the first deployment for your group. You can start blank or from a saved template.' : 'Deployments will appear here once an admin creates one for your ARES group.'}
            action={perms.canCreate && <Button onClick={() => setForm({ open: true, deployment: null })}><Plus /> Create deployment</Button>}
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={Archive} title="Only archived deployments" description="Everything is archived." action={<Button variant="outline" onClick={() => setShowArchived(true)}>Show archived</Button>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(d => (
              <DeploymentCard
                key={d.id}
                deployment={d}
                isCurrent={d.id === deploymentId}
                readiness={deploymentReadiness({
                  deploymentId: d.id, categories: categoriesQ.data ?? [], locations: locationsQ.data ?? [], items: itemsQ.data ?? [],
                  users: usersQ.data ?? [], tasks: tasksQ.data ?? [], forms: formsQ.data ?? [],
                })}
                permissions={perms}
                exporting={exportingId === d.id}
                busy={busyId === d.id}
                onOpen={() => open(d)}
                onEdit={() => setForm({ open: true, deployment: d })}
                onDelete={() => remove(d)}
                onExport={(includeGoKit) => exportText(d, includeGoKit)}
                onSaveTemplate={() => setTemplateFor(d)}
                onDuplicate={() => setDuplicateFor(d)}
                onTransition={(to) => transition(d, to)}
              />
            ))}
          </div>
        )}
      </QueryState>

      <DeploymentForm
        open={form.open}
        deployment={form.deployment}
        onClose={() => setForm({ open: false, deployment: null })}
        onSubmit={submit}
        submitting={createWithTemplate.isPending || mutations.update.isPending}
      />
      <TemplateForm
        open={!!templateFor}
        sourceName={templateFor?.name}
        onClose={() => setTemplateFor(null)}
        onSubmit={({ name, description }) => saveTemplate.mutate({ deployment: templateFor, name, description })}
        submitting={saveTemplate.isPending}
      />
      <DuplicateDeploymentDialog
        open={!!duplicateFor}
        source={duplicateFor}
        counts={duplicateCounts}
        onClose={() => setDuplicateFor(null)}
        onSubmit={(data) => duplicate.mutate({ source: duplicateFor, ...data })}
        submitting={duplicate.isPending}
      />
      {dialog}
    </>
  );
}
