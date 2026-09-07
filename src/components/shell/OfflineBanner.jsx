import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOffline } from '@/contexts/OfflineContext';
import { useAuth } from '@/lib/AuthContext';

/**
 * Thin banner under the top bar when the backend is unreachable. States
 * plainly what still works so operators can keep going with confidence.
 */
export function OfflineBanner() {
  const { isOnline, pendingCount } = useOffline();
  const { isOfflineSession } = useAuth();
  if (isOnline) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-foreground sm:px-5">
      <span className="inline-flex items-center gap-1.5 font-medium text-warning">
        <WifiOff className="h-3.5 w-3.5" aria-hidden /> Offline
      </span>
      <span className="text-muted-foreground">
        Tasks can be created and updated; other data shows the last copy loaded.
        {pendingCount > 0 && ` ${pendingCount} change${pendingCount === 1 ? '' : 's'} will sync when the connection returns.`}
        {isOfflineSession && ' You are signed in from a cached session.'}
      </span>
    </div>
  );
}
