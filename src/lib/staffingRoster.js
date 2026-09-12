/**
 * The staffing roster as a flat table: one line per seat, with who holds it
 * and how to reach them. Feeds the CSV export, the Google Sheet and the
 * roster block on every operator's packet.
 */
import { occupies } from './staffing';
import { formatDateTime } from './time';

/**
 * @param {{ positions: Object[], shifts: Object[], assignments: Object[], users: Object[], sites?: Object[], deploymentId: string }} data
 * @returns {Array<{ site: string, position: string, tactical: string, net: string, start: string, end: string, report: string, status: string, callSign: string, name: string, phone: string, open: boolean }>}
 */
export function buildStaffingRoster({ positions, shifts, assignments, users, sites = [], deploymentId }) {
  const siteById = new Map(sites.map(s => [s.id, s]));
  const userById = new Map(users.map(u => [u.id, u]));
  const pos = positions.filter(p => p.deployment_id === deploymentId);
  const order = (p) => [siteById.get(p.site_id)?.sort_order ?? 9999, p.sort_order ?? 0, p.name];
  pos.sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || x[1] - y[1] || String(x[2]).localeCompare(String(y[2])); });
  const rows = [];
  for (const p of pos) {
    const site = siteById.get(p.site_id);
    const pShifts = shifts.filter(s => s.position_id === p.id).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    for (const s of pShifts) {
      const seats = s.headcount ?? p.headcount ?? 1;
      const people = assignments.filter(a => a.shift_id === s.id && occupies(a.status)).map(a => ({ a, u: userById.get(a.user_id) }));
      const base = {
        site: site?.name ?? (p.site_id ? '' : 'Mobile'), position: p.name, tactical: p.tactical_callsign ?? '', net: p.net ?? '',
        start: formatDateTime(s.starts_at, 'EEE HH:mm'), end: formatDateTime(s.ends_at, 'EEE HH:mm'), report: s.muster_at ? formatDateTime(s.muster_at, 'EEE HH:mm') : '',
      };
      for (const { a, u } of people) rows.push({ ...base, status: a.status.replace('_', ' '), callSign: u?.call_sign ?? '', name: u?.full_name ?? '', phone: u?.phone ?? '', open: false });
      for (let i = people.length; i < seats; i++) rows.push({ ...base, status: 'OPEN', callSign: '', name: '', phone: '', open: true });
    }
  }
  return rows;
}

const HEADERS = ['Site', 'Position', 'Tactical call', 'Net', 'Start', 'End', 'Report', 'Status', 'Call sign', 'Name', 'Phone'];
const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** CSV of the roster, in the same column order a spreadsheet user expects. */
export function rosterCsv(rows, { deploymentName = '', generatedAt = new Date() } = {}) {
  const lines = [HEADERS.join(',')];
  for (const r of rows) lines.push([r.site, r.position, r.tactical, r.net, r.start, r.end, r.report, r.status, r.callSign, r.name, r.phone].map(esc).join(','));
  if (deploymentName) lines.push('', esc(`${deploymentName} staffing roster, generated ${formatDateTime(generatedAt)} by EmComm Planner`));
  return lines.join('\n');
}

/** Roster grouped by site for the packet: positions with their people, open seats counted. */
export function rosterBySite(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.site || 'Mobile / as directed';
    if (!groups.has(key)) groups.set(key, new Map());
    const posKey = `${r.position}|${r.tactical}`;
    const g = groups.get(key);
    if (!g.has(posKey)) g.set(posKey, { position: r.position, tactical: r.tactical, people: [], open: 0 });
    const entry = g.get(posKey);
    if (r.open) entry.open += 1; else if (!entry.people.some(x => x.callSign === r.callSign && x.name === r.name)) entry.people.push({ callSign: r.callSign, name: r.name, phone: r.phone });
  }
  return [...groups.entries()].map(([site, m]) => ({ site, positions: [...m.values()] }));
}
