import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui/button';
import { RefreshCw } from 'lucide-react';

/**
 * Renders a small "new version available" banner when the service worker
 * has a fresh build queued. Click "Reload" to activate it.
 *
 * Only renders something when there's actually an update.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Check for updates every hour while the app is open
      if (r) setInterval(() => r.update(), 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white rounded-lg shadow-2xl px-4 py-3 flex items-center gap-3 max-w-[90vw]">
      <RefreshCw className="h-4 w-4 text-emerald-400 shrink-0" />
      <span className="text-sm">A new version is available.</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => updateServiceWorker(true)}
        className="h-7 text-xs shrink-0"
      >
        Reload
      </Button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="text-slate-400 hover:text-white text-xs"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
