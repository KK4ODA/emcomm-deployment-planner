/**
 * Channel library exchange between groups: a JSON file one group hands to
 * another by email. No shared database, no licensing question; the receiving
 * group decides what to keep. Pure helpers.
 */

export const CHANNEL_LIBRARY_FORMAT = 'emcomm-planner-channels';
export const CHANNEL_LIBRARY_VERSION = 1;

/** Columns that travel; ids, group and timestamps do not. */
const FIELDS = ['name', 'kind', 'rx_freq', 'tx_freq', 'rx_tone', 'tx_tone', 'bandwidth', 'mode', 'digital_mode', 'gateway_callsign', 'tactical_address', 'owner_callsign', 'phone_number', 'timeout_seconds', 'remarks', 'sort_order'];

/**
 * @param {Object[]} channels rows of the group's library
 * @param {{ groupName?: string, exportedBy?: string }} [meta]
 */
export function exportChannelLibrary(channels, { groupName = '', exportedBy = '' } = {}) {
  return {
    format: CHANNEL_LIBRARY_FORMAT,
    version: CHANNEL_LIBRARY_VERSION,
    exported_at: new Date().toISOString(),
    group: groupName || null,
    exported_by: exportedBy || null,
    channels: channels.filter(c => c.active !== false).map(c => Object.fromEntries(FIELDS.map(f => [f, c[f] ?? null]))),
  };
}

const norm = (s) => String(s || '').trim().toLowerCase();
const freqKey = (c) => `${norm(c.name)}|${c.rx_freq != null && c.rx_freq !== '' ? Number(c.rx_freq).toFixed(4) : ''}|${norm(c.phone_number)}`;

/**
 * Parse a library file and decide what is new for this group.
 * @param {string|Object} input JSON text or parsed object
 * @param {Object[]} existing the group's current channels
 * @returns {{ rows: Object[], duplicates: Object[], source: { group: string|null, exported_at: string|null, exported_by: string|null }, error?: string }}
 */
export function importChannelLibrary(input, existing = []) {
  let doc;
  try { doc = typeof input === 'string' ? JSON.parse(input) : input; } catch { return { rows: [], duplicates: [], source: { group: null, exported_at: null, exported_by: null }, error: 'Not a JSON file' }; }
  if (!doc || doc.format !== CHANNEL_LIBRARY_FORMAT || !Array.isArray(doc.channels)) {
    return { rows: [], duplicates: [], source: { group: null, exported_at: null, exported_by: null }, error: 'Not an EmComm Planner channel library file' };
  }
  const have = new Set(existing.map(freqKey));
  const rows = [], duplicates = [];
  const seen = new Set();
  for (const raw of doc.channels) {
    if (!raw || !String(raw.name || '').trim()) continue;
    const c = Object.fromEntries(FIELDS.map(f => [f, raw[f] ?? null]));
    c.name = String(c.name).trim();
    if (c.kind == null) c.kind = c.phone_number ? 'phone' : (c.tx_freq != null && c.rx_freq != null && Number(c.tx_freq) !== Number(c.rx_freq)) ? 'repeater' : 'simplex';
    const k = freqKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    (have.has(k) ? duplicates : rows).push(c);
  }
  return { rows, duplicates, source: { group: doc.group ?? null, exported_at: doc.exported_at ?? null, exported_by: doc.exported_by ?? null } };
}
