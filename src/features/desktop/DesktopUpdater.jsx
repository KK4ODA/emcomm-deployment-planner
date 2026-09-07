import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/common/ProgressBar';
import { isDesktopApp } from '@/lib/platform';
import { checkForUpdate, downloadAndInstall, relaunchApp, snoozeUpdate, isSnoozed } from '@/lib/desktopUpdater';

const STARTUP_DELAY_MS = 8_000;
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const MANUAL_CHECK_EVENT = 'emcomm:check-updates';

/**
 * Ask the mounted updater banner to check now, ignoring any snooze. Used by
 * the "Check for updates" button on the About tab.
 * @returns {Promise<'available'|'none'>}
 */
export function requestUpdateCheck() {
  if (!isDesktopApp()) return Promise.resolve('none');
  return new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent(MANUAL_CHECK_EVENT, { detail: { resolve, reject } }));
  });
}

/**
 * Desktop (Tauri) only. Checks GitHub Releases through the Tauri updater
 * plugin, which verifies the download signature before anything runs.
 * The user can install now or defer; a deferred update is offered again
 * after the snooze period or at the next launch.
 */
export function DesktopUpdater() {
  if (!isDesktopApp()) return null;
  return <UpdaterBanner />;
}

function UpdaterBanner() {
  const [update, setUpdate] = useState(null);
  const [phase, setPhase] = useState(/** @type {'idle'|'downloading'|'ready'|'error'} */ ('idle'));
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const found = await checkForUpdate();
        if (!cancelled && found && !isSnoozed(found.version)) setUpdate(found);
      } catch (err) {
        // Offline or GitHub unreachable: stay quiet, try again later.
        console.info('Update check skipped:', err?.message || err);
      }
    };
    const manual = async (/** @type {Event} */ e) => {
      const { resolve, reject } = /** @type {CustomEvent} */ (e).detail || {};
      try {
        const found = await checkForUpdate();
        if (cancelled) return;
        if (found) setUpdate(found);
        resolve?.(found ? 'available' : 'none');
      } catch (err) {
        reject?.(err);
      }
    };
    const first = setTimeout(check, STARTUP_DELAY_MS);
    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    window.addEventListener(MANUAL_CHECK_EVENT, manual);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
      window.removeEventListener(MANUAL_CHECK_EVENT, manual);
    };
  }, []);

  if (!update) return null;

  const install = async () => {
    setPhase('downloading');
    setError('');
    try {
      await downloadAndInstall(update, (downloaded, total) => setProgress({ downloaded, total }));
      setPhase('ready');
    } catch (err) {
      setPhase('error');
      setError(err?.message || 'The update could not be downloaded or verified.');
    }
  };

  const later = () => {
    snoozeUpdate(update.version);
    setUpdate(null);
    toast.message('Update postponed', { description: 'You will be reminded again later.' });
  };

  const pct = progress.total ? Math.round((progress.downloaded / progress.total) * 100) : null;

  return (
    <div role="status" className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border bg-card p-4 text-sm shadow-xl">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-accent/10 p-2 text-accent"><Download className="h-4 w-4" aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Version {update.version} is available</p>
          <p className="text-xs text-muted-foreground">You are running {import.meta.env.VITE_APP_VERSION}.{update.body ? '' : ' Install now or postpone.'}</p>
          {update.body && <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{update.body}</p>}

          {phase === 'downloading' && (
            <div className="mt-2 space-y-1">
              <ProgressBar value={pct ?? 0} tone="accent" label="Download progress" />
              <p className="text-xs text-muted-foreground">{pct === null ? 'Downloading…' : `Downloading ${pct}%`}</p>
            </div>
          )}
          {phase === 'error' && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
          {phase === 'ready' && <p className="mt-2 text-xs text-success">Installed. Restart to finish updating.</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            {phase === 'ready' ? (
              <Button size="sm" onClick={() => relaunchApp()}><RefreshCw /> Restart now</Button>
            ) : (
              <Button size="sm" onClick={install} loading={phase === 'downloading'}>
                <Download /> {phase === 'error' ? 'Try again' : 'Install update'}
              </Button>
            )}
            {phase !== 'downloading' && <Button size="sm" variant="ghost" onClick={later}>Later</Button>}
          </div>
        </div>
        {phase !== 'downloading' && (
          <button type="button" onClick={later} aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        )}
      </div>
    </div>
  );
}
