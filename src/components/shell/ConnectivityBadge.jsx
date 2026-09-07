import React from 'react';
import { Wifi, WifiOff, CloudUpload, RefreshCw } from 'lucide-react';
import { useOffline } from '@/contexts/OfflineContext';
import { useAuth } from '@/lib/AuthContext';
import { Hint } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Always-visible connectivity indicator. Green when the backend is
 * reachable, amber when working from local data, with the number of queued
 * changes waiting to sync.
 */
/** @param {{ className?: string }} [props] */
export function ConnectivityBadge({ className } = {}) {
  const { isOnline, pendingCount, syncNow } = useOffline();
  const { isOfflineSession } = useAuth();
  const [busy, setBusy] = React.useState(false);

  const handleSync = async () => {
    setBusy(true);
    try { await syncNow(); } finally { setBusy(false); }
  };

  const label = isOnline
    ? (pendingCount > 0 ? `Online · ${pendingCount} change${pendingCount === 1 ? '' : 's'} syncing` : 'Online · connected to server')
    : `Offline · working from local data${pendingCount > 0 ? ` · ${pendingCount} change${pendingCount === 1 ? '' : 's'} queued` : ''}${isOfflineSession ? ' · cached sign-in' : ''}`;

  return (
    <Hint label={label}>
      <button
        type="button"
        onClick={handleSync}
        aria-label={label}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
          isOnline ? 'border-success/30 bg-success/10 text-success' : 'border-warning/40 bg-warning/10 text-warning',
          className,
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', isOnline ? 'bg-success' : 'bg-warning animate-pulse-dot')} aria-hidden />
        {isOnline ? <Wifi className="h-3.5 w-3.5" aria-hidden /> : <WifiOff className="h-3.5 w-3.5" aria-hidden />}
        <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-0.5 tnum">
            {busy ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden /> : <CloudUpload className="h-3 w-3" aria-hidden />}
            {pendingCount}
          </span>
        )}
      </button>
    </Hint>
  );
}
