import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDesktopApp } from '@/lib/platform';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Web/PWA only: shows a small banner when a new build has been installed by
 * the service worker. The desktop app uses its own updater instead.
 */
export function UpdatePrompt() {
  if (isDesktopApp()) return null;
  return <WebUpdatePrompt />;
}

function WebUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update(), CHECK_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-sm shadow-xl">
      <RefreshCw className="h-4 w-4 text-success" aria-hidden />
      <span>A new version is ready.</span>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>Reload</Button>
      <button type="button" onClick={() => setNeedRefresh(false)} aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
