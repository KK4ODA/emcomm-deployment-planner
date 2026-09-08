/**
 * APRS through Graywolf: heard stations matched to operators, freshness,
 * distance to the assigned site, and the export of sites as APRS objects
 * in the emcomm-objects (Pinpoint) shape. Pure helpers.
 */

export const baseCall = (cs) => String(cs || '').toUpperCase().trim().split('-')[0];

/** Minutes since a fix. */
export function ageMinutes(heardAt, now = new Date()) {
  return Math.max(0, Math.round((now.getTime() - new Date(heardAt).getTime()) / 60_000));
}

/** Age bucket for colours and labels. */
export function ageBucket(minutes) {
  if (minutes <= 10) return { id: 'fresh', label: 'just now', color: '#16a34a' };
  if (minutes <= 60) return { id: 'recent', label: `${minutes} min ago`, color: '#d97706' };
  if (minutes <= 24 * 60) return { id: 'stale', label: `${Math.round(minutes / 60)} h ago`, color: '#6b7280' };
  return { id: 'old', label: `${Math.round(minutes / 1440)} d ago`, color: '#9ca3af' };
}

/** Great-circle distance in metres. */
export function distanceM(a, b) {
  if (!a || !b || a[0] == null || b[0] == null) return null;
  const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Latest fix per operator: match by the profile's APRS call first, then by
 * any SSID of the base call sign (most recent wins).
 * @param {Object[]} latest rows of aprs_positions_latest
 * @param {Object[]} users
 * @returns {Map<string, Object>} userId -> position row
 */
export function positionsByUser(latest, users) {
  const byCall = new Map();
  for (const p of latest) {
    const c = String(p.callsign).toUpperCase();
    byCall.set(c, p);
  }
  const out = new Map();
  for (const u of users) {
    const exact = u.aprs_call_sign ? byCall.get(String(u.aprs_call_sign).toUpperCase()) : null;
    if (exact) { out.set(u.id, exact); continue; }
    const base = baseCall(u.call_sign);
    if (!base) continue;
    const candidates = latest.filter(p => p.base_call === base && !p.is_object);
    if (candidates.length) out.set(u.id, candidates.sort((a, b) => new Date(b.heard_at).getTime() - new Date(a.heard_at).getTime())[0]);
  }
  return out;
}

/** "On site" when within the radius of the assigned site. */
export function nearSite(position, site, radiusM = 300) {
  if (!position || !site || position.lat == null) return null;
  const s = siteCoords(site);
  if (!s) return null;
  const d = distanceM([position.lat, position.lon], s);
  return { distanceM: d, onSite: d <= radiusM };
}

export function siteCoords(site) {
  if (!site) return null;
  if (site.lat != null && site.lon != null) return [Number(site.lat), Number(site.lon)];
  const m = String(site.address || '').match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

/** GeoJSON points for the map, coloured by age; objects drawn differently. */
export function aprsGeoJson(latest, { now = new Date(), maxAgeMinutes = 24 * 60, usersById = new Map(), userByCall = new Map() } = {}) {
  const features = [];
  for (const p of latest) {
    if (p.lat == null || p.lon == null) continue;
    const age = ageMinutes(p.heard_at, now);
    if (age > maxAgeMinutes) continue;
    const bucket = ageBucket(age);
    const u = userByCall.get(String(p.callsign).toUpperCase()) || userByCall.get(p.base_call);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { id: p.id, callsign: p.callsign, color: bucket.color, age, ageLabel: bucket.label, isObject: !!p.is_object, name: `${p.callsign}${u?.full_name ? ` (${u.full_name})` : ''} · ${bucket.label}${p.comment ? ` · ${p.comment}` : ''}`, operator: u ? (usersById.get(u.id)?.call_sign || u.call_sign) : null },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Random bridge token (shown once; only its hash is stored). */
export function newBridgeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'ebt_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Actions the operator can send Graywolf, for the packet and the setup page. */
export const APRS_ACTIONS = Object.freeze([
  { action: 'checkin', label: 'Check in', example: '@@#checkin' },
  { action: 'onpos', label: 'On position', example: '@@#onpos' },
  { action: 'checkout', label: 'Check out', example: '@@#checkout' },
  { action: 'status', label: 'My status', example: '@@#status' },
]);

/** APRS message body limit for outbound notifications. */
export const APRS_MAX_TEXT = 67;
export function aprsText(title, body) {
  const t = `${title || ''}${body ? `: ${body}` : ''}`.replace(/\s+/g, ' ').trim();
  return t.length <= APRS_MAX_TEXT ? t : t.slice(0, APRS_MAX_TEXT - 1) + '~';
}

/** APRS symbol (table, code) for a site type; net control wins. */
export const APRS_SYMBOL_BY_TYPE = Object.freeze({
  eoc: ['/', 'o'], shelter: ['/', 'h'], aid_station: ['/', '+'], water: ['/', 'w'], staging: ['/', 'S'], start: ['/', 'F'], finish: ['/', 'F'],
  net_control: ['/', 'r'], repeater: ['/', 'r'], hospital: ['/', 'h'], command: ['/', 'c'], parking: ['\\', 'P'], other: ['/', '/'],
});

/** A 9-character APRS object name from a tactical call or site name, unique within `used`. */
export function aprsObjectName(name, used = new Set()) {
  const base = String(name || 'SITE').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const words = base.split(' ');
  let n = words.length > 1 ? words.map((w, i) => (i === words.length - 1 && /^\d+$/.test(w) ? w : w.slice(0, Math.max(1, Math.floor(8 / words.length))))).join('') : base;
  n = n.slice(0, 9) || 'SITE';
  let out = n, i = 1;
  while (used.has(out)) { const suffix = String(i++); out = n.slice(0, 9 - suffix.length) + suffix; }
  used.add(out);
  return out;
}

/**
 * The deployment's sites as APRS objects in the emcomm-objects (Pinpoint)
 * shape. Objects start disabled so nothing goes on the air until enabled.
 * @param {{ sites: Object[], positions: Object[], deploymentName: string }} args
 */
export function sitesToAprsObjects({ sites, positions, deploymentName }) {
  const used = new Set();
  const out = [];
  for (const s of sites) {
    const c = siteCoords(s);
    if (!c) continue;
    const here = positions.filter(p => p.site_id === s.id);
    const tac = here.find(p => p.tactical_callsign)?.tactical_callsign;
    const kind = here.some(p => p.position_type === 'net_control') ? 'net_control' : (s.site_type || 'other');
    const [SymbolTable, SymbolID] = APRS_SYMBOL_BY_TYPE[kind] || APRS_SYMBOL_BY_TYPE.other;
    out.push({
      ObjectName: aprsObjectName(tac || s.name, used), Latitude: c[0], Longitude: c[1], SymbolTable, SymbolID,
      Comment: `${s.name}${here.length ? ` ${here.map(p => p.tactical_callsign || p.name).join('/')}` : ''} ${deploymentName}`.slice(0, 43),
      IntervalMinutes: 30, Enabled: false, Path: '',
    });
  }
  return out;
}

export function aprsObjectsCsv(objects) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const header = ['ObjectName', 'Latitude', 'Longitude', 'SymbolTable', 'SymbolID', 'Comment', 'IntervalMinutes', 'Enabled', 'Path'];
  return [header.join(','), ...objects.map(o => header.map(h => esc(o[h])).join(','))].join('\n');
}
