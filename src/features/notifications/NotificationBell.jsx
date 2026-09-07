import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2, AlertCircle, CheckCircle2, Info, PackageX, Radio, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/lib/AuthContext';
import { useNotifications, useRealtimeInvalidation } from '@/hooks/useEntities';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const TYPE_META = {
  task_assigned: { icon: AlertCircle, className: 'text-info' },
  task_status: { icon: CheckCircle2, className: 'text-success' },
  equipment_shortage: { icon: PackageX, className: 'text-destructive' },
  assignment_offered: { icon: Radio, className: 'text-accent' },
  assignment_accepted: { icon: CheckCircle2, className: 'text-success' },
  assignment_declined: { icon: XCircle, className: 'text-destructive' },
  plan_published: { icon: AlertCircle, className: 'text-info' },
  open_shift: { icon: Radio, className: 'text-warning' },
  info: { icon: Info, className: 'text-muted-foreground' },
};

export function NotificationBell() {
  const { user } = useAuth();
  const email = user?.email;
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: notifications = [], isError } = useNotifications(email);
  useRealtimeInvalidation('notifications', queryKeys.notifications(email), !!email);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications(email) });
  const onError = (err) => console.error('Notification update failed:', err);

  const markRead = useMutation({ mutationFn: (/** @type {string} */ id) => db.notifications.update(id, { read: true }), onSuccess: invalidate, onError });
  const markAllRead = useMutation({
    mutationFn: () => Promise.all(notifications.filter(n => !n.read).map(n => db.notifications.update(n.id, { read: true }))),
    onSuccess: invalidate,
    onError,
  });
  const remove = useMutation({ mutationFn: (/** @type {string} */ id) => db.notifications.remove(id), onSuccess: invalidate, onError });

  if (!user) return null;
  const unread = notifications.filter(n => !n.read).length;
  const recent = notifications.slice(0, 15);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground tnum">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(100vw-1.5rem)] max-w-sm p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAllRead.mutate()} loading={markAllRead.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {isError ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Notifications are unavailable offline.</p>
          ) : recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-2 h-8 w-8 opacity-40" aria-hidden />
              No notifications yet
            </div>
          ) : (
            <ul className="divide-y">
              {recent.map(n => {
                const meta = TYPE_META[n.type] || TYPE_META.info;
                const Icon = meta.icon;
                return (
                  <li key={n.id} className={cn('flex gap-3 px-3 py-2.5', !n.read && 'bg-info/5')}>
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.className)} aria-hidden />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => !n.read && markRead.mutate(n.id)}>
                      <p className={cn('text-sm leading-snug', !n.read && 'font-semibold')}>{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/80">{relativeTime(n.created_at)}</p>
                    </button>
                    <button
                      type="button"
                      aria-label="Dismiss notification"
                      onClick={() => remove.mutate(n.id)}
                      className="h-6 w-6 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
