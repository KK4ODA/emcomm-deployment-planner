/**
 * Warm the map-tile cache around a site so the packet map works with no
 * signal. The service worker keeps OpenStreetMap tiles it has served
 * (cache "map-tiles"); this asks for the ones an operator will zoom into
 * before they leave home. Pure tile maths is exported for tests.
 */

const SUBDOMAINS = 'abc';

/** Slippy-map tile coordinates for a point at a zoom level. */
export function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/**
 * Tiles around a point: a 3x3 block at the overview zooms and 5x5 close in.
 * About 75 tiles, roughly 1.5 MB, for the default zooms.
 * @returns {Array<{ z: number, x: number, y: number }>}
 */
export function tilesAround(lat, lon, zooms = [12, 13, 14, 15, 16]) {
  const out = [];
  for (const z of zooms) {
    const r = z >= 15 ? 2 : 1;
    const { x, y } = tileXY(lat, lon, z);
    const n = 2 ** z;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= n) continue;
      out.push({ z, x: (x + dx + n) % n, y: ty });
    }
  }
  return out;
}

/** The URL Leaflet would request for this tile (same subdomain rule, so cache keys match). */
export function tileUrl(template, { z, x, y }) {
  const s = SUBDOMAINS[Math.abs(x + y) % SUBDOMAINS.length];
  return template.replace('{s}', s).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

/**
 * Fetch the tiles into the service worker's tile cache. Skips what is already
 * there, tolerates failures, and runs a few requests at a time so a phone on
 * a slow link is not swamped. Returns how many tiles were added.
 * @param {number} lat
 * @param {number} lon
 * @param {{ template?: string, cacheName?: string, zooms?: number[], concurrency?: number }} [options]
 */
export async function prefetchTiles(lat, lon, { template, cacheName = 'map-tiles', zooms, concurrency = 4 } = {}) {
  if (typeof caches === 'undefined' || !template || lat == null || lon == null) return 0;
  let cache;
  try { cache = await caches.open(cacheName); } catch { return 0; }
  const urls = tilesAround(lat, lon, zooms).map(t => tileUrl(template, t));
  let added = 0, i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        if (await cache.match(url)) continue;
        const res = await fetch(url, { mode: 'no-cors', cache: 'force-cache' });
        await cache.put(url, res);
        added += 1;
      } catch { /* offline or blocked: the next visit tries again */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return added;
}

const STAMP_KEY = 'emcomm_tile_prefetch';

/** Once per site per day is plenty; the tiles live 30 days in the cache. */
export function shouldPrefetch(siteId, now = Date.now()) {
  try {
    const stamps = JSON.parse(localStorage.getItem(STAMP_KEY) || '{}');
    if (stamps[siteId] && now - stamps[siteId] < 86_400_000) return false;
    stamps[siteId] = now;
    localStorage.setItem(STAMP_KEY, JSON.stringify(stamps));
  } catch { /* storage unavailable: prefetch anyway */ }
  return true;
}
