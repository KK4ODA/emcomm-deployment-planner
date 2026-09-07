import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useCategories, useItems, useLocations, useUsers, useEntityMutations, reportMutationError } from '@/hooks/useEntities';
import { db } from '@/api/db';
import { exportDeployment } from '@/api/functions';
import { queryKeys } from '@/lib/queryKeys';
import { canCreate, canEdit, canDelete, hasPermission } from '@/lib/permissions';
import { deploymentStats, locationsOf, itemsOf } from '@/lib/deployments';
import { buildTemplateStructure, templateCounts, applyTemplate } from '@/lib/templates';
import { downloadBlob, safeFileName } from '@/lib/download';
import { fileTimestamp } from '@/lib/time';
import { DeploymentCard } from '@/features/deployments/DeploymentCard';
import { DeploymentForm } from '@/features/deployments/DeploymentForm';
import { TemplateForm } from '@/features/templates/TemplateForm';
import { ROUTES } from '@/app/routes';

function normalizeDeployment(data) {
  const { template_id: _template, start_date, end_date, ...rest } = data;
  return { ...rest, start_date: start_date || null, end_date: end_date || null };
}

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

  const [form, setForm] = useState({ open: false, deployment: null });
  const [templateFor, setTemplateFor] = useState(null);
  const [exportingId, setExportingId] = useState(null);
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
      for (const key of [queryKeys.deployments, queryKeys.categories, queryKeys.items, queryKeys.locations]) queryClient.invalidateQueries({ queryKey: key });
      setForm({ open: false, deployment: null });
      toast.success(`Deployment “${deployment.name}” created`);
    },
    onError: reportMutationError('Create deployment'),
  });

  const saveTemplate = useMutation({
    mutationFn: async (/** @type {{ deployment: Object, name: string, description: string }} */ { deployment, name, description }) => {
      const locations = locationsOf(locationsQ.data ?? [], deployment.id);
      const structure = buildTemplateStructure({
        categories: (categoriesQ.data ?? []).filter(c => c.deployment_id === deployment.id),
        locations,
        items: itemsOf(itemsQ.data ?? [], locations),
      });
      return db.templates.create({ name, description, structure, ...templateCounts(structure) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      setTemplateFor(null);
      toast.success('Template saved');
    },
    onError: reportMutationError('Save template'),
  });

  const submit = (data) => {
    if (form.deployment) {
      mutations.update.mutate({ id: form.deployment.id, data: normalizeDeployment(data) }, { onSuccess: () => { setForm({ open: false, deployment: null }); toast.success('Deployment updated'); } });
    } else {
      createWithTemplate.mutate(data);
    }
  };

  const remove = async (deployment) => {
    const ok = await confirm({
      title: `Delete “${deployment.name}”?`,
      description: 'All of its sites, categories, items, tasks and ICS 205 forms will be deleted. This cannot be undone.',
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

  return (
    <>
      <PageHeader
        icon={FolderOpen}
        title="Deployments"
        description="Activations and exercises for your ARES groups"
        actions={perms.canCreate && <Button onClick={() => setForm({ open: true, deployment: null })}><Plus /> New deployment</Button>}
      />
      <QueryState queries={[listQuery, categoriesQ, itemsQ, locationsQ, usersQ]}>
        {deployments.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No deployments yet"
            description={perms.canCreate ? 'Create the first deployment for your group. You can start blank or from a saved template.' : 'Deployments will appear here once an admin creates one for your ARES group.'}
            action={perms.canCreate && <Button onClick={() => setForm({ open: true, deployment: null })}><Plus /> Create deployment</Button>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {deployments.map(d => (
              <DeploymentCard
                key={d.id}
                deployment={d}
                isCurrent={d.id === deploymentId}
                stats={deploymentStats({ deploymentId: d.id, categories: categoriesQ.data ?? [], locations: locationsQ.data ?? [], items: itemsQ.data ?? [], users: usersQ.data ?? [] })}
                permissions={perms}
                exporting={exportingId === d.id}
                onOpen={() => open(d)}
                onEdit={() => setForm({ open: true, deployment: d })}
                onDelete={() => remove(d)}
                onExport={(includeGoKit) => exportText(d, includeGoKit)}
                onSaveTemplate={() => setTemplateFor(d)}
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
      {dialog}
    </>
  );
}
