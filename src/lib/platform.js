/** True when running inside the Tauri desktop shell. */
export function isDesktopApp() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Open a URL in the system browser. Inside the desktop shell new windows are
 * blocked, so the opener plugin hands the URL to the OS instead.
 */
export async function openExternal(url) {
  if (isDesktopApp()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error(`Could not open the link: ${err?.message || err}`);
    }
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Best-effort platform label for diagnostics. */
export function platformLabel() {
  if (isDesktopApp()) return 'desktop';
  if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) return 'pwa';
  return 'web';
}
