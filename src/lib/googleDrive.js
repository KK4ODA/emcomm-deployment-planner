/**
 * Post a CSV to the planner's own Google Drive as a Google Sheet, and update
 * it in place later. Uses Google Identity Services in the browser with the
 * narrow drive.file scope (the app only ever sees files it created), so no
 * server, no stored refresh token, and the sheet lives in the planner's
 * Drive under their control. Needs a public OAuth client id at build time
 * (VITE_GOOGLE_CLIENT_ID; see docs/GOOGLE_DRIVE.md). Google blocks its sign-in
 * inside embedded webviews, so the desktop app points people at the web app.
 */
import { isDesktopApp } from './platform';

export const DRIVE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** 'ok' | 'desktop' | 'unconfigured' */
export function driveAvailability() {
  if (!DRIVE_CLIENT_ID) return 'unconfigured';
  if (isDesktopApp()) return 'desktop';
  return 'ok';
}

let cached = { token: /** @type {string|null} */ (null), expiresAt: 0 };

async function loadGis() {
  const w = /** @type {any} */ (window);
  if (w.google?.accounts?.oauth2) return;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) { existing.addEventListener('load', () => resolve(undefined)); existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in'))); return; }
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve(undefined);
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
  if (!w.google?.accounts?.oauth2) throw new Error('Google sign-in did not initialise');
}

/** An access token for drive.file, asking the person to sign in when needed. */
export async function getDriveToken() {
  if (cached.token && Date.now() < cached.expiresAt - 60_000) return cached.token;
  await loadGis();
  const w = /** @type {any} */ (window);
  return new Promise((resolve, reject) => {
    const client = w.google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r?.error) { reject(new Error(r.error_description || r.error)); return; }
        cached = { token: r.access_token, expiresAt: Date.now() + Number(r.expires_in || 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e?.message || 'Google sign-in was closed')),
    });
    client.requestAccessToken({ prompt: cached.token ? '' : 'consent' });
  });
}

async function driveFetch(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Google Drive ${res.status}: ${text.slice(0, 160) || res.statusText}`);
    /** @type {any} */ (err).status = res.status;
    throw err;
  }
  return res;
}

/**
 * Create or replace a Google Sheet from CSV. Pass `fileId` to update the same
 * sheet (its link stays valid); a deleted file falls back to a fresh one.
 * @returns {Promise<{ id: string, url: string, created: boolean }>}
 */
export async function uploadCsvAsSheet({ csv, name, fileId = null, shareAnyone = true }) {
  const token = await getDriveToken();
  const boundary = `emcomm-${Date.now().toString(36)}`;
  const metadata = fileId ? { name } : { name, mimeType: 'application/vnd.google-apps.spreadsheet' };
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata),
    `--${boundary}`, 'Content-Type: text/csv; charset=UTF-8', '', csv,
    `--${boundary}--`, '',
  ].join('\r\n');
  const headers = { 'Content-Type': `multipart/related; boundary=${boundary}` };
  const base = 'https://www.googleapis.com/upload/drive/v3/files';
  let res;
  let created = !fileId;
  try {
    res = await driveFetch(token, `${base}${fileId ? `/${fileId}` : ''}?uploadType=multipart&fields=id,webViewLink`, { method: fileId ? 'PATCH' : 'POST', headers, body });
  } catch (err) {
    if (!fileId || /** @type {any} */ (err).status !== 404) throw err;
    created = true;
    res = await driveFetch(token, `${base}?uploadType=multipart&fields=id,webViewLink`, { method: 'POST', headers, body: body.replace(JSON.stringify(metadata), JSON.stringify({ name, mimeType: 'application/vnd.google-apps.spreadsheet' })) });
  }
  const file = await res.json();
  if (created && shareAnyone) {
    await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }).catch(() => { /* the owner can still share by hand */ });
  }
  return { id: file.id, url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}`, created };
}
