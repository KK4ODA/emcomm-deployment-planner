/**
 * Operations helpers: the field status ladder, merging pending (offline)
 * intents into the server status, NCS board rows and hour derivation.
 * Pure functions, unit-tested. The database enforces the same rules.
 */
import { occupies } from './staffing';

/** Rank of the field statuses; higher never regresses to lower. */
export const STATUS_RANK = Object.freeze({ offered: 0, accepted: 1, checked_in: 2, on_position: 3, released: 4 });

/** The one or two actions an operator can take from a status, in plain words. */
export function nextActions(status) {
  switch (status) {
    case 'accepted': return [{ status: 'checked_in', label: 'Check in', primary: true }];
    case 'checked_in': return [{ status: 'on_position', label: 'On position', primary: true }, { status: 'released', label: 'Check out', primary: false }];
    case 'on_position': return [{ status: 'released', label: 'Check out', primary: true }];
    default: return [];
  }
}

/**
 * Status the operator sees: server status advanced by any intents still
 * waiting to sync (never regressed).
 * @param {Object} assignment server row
 * @param {Object[]} intents pending intents for this assignment
 */
export function effectiveStatus(assignment, intents = []) {
  let status = assignment.status;
  let rank = STATUS_RANK[status] ?? -1;
  for (const i of intents) {
    if (i.assignment_id !== assignment.id) continue;
    const r = STATUS_RANK[i.status];
    if (r !== undefined && r > rank) { status = i.status; rank = r; }
  }
  return status;
}

/** Timestamp shown for a status, from the row or a pending intent. */
export function statusTime(assignment, status, intents = []) {
  const col = { accepted: 'accepted_at', checked_in: 'checked_in_at', on_position: 'on_position_at', released: 'released_at' }[status];
  if (col && assignment[col]) return assignment[col];
  const intent = intents.find(i => i.assignment_id === assignment.id && i.status === status);
  return intent?.at ?? null;
}

/** Plain-language confirmation after a status change. */
export function confirmationText(status, at, online) {
  const when = at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const verb = { checked_in: 'Checked in', on_position: 'On position', released: 'Checked out' }[status] || 'Saved';
  return online ? `${verb} at ${when}. Net control has been notified.` : `${verb} at ${when}. Saved on this device; net control will be notified when you have signal.`;
}

/**
 * Build the NCS board: one row per shift slot that is live now (or in the
 * chosen window), operators with their status and times, uncovered first.
 * @param {{ positions: Object[], shifts: Object[], assignments: Object[], usersById: Map<string, Object>, intents?: Object[], now?: Date, windowHours?: number, net?: string|null }} args
 */
export function buildNcsBoard({ positions, shifts, assignments, usersById, intents = [], now = new Date(), windowHours = 2, net = null }) {
  const t = now.getTime();
  const pad = windowHours * 3_600_000;
  const positionById = new Map(positions.map(p => [p.id, p]));
  const rows = [];
  for (const shift of shifts) {
    const position = positionById.get(shift.position_id);
    if (!position) continue;
    if (net && (position.net || '').toLowerCase() !== net.toLowerCase()) continue;
    const start = new Date(shift.starts_at).getTime(), end = new Date(shift.ends_at).getTime();
    if (end + pad < t || start - pad > t) continue;
    const people = assignments
      .filter(a => a.shift_id === shift.id && occupies(a.status))
      .map(a => {
        const status = effectiveStatus(a, intents);
        return { assignment: a, user: usersById.get(a.user_id) || null, status, time: statusTime(a, status, intents), pending: status !== a.status };
      });
    const headcount = shift.headcount ?? position.headcount ?? 1;
    const onStation = people.filter(p => p.status === 'on_position').length;
    const checkedIn = people.filter(p => p.status === 'checked_in').length;
    const released = people.filter(p => p.status === 'released').length;
    const expected = people.filter(p => ['accepted', 'offered'].includes(p.status)).length;
    let state = 'uncovered';
    if (onStation >= headcount) state = 'on_station';
    else if (onStation + checkedIn > 0) state = 'partial';
    else if (people.length > 0 && released === people.length) state = 'released';
    else if (people.length > 0) state = start <= t ? 'missing' : 'expected';
    rows.push({ position, shift, people, headcount, onStation, checkedIn, expected, released, state, live: start <= t && t < end });
  }
  const order = { missing: 0, uncovered: 1, partial: 2, expected: 3, on_station: 4, released: 5 };
  rows.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || new Date(a.shift.starts_at).getTime() - new Date(b.shift.starts_at).getTime() || a.position.name.localeCompare(b.position.name));
  return rows;
}

