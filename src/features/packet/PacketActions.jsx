import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { LogIn, MapPinCheck, LogOut, CloudOff, AlertTriangle, X, MessageSquareHeart } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { queueStatusIntent, discardIntent } from '@/api/assignmentIntents';
import { queryKeys } from '@/lib/queryKeys';
import { nextActions, effectiveStatus, statusTime, confirmationText } from '@/lib/operations';
import { useOffline } from '@/contexts/OfflineContext';
import { formatDateTime } from '@/lib/time';

const ICONS = { checked_in: LogIn, on_position: MapPinCheck, released: LogOut };

/**
 * Check in / On position / Check out for the operator's own assignment.
 * Works offline: the intent is stored on the device and sent later.
 * @param {{ assignment: Object, intents: Object[] }} props
 */
export function PacketActions({ assignment, intents }) {
  const { isOnline } = useOffline();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const status = effectiveStatus(assignment, intents);
  const actions = nextActions(status);
  const mine = intents.filter(i => i.assignment_id === assignment.id);
  const pending = mine.filter(i => !i.error);
  const failed = mine.filter(i => i.error);

  const act = async (next) => {
    setBusy(true);
    try {
      const result = await queueStatusIntent({ assignmentId: assignment.id, deploymentId: assignment.deployment_id, status: next, online: isOnline });
      if (result.sent) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
        toast.success(confirmationText(next, result.intent.at, true));
      } else if (result.error?.permanent) {
        toast.error(`Not accepted: ${result.error.message}`);
      } else {
        toast.message(confirmationText(next, result.intent.at, false));
      }
    } finally {
      setBusy(false);
    }
  };

  const lastTime = statusTime(assignment, status, intents);
  const line = status === 'released' ? `Checked out ${formatDateTime(lastTime, 'HH:mm')}. Thank you.`
    : status === 'on_position' ? `On position since ${formatDateTime(lastTime, 'HH:mm')}`
    : status === 'checked_in' ? `Checked in ${formatDateTime(lastTime, 'HH:mm')}`
    : null;

  return (
    <>
      {actions.map(a => {
        const Icon = ICONS[a.status];
        return (
          <Button key={a.status} size="lg" variant={a.primary ? 'default' : 'outline'} className="h-12 text-base" onClick={() => act(a.status)} loading={busy}>
            <Icon /> {a.label}
          </Button>
        );
      })}
      {(line || pending.length > 0 || failed.length > 0) && (
        <div className="col-span-2 space-y-1 text-sm">
          {line && <p className="text-muted-foreground">{line}</p>}
          {status === 'released' && <Link to={ROUTES.aar} className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"><MessageSquareHeart className="h-4 w-4" /> Tell the coordinator how it went (2 minutes)</Link>}
          {pending.length > 0 && <p className="inline-flex items-center gap-1.5 text-warning"><CloudOff className="h-4 w-4" /> {pending.length} change{pending.length === 1 ? '' : 's'} saved on this device, sending when you have signal.</p>}
          {failed.map(f => (
            <p key={f.id} className="inline-flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-4 w-4" /> {f.status.replace('_', ' ')} was rejected: {f.error}
              <button type="button" onClick={() => discardIntent(f.id)} className="inline-flex items-center gap-0.5 underline"><X className="h-3 w-3" /> dismiss</button>
            </p>
          ))}
        </div>
      )}
    </>
  );
}
