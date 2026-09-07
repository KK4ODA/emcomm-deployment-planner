import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, BellRing, Smartphone, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/AuthContext';
import { updateProfile } from '@/api/auth';
import { getDeliveryStatus, savePushSubscription, removePushSubscription, listPushSubscriptions } from '@/api/notificationDelivery';
import { isPushSupported, notificationPermission, currentSubscription, subscribePush, unsubscribePush } from '@/lib/push';
import { CHANNELS, normalizePrefs, channelAvailability } from '@/lib/notificationPrefs';
import { formatDateTime } from '@/lib/time';
import { reportMutationError } from '@/hooks/useEntities';

/**
 * Profile › Notifications: which channels carry assignment changes, plan
 * changes and open-shift offers. In-app is always on.
 * @param {{ user: Object, onSaved: () => void }} props
 */
export function NotificationsCard({ user, onSaved }) {
  const { isOfflineSession } = useAuth();
  const queryClient = useQueryClient();
  const prefs = normalizePrefs(user?.notification_prefs);
  const statusQ = useQuery({ queryKey: ['delivery-status'], queryFn: getDeliveryStatus, staleTime: 5 * 60_000, retry: 1 });
  const devicesQ = useQuery({ queryKey: ['push-subscriptions', user?.id], queryFn: () => listPushSubscriptions(user.id), enabled: !!user?.id });
  const [thisDevice, setThisDevice] = useState(/** @type {string|null} */ (null));
  const supported = isPushSupported();
  useEffect(() => { currentSubscription().then(s => setThisDevice(s?.endpoint ?? null)).catch(() => {}); }, []);

  const save = useMutation({
    mutationFn: (/** @type {Object} */ next) => updateProfile(user.id, { notification_prefs: next }),
    onSuccess: () => { onSaved(); toast.success('Notification settings saved'); },
    onError: reportMutationError('Save notification settings'),
  });
  const enableDevice = useMutation({
    mutationFn: async () => {
      const key = statusQ.data?.push?.publicKey;
      if (!key) throw new Error('The server has not provided a push key yet');
      const sub = await subscribePush(key);
      await savePushSubscription(user.id, sub);
      return sub.endpoint;
    },
    onSuccess: (endpoint) => { setThisDevice(endpoint); queryClient.invalidateQueries({ queryKey: ['push-subscriptions', user.id] }); if (!prefs.push) save.mutate({ ...prefs, push: true }); toast.success('This device will get push notifications'); },
    onError: reportMutationError('Enable push'),
  });
  const disableDevice = useMutation({
    mutationFn: async () => { const endpoint = await unsubscribePush(); if (endpoint) await removePushSubscription(endpoint); },
    onSuccess: () => { setThisDevice(null); queryClient.invalidateQueries({ queryKey: ['push-subscriptions', user.id] }); toast.success('Push turned off for this device'); },
    onError: reportMutationError('Disable push'),
  });
  const forget = useMutation({
    mutationFn: (/** @type {string} */ endpoint) => removePushSubscription(endpoint),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['push-subscriptions', user.id] }),
    onError: reportMutationError('Remove device'),
  });

  const toggle = (id, on) => save.mutate({ ...prefs, [id]: on });
  const ctx = { status: statusQ.data ?? null, pushSupported: supported, permission: notificationPermission(), phone: user?.phone || null };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</CardTitle>
        <CardDescription>Only for things that matter on the day: an offer to you, a change to your packet, an open shift you qualify for, and replies to the coordinator. Never announcements. The bell in the app always shows them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CHANNELS.map(ch => {
          const avail = channelAvailability(ch.id, ctx);
          return (
            <div key={ch.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">{ch.label}</p>
                <p className="text-xs text-muted-foreground">{ch.hint}</p>
                {!avail.ok && <p className="text-xs text-warning">{avail.reason}</p>}
              </div>
              <Switch checked={prefs[ch.id] && (ch.id !== 'push' || avail.ok)} onCheckedChange={(v) => toggle(ch.id, v)} disabled={!avail.ok || save.isPending || isOfflineSession} aria-label={ch.label} />
            </div>
          );
        })}

        <div className="rounded-md border p-3">
          <p className="flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4" /> Devices receiving push</p>
          {supported ? (
            thisDevice
              ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="inline-flex items-center gap-1 text-success"><BellRing className="h-4 w-4" /> This device is registered.</span><Button size="sm" variant="outline" onClick={() => disableDevice.mutate()} loading={disableDevice.isPending}>Turn off here</Button></div>
              : <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">This device is not registered.</span><Button size="sm" onClick={() => enableDevice.mutate()} loading={enableDevice.isPending} disabled={!channelAvailability('push', ctx).ok || isOfflineSession}><BellRing /> Enable on this device</Button></div>
          ) : <p className="mt-1 text-xs text-muted-foreground">Push is not available in this app. Open emcommplanner.org in your phone's browser and add it to the home screen to get push there.</p>}
          {(devicesQ.data ?? []).length > 0 && (
            <ul className="mt-2 divide-y text-xs">
              {(devicesQ.data ?? []).map(d => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="truncate text-muted-foreground">{describeAgent(d.user_agent)}{d.endpoint === thisDevice ? ' (this device)' : ''} · added {formatDateTime(d.created_at, 'MMM d')}{d.last_used_at ? `, last push ${formatDateTime(d.last_used_at, 'MMM d HH:mm')}` : ''}</span>
                  <Button size="icon-sm" variant="ghost" aria-label="Forget device" onClick={() => forget.mutate(d.endpoint)}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function describeAgent(ua) {
  if (!ua) return 'Device';
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows browser';
  if (/Macintosh/.test(ua)) return 'Mac browser';
  return 'Browser';
}