export const NCS_STATE = Object.freeze({
  missing: { label: 'Not checked in', tone: 'critical' },
  uncovered: { label: 'Nobody assigned', tone: 'critical' },
  partial: { label: 'Arriving', tone: 'warning' },
  expected: { label: 'Expected', tone: 'neutral' },
  on_station: { label: 'On station', tone: 'success' },
  released: { label: 'Released', tone: 'muted' },
});

/** Summary counts for the NCS header. */
export function ncsSummary(rows) {
  const s = { positions: rows.length, onStation: 0, missing: 0, uncovered: 0, arriving: 0, released: 0 };
  for (const r of rows) {
    if (r.state === 'on_station') s.onStation += 1;
    else if (r.state === 'missing') s.missing += 1;
    else if (r.state === 'uncovered') s.uncovered += 1;
    else if (r.state === 'partial') s.arriving += 1;
    else if (r.state === 'released') s.released += 1;
  }
  return s;
}

/**
 * Hours for an assignment, mirroring derive_hours_for_assignment in SQL.
 * @returns {{ hours: number, estimated: boolean }}
 */
export function deriveHours(assignment, shift) {
  const start = new Date(assignment.checked_in_at || shift.starts_at).getTime();
  let end = new Date(assignment.released_at || shift.ends_at).getTime();
  let estimated = !assignment.checked_in_at || !assignment.released_at;
  if (end <= start) { end = new Date(shift.ends_at).getTime(); estimated = true; }
  let hours = Math.round(((end - start) / 3_600_000) * 100) / 100;
  if (hours < 0) hours = 0;
  if (hours > 48) { hours = 48; estimated = true; }
  return { hours, estimated };
}

export const ACTIVITY_TYPES = Object.freeze({
  emergency: 'Emergency operations',
  public_service: 'Public service event',
  training: 'Training / drill',
  net: 'Net',
  admin: 'Administration / planning',
  maintenance: 'Station maintenance',
});

/** Group hour entries by month (YYYY-MM) with totals per activity type. */
export function hoursByMonth(entries) {
  const months = new Map();
  for (const e of entries) {
    const key = String(e.occurred_on).slice(0, 7);
    if (!months.has(key)) months.set(key, { month: key, total: 0, byType: {}, entries: [] });
    const m = months.get(key);
    const h = Number(e.hours) || 0;
    m.total = Math.round((m.total + h) * 100) / 100;
    m.byType[e.activity_type] = Math.round(((m.byType[e.activity_type] || 0) + h) * 100) / 100;
    m.entries.push(e);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** CSV of hour entries (for the monthly report). */
export function hoursCsv(entries, usersById = new Map()) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = ['Date,Call sign,Name,Activity,Hours,Estimated,Source,Description'];
  for (const e of [...entries].sort((a, b) => String(a.occurred_on).localeCompare(String(b.occurred_on)))) {
    const u = usersById.get(e.user_id);
    lines.push([e.occurred_on, u?.call_sign || '', u?.full_name || '', ACTIVITY_TYPES[e.activity_type] || e.activity_type, e.hours, e.estimated ? 'yes' : '', e.source, e.description].map(esc).join(','));
  }
  return `${lines.join('\n')}\n`;
}
