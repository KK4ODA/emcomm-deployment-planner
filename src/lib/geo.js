/**
 * KML, GPX and GeoJSON in; GeoJSON FeatureCollection out. No dependencies:
 * the browser's DOMParser handles the XML. Enough for what served agencies
 * hand over: a course route, a boundary, mile markers and aid stations.
 */

export const LAYER_COLORS = Object.freeze(['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563']);

/** Pick a parser from the file name or the content. */
export function parseGeoFile(text, filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const head = text.slice(0, 2000);
  if (ext === 'gpx' || /<gpx[\s>]/i.test(head)) return parseGpx(text);
  if (ext === 'kml' || /<kml[\s>]/i.test(head)) return parseKml(text);
  if (ext === 'json' || ext === 'geojson' || /^\s*\{/.test(text)) return normalizeGeoJson(JSON.parse(text));
  throw new Error('Not a KML, GPX or GeoJSON file');
}

function xml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The file is not well-formed XML');
  return doc;
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const textOf = (el, tag) => {
  const child = el ? Array.from(el.children).find(c => c.localName === tag) : null;
  return child ? child.textContent.trim() : '';
};

/** KML "lon,lat[,alt] lon,lat[,alt] ..." → [[lng, lat], ...] */
function kmlCoords(text) {
  return String(text).trim().split(/\s+/).map(t => t.split(',').map(num)).filter(c => c.length >= 2 && c[0] != null && c[1] != null && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180).map(c => [c[0], c[1]]);
}

/** KML colours are aabbggrr; return #rrggbb or null. */
export function kmlColorToCss(v) {
  const m = String(v || '').trim().match(/^([0-9a-f]{2})?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return `#${m[4]}${m[3]}${m[2]}`.toLowerCase();
}

function kmlGeometry(el) {
  const out = [];
  for (const g of Array.from(el.children)) {
    switch (g.localName) {
      case 'Point': { const c = kmlCoords(textOf(g, 'coordinates')); if (c[0]) out.push({ type: 'Point', coordinates: c[0] }); break; }
      case 'LineString': { const c = kmlCoords(textOf(g, 'coordinates')); if (c.length > 1) out.push({ type: 'LineString', coordinates: c }); break; }
      case 'LinearRing': { const c = kmlCoords(textOf(g, 'coordinates')); if (c.length > 2) out.push({ type: 'Polygon', coordinates: [c] }); break; }
      case 'Polygon': {
        const outer = Array.from(g.getElementsByTagName('outerBoundaryIs'))[0];
        const ring = outer ? kmlCoords(textOf(Array.from(outer.children).find(c => c.localName === 'LinearRing'), 'coordinates')) : [];
        if (ring.length > 2) out.push({ type: 'Polygon', coordinates: [ring] });
        break;
      }
      case 'MultiGeometry': out.push(...kmlGeometry(g)); break;
      case 'Track': case 'gx:Track': {
        const coords = Array.from(g.children).filter(c => c.localName === 'coord').map(c => c.textContent.trim().split(/\s+/).map(num)).filter(c => c[0] != null && c[1] != null).map(c => [c[0], c[1]]);
        if (coords.length > 1) out.push({ type: 'LineString', coordinates: coords });
        break;
      }
      default: break;
    }
  }
  return out;
}

/** @returns {{ type: 'FeatureCollection', features: Object[] }} */
export function parseKml(text) {
  const doc = xml(text);
  const styles = new Map();
  for (const s of Array.from(doc.getElementsByTagName('Style'))) {
    const id = s.getAttribute('id');
    const line = Array.from(s.children).find(c => c.localName === 'LineStyle');
    const poly = Array.from(s.children).find(c => c.localName === 'PolyStyle');
    const color = kmlColorToCss(textOf(line, 'color')) || kmlColorToCss(textOf(poly, 'color'));
    if (id && color) styles.set(`#${id}`, color);
  }
  const features = [];
  for (const pm of Array.from(doc.getElementsByTagName('Placemark'))) {
    const name = textOf(pm, 'name');
    const description = textOf(pm, 'description');
    const styleUrl = textOf(pm, 'styleUrl');
    const inline = Array.from(pm.children).find(c => c.localName === 'Style');
    const inlineColor = inline ? (kmlColorToCss(textOf(Array.from(inline.children).find(c => c.localName === 'LineStyle'), 'color')) || kmlColorToCss(textOf(Array.from(inline.children).find(c => c.localName === 'PolyStyle'), 'color'))) : null;
    const color = inlineColor || styles.get(styleUrl) || null;
    for (const geometry of kmlGeometry(pm)) {
      features.push({ type: 'Feature', geometry, properties: { name: name || null, description: description || null, ...(color ? { color } : {}) } });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** @returns {{ type: 'FeatureCollection', features: Object[] }} */
export function parseGpx(text) {
  const doc = xml(text);
  const features = [];
  const point = (el) => { const lat = num(el.getAttribute('lat')), lon = num(el.getAttribute('lon')); return lat != null && lon != null ? [lon, lat] : null; };
  for (const w of Array.from(doc.getElementsByTagName('wpt'))) {
    const c = point(w);
    if (c) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { name: textOf(w, 'name') || null, description: textOf(w, 'desc') || textOf(w, 'cmt') || null } });
  }
  for (const t of Array.from(doc.getElementsByTagName('trk'))) {
    const segs = Array.from(t.getElementsByTagName('trkseg')).map(seg => Array.from(seg.getElementsByTagName('trkpt')).map(point).filter(Boolean)).filter(s => s.length > 1);
    if (!segs.length) continue;
    const geometry = segs.length === 1 ? { type: 'LineString', coordinates: segs[0] } : { type: 'MultiLineString', coordinates: segs };
    features.push({ type: 'Feature', geometry, properties: { name: textOf(t, 'name') || null, description: textOf(t, 'desc') || null } });
  }
  for (const r of Array.from(doc.getElementsByTagName('rte'))) {
    const coords = Array.from(r.getElementsByTagName('rtept')).map(point).filter(Boolean);
    if (coords.length > 1) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { name: textOf(r, 'name') || null, description: textOf(r, 'desc') || null } });
  }
  return { type: 'FeatureCollection', features };
}

/** Accept a FeatureCollection, a Feature or a bare geometry. */
export function normalizeGeoJson(json) {
  if (!json || typeof json !== 'object') throw new Error('Not GeoJSON');
  if (json.type === 'FeatureCollection') return { type: 'FeatureCollection', features: (json.features || []).filter(f => f?.geometry).map(f => ({ ...f, properties: f.properties || {} })) };
  if (json.type === 'Feature') return { type: 'FeatureCollection', features: json.geometry ? [{ ...json, properties: json.properties || {} }] : [] };
  if (json.type && json.coordinates) return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: json, properties: {} }] };
  throw new Error('Not GeoJSON');
}

