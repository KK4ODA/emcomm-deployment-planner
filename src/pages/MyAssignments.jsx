import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Package, ListTodo, Printer, Radio, MapPin, Play, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { StatCard } from '@/components/common/StatCard';
import { Section } from '@/components/common/Section';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/common/Badges';
import { CallSign } from '@/components/common/CallSign';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useOffline } from '@/contexts/OfflineContext';
import { useCategories, useItems, useLocations, useTasks } from '@/hooks/useEntities';
import { locationsOf, itemsOf } from '@/lib/deployments';
import { itemsAssignedTo } from '@/lib/assignments';
import { tasksInDeployment, compareOpenTasks } from '@/lib/tasks';
import { canEdit } from '@/lib/permissions';
import { NEXT_TASK_STATUS } from '@/lib/constants';
import { formatDate } from '@/lib/time';
import { updateTaskEvent } from '@/api/taskEvents';
import { GoKitList, goKitStorageKey } from '@/features/assignments/GoKitList';
import { ROUTES } from '@/app/routes';

export default function MyAssignments() {
  return <DeploymentGate><MyAssignmentsContent /></DeploymentGate>;
}

function MyAssignmentsContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const { isOnline } = useOffline();
  const categoriesQ = useCategories();
  const itemsQ = useItems();
  const locationsQ = useLocations();
  const tasksQ = useTasks();
  const mayAdvance = canEdit(user?.app_role, 'task');

  const locations = useMemo(() => locationsOf(locationsQ.data ?? [], deploymentId), [locationsQ.data, deploymentId]);
  const siteName = useMemo(() => new Map(locations.map(l => [l.id, l.name])), [locations]);
  const categoryById = useMemo(() => new Map((categoriesQ.data ?? []).map(c => [c.id, c])), [categoriesQ.data]);
  const myItems = useMemo(() => itemsAssignedTo(itemsOf(itemsQ.data ?? [], locations), user?.call_sign), [itemsQ.data, locations, user?.call_sign]);
  const myTasks = useMemo(() => tasksInDeployment(tasksQ.data ?? [], locations).filter(t => t.assigned_to_call_sign === user?.call_sign).sort(compareOpenTasks), [tasksQ.data, locations, user?.call_sign]);
  const mySites = locations.filter(l => l.assigned_call_signs?.includes(user?.call_sign));

  const advance = async (task) => {
    const next = NEXT_TASK_STATUS[task.status];
    if (!next) return;
    try {
      await updateTaskEvent(task.id, { status: next }, user, deploymentId, isOnline);
      tasksQ.refetch();
      if (!isOnline) toast.message('Saved locally', { description: 'The change syncs when you are back online.' });
    } catch (err) {
      toast.error(`Could not update task: ${err.message || 'unknown error'}`);
    }
  };

  if (!user?.call_sign) {
    return (
      <EmptyState icon={Radio} title="Set your call sign first" description="Assignments are tied to your call sign. Add it to your profile to see what you are bringing and doing." action={<Button asChild><Link to={ROUTES.profile}>Go to profile</Link></Button>} />
    );
  }

  const openTasks = myTasks.filter(t => t.status !== 'completed').length;
  const storageKey = goKitStorageKey(deploymentId, user.call_sign);

  return (
    <QueryState queries={[categoriesQ, itemsQ, locationsQ]}>
      <PageHeader
        icon={Package}
        eyebrow={deployment.name}
        title={<span className="flex items-center gap-2">My assignments <CallSign value={user.call_sign} size="md" icon /></span>}
        description="Everything assigned to you in this deployment. Tick items as you pack; print it for your go-kit."
        actions={(myItems.length > 0 || myTasks.length > 0) && <Button variant="outline" className="no-print" onClick={() => window.print()}><Printer /> Print</Button>}
      />

      {myItems.length === 0 && myTasks.length === 0 && mySites.length === 0 ? (
        <EmptyState icon={Package} title="Nothing assigned yet" description="When a leader assigns equipment, tasks or a site to your call sign it will show up here." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <StatCard label="Items to bring" value={myItems.length} icon={Package} tone="info" />
            <StatCard label="Open tasks" value={openTasks} icon={ListTodo} tone={openTasks ? 'accent' : 'success'} />
            <StatCard label="Sites" value={mySites.length} icon={MapPin} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              {mySites.length > 0 && (
                <Section title="My sites" icon={MapPin} bodyClassName="p-0">
                  <ul className="divide-y">
                    {mySites.map(s => (
                      <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{s.name}</p>
                          {s.address && <p className="truncate font-mono text-xs text-muted-foreground">{s.address}</p>}
                          {s.contact_person && <p className="text-xs text-muted-foreground">Contact <span className="font-mono">{s.contact_person}</span></p>}
                        </div>
                        <Button asChild variant="outline" size="sm" className="no-print"><Link to={ROUTES.siteTasks(s.id)}>Tasks</Link></Button>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title="My tasks" icon={ListTodo} aside={`${openTasks} open`} bodyClassName="p-0">
                {myTasks.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">No tasks assigned to you.</p> : (
                  <ul className="divide-y">
                    {myTasks.map(t => {
                      const next = NEXT_TASK_STATUS[t.status];
                      const inProgress = t.status === 'in_progress';
                      return (
                        <li key={t.id} className="flex items-start gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <Link to={ROUTES.siteTasks(t.deployment_location_id)} className={`text-sm font-medium hover:underline ${t.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{t.name}</Link>
                              <TaskStatusBadge status={t.status} />
                            </div>
                            {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <TaskPriorityBadge priority={t.priority} />
                              {siteName.get(t.deployment_location_id) && <span>{siteName.get(t.deployment_location_id)}</span>}
                              {t.due_date && <span>· due {formatDate(t.due_date)}</span>}
                            </p>
                          </div>
                          {mayAdvance && next && (
                            <Button size="sm" variant={inProgress ? 'default' : 'outline'} className="no-print h-7 shrink-0 px-2 text-xs" onClick={() => advance(t)} aria-label={`${inProgress ? 'Mark done' : 'Start'}: ${t.name}`}>
                              {inProgress ? <Check /> : <Play />} {inProgress ? 'Done' : 'Start'}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            </div>

            <GoKitList key={storageKey} storageKey={storageKey} items={myItems} categoryById={categoryById} siteName={siteName} />
          </div>
        </>
      )}
    </QueryState>
  );
}
