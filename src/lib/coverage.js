/**
 * Coverage log (design doc 9.12): real radio path attempts recorded during
 * nets, drills and events. Over time they become the group's empirical
 * coverage map, which beats any propagation prediction. Pure helpers.
 */

export const COVERAGE_RESULTS = Object.freeze({
  direct: { label: 'Direct', short: 'OK', tone: 'success', color: '#16a34a' },
  relay: { label: 'Via relay', short: 'Relay', tone: 'warning', color: '#d97706' },
  fail: { label: 'No contact', short: 'Fail', tone: 'critical', color: '#dc2626' },
});

/** Frequency + name in one short string. */
export function pathLabel(entry) {
  const f = entry.frequency_mhz != null && entry.frequency_mhz !== '' ? `${Number(entry.frequency_mhz).toFixed(3)}` : null;
  return [entry.channel_name, f].filter(Boolean).join(' ') || 'unknown channel';
}

/**
 * Counts, plus a per-channel breakdown sorted worst first.
 * @param {Object[]} entries
 */
export function coverageSummary(entries) {
  const s = { total: entries.length, direct: 0, relay: 0, fail: 0, byChannel: /** @type {Array<{ label: string, direct: number, relay: number, fail: number, total: number }>} */ ([]) };
  const map = new Map();
  for (const e of entries) {
    if (e.result in s) s[e.result] += 1;
    const label = pathLabel(e);
    const row = map.get(label) || { label, direct: 0, relay: 0, fail: 0, total: 0 };
    row[e.result] = (row[e.result] || 0) + 1;
    row.total += 1;
    map.set(label, row);
  }
  s.byChannel = [...map.values()].sort((a, b) => (b.fail / b.total) - (a.fail / a.total) || b.total - a.total);
  return s;
}

/**
 * Lines (or points when only one end is known) as GeoJSON for the map,
 * coloured by result. Coordinates fall back to the linked sites.
 * @param {Object[]} entries
 * @param {Map<string, { lat?: number|null, lon?: number|null, address?: string|null }>} sitesById
 * @param {(site: Object) => [number, number]|null} [coordsOf] lat/lon resolver for a site
 */
export function coverageGeoJson(entries, sitesById = new Map(), coordsOf = defaultCoords) {
  const features = [];
  for (const e of entries) {
    const from = point(e.from_lat, e.from_lon) || (e.from_site_id ? coordsOf(sitesById.get(e.from_site_id)) : null);
    const to = point(e.to_lat, e.to_lon) || (e.to_site_id ? coordsOf(sitesById.get(e.to_site_id)) : null);
    const props = { result: e.result, color: COVERAGE_RESULTS[e.result]?.color || '#4b5563', name: `${pathLabel(e)}: ${COVERAGE_RESULTS[e.result]?.label || e.result}${e.power_w ? ` · ${e.power_w} W` : ''}${e.antenna ? ` · ${e.antenna}` : ''}`, id: e.id };
    if (from && to) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[from[1], from[0]], [to[1], to[0]]] }, properties: props });
    else if (from || to) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [(from || to)[1], (from || to)[0]] }, properties: props });
  }
  return { type: 'FeatureCollection', features };
}

function point(lat, lon) {
  return lat != null && lon != null && lat !== '' && lon !== '' ? /** @type {[number, number]} */ ([Number(lat), Number(lon)]) : null;
}

/** @returns {[number, number]|null} */
function defaultCoords(site) {
  if (!site) return null;
  if (site.lat != null && site.lon != null) return [Number(site.lat), Number(site.lon)];
  const m = String(site.address || '').match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

/** Filter helpers for the map page. */
export function filterCoverage(entries, { result = 'all', channel = 'all', deploymentId = null } = {}) {
  return entries.filter(e => (result === 'all' || e.result === result) && (channel === 'all' || pathLabel(e) === channel) && (!deploymentId || e.deployment_id === deploymentId));
}

/** CSV for the coordinator who wants the raw attempts. */
export function coverageCsv(entries, usersById = new Map(), sitesById = new Map()) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const name = (id, label) => label || (id && sitesById.get(id)?.name) || '';
  const lines = [['When', 'From', 'To', 'Channel', 'MHz', 'Mode', 'Power W', 'Antenna', 'Result', 'Reported by', 'Notes'].join(',')];
  for (const e of entries) {
    lines.push([e.occurred_at, name(e.from_site_id, e.from_label), name(e.to_site_id, e.to_label), e.channel_name, e.frequency_mhz, e.mode, e.power_w, e.antenna, e.result, usersById.get(e.reported_by)?.call_sign || '', e.notes].map(esc).join(','));
  }
  return lines.join('\n');
}
