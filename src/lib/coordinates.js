const COORD_REGEX = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;

/** Geographic centre of the continental US, used before any site has coordinates. */
export const DEFAULT_MAP_CENTER = /** @type {[number, number]} */ ([39.8283, -98.5795]);

/**
 * Parse "lat, lng" out of a free-form address string.
 * @param {string|null|undefined} text
 * @returns {[number, number]|null}
 */
export function parseCoordinates(text) {
  if (!text) return null;
  const match = String(text).match(COORD_REGEX);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

/** Format a coordinate pair for storage in the address field (~1 m precision). */
export function formatCoordinates([lat, lng]) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Centre and zoom that frame a set of sites.
 * @param {Array<{ coords: [number, number] }>} located
 */
export function frameLocations(located) {
  if (!located.length) return { center: DEFAULT_MAP_CENTER, zoom: 4 };
  const avgLat = located.reduce((s, l) => s + l.coords[0], 0) / located.length;
  const avgLng = located.reduce((s, l) => s + l.coords[1], 0) / located.length;
  return { center: /** @type {[number, number]} */ ([avgLat, avgLng]), zoom: located.length === 1 ? 12 : 9 };
}
