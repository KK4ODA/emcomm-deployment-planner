/**
 * Row builders for generated ICS forms. Pure; the PDF renderers only draw.
 */
import { occupies } from './staffing';

/**
 * ICS 205A (Communications List): one line per staffed position with the
 * operator's name, call sign and how to reach them.
 * @param {{ positions: Object[], shifts: Object[], assignments: Object[], usersById: Map<string, Object>, periodId?: string|null }} args
 * @returns {Array<{ position: string, tactical: string, name: string, callSign: string, method: string, net: string }>}
 */
export function buildIcs205aRows({ positions, shifts, assignments, usersById, periodId = null }) {
  const positionById = new Map(positions.map(p => [p.id, p]));
  const rows = [];
  for (const shift of shifts) {
    if (periodId && shift.operational_period_id && shift.operational_period_id !== periodId) continue;
    const position = positionById.get(shift.position_id);
    if (!position) continue;
    const people = assignments.filter(a => a.shift_id === shift.id && occupies(a.status));
    if (!people.length) {
      rows.push({ position: position.name, tactical: position.tactical_callsign || '', name: '(unstaffed)', callSign: '', method: '', net: position.net || '', sort: position.sort_order ?? 0 });
      continue;
    }
    for (const a of people) {
      const u = usersById.get(a.user_id);
      rows.push({
        position: position.name,
        tactical: position.tactical_callsign || '',
        name: u?.full_name || '',
        callSign: u?.call_sign || '',
        method: [u?.phone, u?.aprs_call_sign ? `APRS ${u.aprs_call_sign}` : null].filter(Boolean).join(' · '),
        net: position.net || '',
        sort: position.sort_order ?? 0,
      });
    }
  }
  const seen = new Set();
  return rows
    .sort((a, b) => a.sort - b.sort || a.position.localeCompare(b.position) || a.callSign.localeCompare(b.callSign))
    .filter(r => { const k = `${r.position}|${r.callSign}|${r.name}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(({ sort: _s, ...r }) => r);
}

/**
 * ICS 214 (Activity Log) entries: date/time and notable activity, optionally
 * for one person, in chronological order.
 * @param {Object[]} entries activity_log rows
 * @param {{ userId?: string|null, from?: string|null, to?: string|null }} [filter]
 */
export function entriesForIcs214(entries, { userId = null, from = null, to = null } = {}) {
  const f = from ? new Date(from).getTime() : -Infinity;
  const t = to ? new Date(to).getTime() : Infinity;
  return [...entries]
    .filter(e => (!userId || e.user_id === userId) && new Date(e.occurred_at).getTime() >= f && new Date(e.occurred_at).getTime() <= t)
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())
    .map(e => ({ at: e.occurred_at, text: e.summary, kind: e.kind }));
}

/**
 * Group-wide hours rollup for a month: one row per operator with the ARRL
 * Form 2 buckets (emergency, public service, training/net, admin).
 * @param {Object[]} entries hour_entries
 * @param {string} month 'YYYY-MM'
 * @param {Map<string, Object>} usersById
 */
export function hoursRollup(entries, month, usersById) {
  const rows = new Map();
  const totals = { emergency: 0, public_service: 0, training: 0, net: 0, admin: 0, maintenance: 0, total: 0, operators: 0 };
  const round = (n) => Math.round(n * 100) / 100;
  for (const e of entries) {
    if (String(e.occurred_on).slice(0, 7) !== month) continue;
    if (!rows.has(e.user_id)) {
      const u = usersById.get(e.user_id);
      rows.set(e.user_id, { userId: e.user_id, callSign: u?.call_sign || '', name: u?.full_name || u?.email || '', emergency: 0, public_service: 0, training: 0, net: 0, admin: 0, maintenance: 0, total: 0, estimated: 0 });
    }
    const r = rows.get(e.user_id);
    const h = Number(e.hours) || 0;
    const key = totals[e.activity_type] !== undefined ? e.activity_type : 'admin';
    r[key] = round(r[key] + h);
    r.total = round(r.total + h);
    if (e.estimated) r.estimated += 1;
    totals[key] = round(totals[key] + h);
    totals.total = round(totals.total + h);
  }
  totals.operators = rows.size;
  return { rows: [...rows.values()].sort((a, b) => a.callSign.localeCompare(b.callSign) || a.name.localeCompare(b.name)), totals };
}