function eachPosition(geometry, fn) {
  if (!geometry) return;
  const { type, coordinates } = geometry;
  if (type === 'Point') fn(coordinates);
  else if (type === 'MultiPoint' || type === 'LineString') coordinates.forEach(fn);
  else if (type === 'MultiLineString' || type === 'Polygon') coordinates.forEach(r => r.forEach(fn));
  else if (type === 'MultiPolygon') coordinates.forEach(p => p.forEach(r => r.forEach(fn)));
  else if (type === 'GeometryCollection') (geometry.geometries || []).forEach(g => eachPosition(g, fn));
}

/** @returns {{ points: number, lines: number, polygons: number, features: number, kind: 'route'|'area'|'points'|'mixed' }} */
export function layerSummary(fc) {
  let points = 0, lines = 0, polygons = 0;
  for (const f of fc.features || []) {
    const t = f.geometry?.type;
    if (t === 'Point' || t === 'MultiPoint') points += 1;
    else if (t === 'LineString' || t === 'MultiLineString') lines += 1;
    else if (t === 'Polygon' || t === 'MultiPolygon') polygons += 1;
  }
  const kinds = [points && 'points', lines && 'route', polygons && 'area'].filter(Boolean);
  const kind = /** @type {'route'|'area'|'points'|'mixed'} */ (kinds.length === 1 ? kinds[0] : kinds.length === 0 ? 'points' : (lines ? 'route' : 'mixed'));
  return { points, lines, polygons, features: (fc.features || []).length, kind };
}

/** Leaflet-style bounds [[south, west], [north, east]] or null when empty. */
export function layerBounds(fc) {
  let s = 90, w = 180, n = -90, e = -180, any = false;
  for (const f of fc.features || []) eachPosition(f.geometry, ([lng, lat]) => { any = true; if (lat < s) s = lat; if (lat > n) n = lat; if (lng < w) w = lng; if (lng > e) e = lng; });
  return any ? /** @type {[[number, number], [number, number]]} */ ([[s, w], [n, e]]) : null;
}

/** Union of several bounds. */
export function unionBounds(list) {
  const valid = list.filter(Boolean);
  if (!valid.length) return null;
  return /** @type {[[number, number], [number, number]]} */ ([
    [Math.min(...valid.map(b => b[0][0])), Math.min(...valid.map(b => b[0][1]))],
    [Math.max(...valid.map(b => b[1][0])), Math.max(...valid.map(b => b[1][1]))],
  ]);
}

/** Point features as site candidates. */
export function waypointsOf(fc) {
  const out = [];
  for (const f of fc.features || []) {
    if (f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    out.push({ name: f.properties?.name || `Waypoint ${out.length + 1}`, description: f.properties?.description || null, lat, lon });
  }
  return out;
}

/** Rough length of all line features in km (haversine). */
export function routeLengthKm(fc) {
  const R = 6371;
  const d = (a, b) => {
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  let km = 0;
  const line = (coords) => { for (let i = 1; i < coords.length; i++) km += d(coords[i - 1], coords[i]); };
  for (const f of fc.features || []) {
    const g = f.geometry;
    if (g?.type === 'LineString') line(g.coordinates);
    else if (g?.type === 'MultiLineString') g.coordinates.forEach(line);
  }
  return Math.round(km * 10) / 10;
}
