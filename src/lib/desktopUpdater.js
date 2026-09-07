/**
 * Thin wrapper over the Tauri updater plugin so React code has no direct
 * dependency on Tauri modules (they are imported lazily and only exist in
 * the desktop build).
 *
 * Security: the plugin downloads the artifact listed in the release manifest
 * (`latest.json`) and refuses to install it unless its minisign signature
 * matches the public key compiled into tauri.conf.json.
 */

const SNOOZE_KEY = 'emcomm_update_snooze';
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} AvailableUpdate
 * @property {string} version
 * @property {string} [body] release notes
 * @property {string} [date]
 * @property {Object} handle underlying plugin Update object
 */

/** @returns {Promise<AvailableUpdate|null>} */
export async function checkForUpdate() {
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check({ timeout: 15_000 });
  if (!update) return null;
  return { version: update.version, body: update.body, date: update.date, handle: update };
}

/**
 * @param {AvailableUpdate} update
 * @param {(downloaded: number, total: number) => void} [onProgress]
 */
export async function downloadAndInstall(update, onProgress) {
  let downloaded = 0;
  let total = 0;
  await update.handle.downloadAndInstall((event) => {
    if (event.event === 'Started') { total = event.data.contentLength ?? 0; }
    else if (event.event === 'Progress') { downloaded += event.data.chunkLength; }
    onProgress?.(downloaded, total);
  });
}

export async function relaunchApp() {
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

/** Remember that the user postponed this version. */
export function snoozeUpdate(version, now = Date.now()) {
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version, until: now + SNOOZE_MS })); } catch { /* ignore */ }
}

/** True while the snooze for exactly this version is still active. */
export function isSnoozed(version, now = Date.now()) {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const { version: v, until } = JSON.parse(raw);
    return v === version && until > now;
  } catch {
    return false;
  }
}
