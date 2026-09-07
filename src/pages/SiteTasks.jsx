import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, ListTodo, Clock, Play, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { StatCard } from '@/components/common/StatCard';
import { QueryState } from '@/components/common/QueryState';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { CallSignList } from '@/components/common/CallSign';
import { useAuth } from '@/lib/AuthContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useLocations, useTasks } from '@/hooks/useEntities';
import { canCreate, canEdit, canDelete } from '@/lib/permissions';
import { groupTasksByStatus, summarizeTasks } from '@/lib/tasks';
import { NEXT_TASK_STATUS, TASK_STATUS } from '@/lib/constants';
import { createTaskEvent, updateTaskEvent, deleteTaskEvent } from '@/api/taskEvents';
import { TaskForm } from '@/features/tasks/TaskForm';
import { TaskCard } from '@/features/tasks/TaskCard';
import { ROUTES } from '@/app/routes';

/** @type {Array<{ status: string, icon: React.ElementType, tone: 'neutral'|'info'|'success' }>} */
const COLUMNS = [
  { status: 'pending', icon: Clock, tone: 'neutral' },
  { status: 'in_progress', icon: Play, tone: 'info' },
  { status: 'completed', icon: CheckCircle2, tone: 'success' },
];

export default function SiteTasks() {
  const { siteId } = useParams();
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const locationsQ = useLocations();
  const tasksQ = useTasks();
  const [form, setForm] = useState({ open: false, task: null });
  const { confirm, dialog } = useConfirm();

  const location = (locationsQ.data ?? []).find(l => l.id === siteId);
  const tasks = useMemo(() => (tasksQ.data ?? []).filter(t => t.deployment_location_id === siteId), [tasksQ.data, siteId]);
  const groups = useMemo(() => groupTasksByStatus(tasks), [tasks]);
  const summary = summarizeTasks(tasks);

  const role = user?.app_role;
  const mayCreate = canCreate(role, 'task');
  const mayEdit = canEdit(role, 'task');
  const mayDelete = canDelete(role, 'task');
  const deploymentId = location?.deployment_id ?? null;

  const onError = (label) => (err) => toast.error(`${label} failed: ${err?.message || 'unknown error'}`);
  const refresh = () => tasksQ.refetch();

  const create = useMutation({ mutationFn: (/** @type {Object} */ data) => createTaskEvent({ ...data, deployment_id: deploymentId }, user, isOnline), onSuccess: () => { refresh(); setForm({ open: false, task: null }); toast.success(isOnline ? 'Task created' : 'Task saved locally; it will sync when online'); }, onError: onError('Create task') });
  const update = useMutation({ mutationFn: (/** @type {{ id: string, data: Object }} */ { id, data }) => updateTaskEvent(id, data, user, deploymentId, isOnline), onSuccess: () => { refresh(); setForm({ open: false, task: null }); }, onError: onError('Update task') });
  const remove = useMutation({ mutationFn: (/** @type {string} */ id) => deleteTaskEvent(id, user, deploymentId, isOnline), onSuccess: refresh, onError: onError('Delete task') });

  const advance = (task) => {
    const next = NEXT_TASK_STATUS[task.status];
    if (next) update.mutate({ id: task.id, data: { status: next } });
  };

  const del = async (task) => {
    if (await confirm({ title: `Delete task “${task.name}”?`, destructive: true })) remove.mutate(task.id);
  };

  return (
    <QueryState queries={[locationsQ]}>
      {!location ? (
        <EmptyState icon={ListTodo} title="Site not found" description="This site does not exist or belongs to a deployment you cannot see." action={<Button asChild variant="outline"><a href={ROUTES.sites}>Back to sites</a></Button>} />
      ) : (
        <>
          <PageHeader
            backTo={ROUTES.sites}
            backLabel="Sites"
            eyebrow="Setup tasks"
            title={location.name}
            description={location.assigned_call_signs?.length ? <span className="inline-flex flex-wrap items-center gap-1.5">Operators: <CallSignList values={location.assigned_call_signs} /></span> : 'No operators assigned to this site yet'}
            actions={mayCreate && <Button onClick={() => setForm({ open: true, task: null })}><Plus /> Add task</Button>}
          />

          <div className="mb-4 grid grid-cols-3 gap-2">
            {COLUMNS.map(({ status, icon, tone }) => (
              <StatCard key={status} label={TASK_STATUS[status].label} value={summary[status]} icon={icon} tone={tone} />
            ))}
          </div>

          {tasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="No tasks yet"
              description={mayCreate ? 'List what has to happen to bring this site on the air: antennas, power, radios, check-ins.' : 'Tasks for this site have not been created yet.'}
              action={mayCreate && <Button onClick={() => setForm({ open: true, task: null })}><Plus /> Create first task</Button>}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {COLUMNS.map(({ status, icon: Icon }) => (
                <section key={status} aria-label={TASK_STATUS[status].label} className="rounded-lg border bg-muted/30 p-2">
                  <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {TASK_STATUS[status].label} <span className="tnum ml-auto">{groups[status].length}</span>
                  </h2>
                  <div className="space-y-2">
                    {groups[status].length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">None</p>}
                    {groups[status].map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        canEdit={mayEdit}
                        canDelete={mayDelete}
                        canAdvance={mayEdit}
                        highlight={!!user?.call_sign && task.assigned_to_call_sign === user.call_sign && status !== 'completed'}
                        onEdit={(t) => setForm({ open: true, task: t })}
                        onDelete={del}
                        onAdvance={advance}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <TaskForm
            open={form.open}
            task={form.task}
            locationId={siteId}
            callSigns={location.assigned_call_signs || []}
            onClose={() => setForm({ open: false, task: null })}
            onSubmit={(data) => (form.task ? update.mutate({ id: form.task.id, data }) : create.mutate(data))}
            submitting={create.isPending || update.isPending}
          />
          {dialog}
        </>
      )}
    </QueryState>
  );
}
