/** True when running inside the Tauri desktop shell. */
export function isDesktopApp() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Best-effort platform label for diagnostics. */
export function platformLabel() {
  if (isDesktopApp()) return 'desktop';
  if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) return 'pwa';
  return 'web';
}
