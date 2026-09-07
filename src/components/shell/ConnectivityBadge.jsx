import React from 'react';
import { Wifi, WifiOff, CloudUpload, RefreshCw, AlertTriangle } from 'lucide-react';
import { useOffline } from '@/contexts/OfflineContext';
import { useAuth } from '@/lib/AuthContext';
import { Hint } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { DeadLetterDialog } from './DeadLetterDialog';

/**
 * Always-visible connectivity indicator. Green when the backend is
 * reachable, amber when working from local data, with the number of queued
 * changes waiting to sync. A red count appears when the server refused
 * queued changes; clicking it opens the list to retry or discard.
 */
/** @param {{ className?: string }} [props] */
export function ConnectivityBadge({ className } = {}) {
  const { isOnline, pendingCount, failedCount, syncNow } = useOffline();
  const { isOfflineSession } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [showFailed, setShowFailed] = React.useState(false);

  const handleSync = async () => {
    setBusy(true);
    try { await syncNow(); } finally { setBusy(false); }
  };

  const label = isOnline
    ? (pendingCount > 0 ? `Online · ${pendingCount} change${pendingCount === 1 ? '' : 's'} syncing` : 'Online · connected to server')
    : `Offline · working from local data${pendingCount > 0 ? ` · ${pendingCount} change${pendingCount === 1 ? '' : 's'} queued` : ''}${isOfflineSession ? ' · cached sign-in' : ''}`;
  const failedLabel = `${failedCount} change${failedCount === 1 ? '' : 's'} refused by the server`;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Hint label={label}>
        <button
          type="button"
          onClick={handleSync}
          aria-label={label}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
            isOnline ? 'border-success/30 bg-success/10 text-success' : 'border-warning/40 bg-warning/10 text-warning',
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
      {failedCount > 0 && (
        <Hint label={failedLabel}>
          <button type="button" onClick={() => setShowFailed(true)} aria-label={failedLabel} className="inline-flex h-8 items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> <span className="tnum">{failedCount}</span>
          </button>
        </Hint>
      )}
      <DeadLetterDialog open={showFailed} onClose={() => setShowFailed(false)} />
    </span>
  );
}
