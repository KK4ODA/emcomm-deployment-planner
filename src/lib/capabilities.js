/**
 * Controlled vocabularies for operator capabilities and position
 * requirements. Stored as ids in the database; labelled here so the UI and
 * generated documents agree. Plain language for operators, radio-specific
 * where it matters.
 */

/** @typedef {{ id: string, label: string, group: string, short?: string }} VocabEntry */

/** @type {readonly VocabEntry[]} */
export const CAPABILITIES = Object.freeze([
  { id: 'vhf_voice', label: 'VHF/UHF voice (2 m / 70 cm FM)', short: 'VHF voice', group: 'Voice' },
  { id: 'hf_voice', label: 'HF voice (SSB)', short: 'HF voice', group: 'Voice' },
  { id: 'net_control', label: 'Net control experience', short: 'NCS', group: 'Voice' },
  { id: 'winlink_vara_fm', label: 'Winlink over VARA FM / packet', short: 'Winlink FM', group: 'Digital' },
  { id: 'winlink_vara_hf', label: 'Winlink over VARA HF / ARDOP', short: 'Winlink HF', group: 'Digital' },
  { id: 'aprs', label: 'APRS (beacon and messaging)', short: 'APRS', group: 'Digital' },
  { id: 'fldigi', label: 'FLDIGI / NBEMS', short: 'FLDIGI', group: 'Digital' },
  { id: 'dstar', label: 'D-STAR', short: 'D-STAR', group: 'Digital voice' },
  { id: 'fusion', label: 'System Fusion / Wires-X', short: 'Fusion', group: 'Digital voice' },
  { id: 'dmr', label: 'DMR', short: 'DMR', group: 'Digital voice' },
  { id: 'mesh', label: 'AREDN mesh', short: 'Mesh', group: 'Data' },
  { id: 'crossband', label: 'Cross-band repeat', short: 'Cross-band', group: 'Other' },
  { id: 'cw', label: 'CW', short: 'CW', group: 'Other' },
  { id: 'gmrs', label: 'GMRS', short: 'GMRS', group: 'Other' },
]);

/** @type {readonly VocabEntry[]} */
export const STATION_TYPES = Object.freeze([
  { id: 'handheld', label: 'Handheld only (HT)', short: 'HT', group: 'Station' },
  { id: 'mobile', label: 'Mobile (vehicle-mounted radio)', short: 'Mobile', group: 'Station' },
  { id: 'portable', label: 'Portable / field station with antenna and power', short: 'Portable', group: 'Station' },
  { id: 'base', label: 'Home / base station', short: 'Base', group: 'Station' },
  { id: 'bicycle', label: 'Bicycle-mobile', short: 'Bicycle', group: 'Mobility' },
  { id: 'motorcycle', label: 'Motorcycle-mobile', short: 'Motorcycle', group: 'Mobility' },
  { id: 'external_antenna', label: 'External / mag-mount antenna available', short: 'Ext. antenna', group: 'Equipment' },
]);

export const LICENSE_CLASSES = Object.freeze([
  { id: 'technician', label: 'Technician' },
  { id: 'general', label: 'General' },
  { id: 'extra', label: 'Amateur Extra' },
  { id: 'none', label: 'No amateur licence (GMRS / call taker)' },
  { id: 'other', label: 'Other / foreign' },
]);

/** Rank so "general or higher" can be compared. */
export const LICENSE_RANK = Object.freeze({ none: 0, other: 0, technician: 1, general: 2, extra: 3 });

export const POSITION_TYPES = Object.freeze([
  { id: 'aid_station', label: 'Aid / hydration station' },
  { id: 'sag', label: 'SAG vehicle' },
  { id: 'motorcycle', label: 'Motorcycle / bicycle patrol' },
  { id: 'shadow', label: 'Shadow (official escort)' },
  { id: 'sweep', label: 'Sweep / back of pack' },
  { id: 'medical', label: 'Medical tent / liaison' },
  { id: 'net_control', label: 'Net control' },
  { id: 'command', label: 'Command post / EOC' },
  { id: 'relay', label: 'Relay station' },
  { id: 'shelter', label: 'Shelter / hospital' },
  { id: 'station', label: 'Field station' },
  { id: 'liaison', label: 'Agency liaison' },
  { id: 'call_taker', label: 'Call taker (phones)' },
  { id: 'other', label: 'Other' },
]);

/**
 * Requirement kinds a position can express. `value` semantics per kind:
 *   capability   → a CAPABILITIES id
 *   station_type → a STATION_TYPES id
 *   power_hours  → number of hours of independent power (string of a number)
 *   license_class→ minimum LICENSE_CLASSES id
 *   other        → free text, shown to the planner only (never auto-matched)
 */
export const REQUIREMENT_KINDS = Object.freeze([
  { id: 'capability', label: 'Capability' },
  { id: 'station_type', label: 'Station / mobility' },
  { id: 'power_hours', label: 'Independent power (hours)' },
  { id: 'license_class', label: 'Minimum licence class' },
  { id: 'other', label: 'Other (not matched automatically)' },
]);

const byId = (list) => new Map(list.map(e => [e.id, e]));
const CAP = byId(CAPABILITIES);
const STA = byId(STATION_TYPES);
const LIC = byId(LICENSE_CLASSES);
const POS = byId(POSITION_TYPES);

export function capabilityLabel(id, short = false) {
  const e = CAP.get(id);
  return e ? (short && e.short) || e.label : id;
}
export function stationTypeLabel(id, short = false) {
  const e = STA.get(id);
  return e ? (short && e.short) || e.label : id;
}
export function licenseLabel(id) {
  return LIC.get(id)?.label ?? id ?? '';
}
export function positionTypeLabel(id) {
  return POS.get(id)?.label ?? (id ? id.replace(/_/g, ' ') : '');
}

/**
 * Human label for a requirement row.
 * @param {{ kind: string, value: string|number, mandatory?: boolean }} req
 */
export function requirementLabel(req, short = true) {
  switch (req.kind) {
    case 'capability': return capabilityLabel(String(req.value), short);
    case 'station_type': return stationTypeLabel(String(req.value), short);
    case 'power_hours': return `${req.value} h independent power`;
    case 'license_class': return `${licenseLabel(String(req.value))} or higher`;
    default: return String(req.value ?? '');
  }
}

/** Normalise a requirements JSON array from the database. */
export function normalizeRequirements(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(r => r && typeof r === 'object' && r.kind && r.value !== undefined && r.value !== '')
    .map(r => ({ kind: String(r.kind), value: r.value, mandatory: r.mandatory !== false, notes: r.notes || '' }));
}
