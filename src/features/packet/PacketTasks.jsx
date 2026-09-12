import React, { useState } from 'react';
import { ListTodo, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOffline } from '@/contexts/OfflineContext';
import { queueTaskIntent, effectiveTaskStatus } from '@/api/tasking';
import { TASK_STATUS, TASK_PRIORITY, nextTaskStep, taskRoute, isOpenTask } from '@/lib/tasking';
import { formatDateTime } from '@/lib/time';
import { openExternal } from '@/lib/platform';
import { cn } from '@/lib/utils';

const TONE_BADGE = { neutral: 'outline', info: 'info', warning: 'warning', success: 'success', muted: 'muted', critical: 'critical' };

/**
 * "Your tasks" on the packet: what the desk asked, where, and one big button
 * for the next step. Works offline; the step is queued like a check-in.
 * @param {{ tasks: Object[], deploymentId: string, sitesById: Map<string, Object>, intents?: Object[], onChanged?: () => void }} props
 */
export function PacketTasks({ tasks, deploymentId, sitesById, intents = [], onChanged }) {
  const { isOnline } = useOffline();
  const [busy, setBusy] = useState('');
  const open = tasks.filter(t => isOpenTask({ status: effectiveTaskStatus(t, intents) }));
  if (open.length === 0) return null;
  const step = async (t, next) => {
    setBusy(t.id);
    try {
      const r = await queueTaskIntent({ taskId: t.id, deploymentId, status: next.status, online: isOnline });
      if (r.sent) toast.success(`Task ${t.seq}: ${TASK_STATUS[next.status].label.toLowerCase()}`);
      else if (r.error?.permanent) toast.error(`Task ${t.seq}: ${r.error.message}`);
      else toast.info(`Task ${t.seq}: ${TASK_STATUS[next.status].label.toLowerCase()}, saved on this device; the desk is told when you have signal.`);
      onChanged?.();
    } finally { setBusy(''); }
  };
  return (
    <section className="rounded-xl border-2 border-primary/40 bg-card p-4 shadow-sm print:border print:p-2 print:shadow-none">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><ListTodo className="h-4 w-4" aria-hidden /> Your tasks</h2>
      <ul className="space-y-3">
        {open.map(t => {
          const status = effectiveTaskStatus(t, intents);
          const st = TASK_STATUS[status];
          const next = nextTaskStep(status);
          const route = taskRoute(t, sitesById);
          const dest = t.to_site_id ? sitesById.get(t.to_site_id) : null;
          const destUrl = dest?.lat != null && dest?.lon != null ? `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lon}` : null;
          const pending = intents.some(i => i.kind === 'task' && i.task_id === t.id && !i.error);
          return (
            <li key={t.id} className={cn('rounded-lg border p-3', t.priority === 'urgent' && 'border-destructive/60 bg-destructive/5', t.priority === 'priority' && 'border-warning/60 bg-warning/5')}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">Task {t.seq}</span>
                {t.priority !== 'routine' && <Badge variant={TONE_BADGE[TASK_PRIORITY[t.priority].tone]}>{TASK_PRIORITY[t.priority].label}</Badge>}
                <Badge variant={TONE_BADGE[st.tone]}>{st.label}{pending ? ' (saved on this device)' : ''}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">issued {formatDateTime(t.issued_at, 'HH:mm')}</span>
              </div>
              <p className="mt-1 text-lg font-semibold leading-tight">{t.title}</p>
              {route && <p className="text-sm text-muted-foreground">{route}</p>}
              {t.detail && <p className="mt-1 text-sm">{t.detail}</p>}
              <div className="no-print mt-3 grid grid-cols-2 gap-2">
                {next && <Button size="lg" className="h-12 text-base" disabled={busy === t.id} onClick={() => step(t, next)}>{next.label}</Button>}
                {destUrl && <Button size="lg" variant="outline" className="h-12 text-base" onClick={() => openExternal(destUrl)}><Navigation /> Directions</Button>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
