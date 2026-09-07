/**
 * Pure staffing logic: coverage of positions and shifts, whether an operator
 * meets a position's requirements, overlap detection and candidate ranking.
 * No I/O; everything here is unit-tested.
 */
import { LICENSE_RANK, normalizeRequirements } from './capabilities';

/** Statuses that count a slot as covered. */
export const COVERING_STATUSES = Object.freeze(['accepted', 'checked_in', 'on_position', 'released']);
/** Statuses that still occupy a slot but are not confirmed. */
export const PENDING_STATUSES = Object.freeze(['offered']);
/** Statuses that free the slot. */
export const VACATED_STATUSES = Object.freeze(['declined', 'cancelled', 'no_show']);

export const ASSIGNMENT_STATUS = Object.freeze({
  offered: { label: 'Offered', tone: 'warning', rank: 0 },
  accepted: { label: 'Accepted', tone: 'success', rank: 1 },
  declined: { label: 'Declined', tone: 'critical', rank: 1 },
  checked_in: { label: 'Checked in', tone: 'info', rank: 2 },
  on_position: { label: 'On position', tone: 'success', rank: 3 },
  released: { label: 'Released', tone: 'neutral', rank: 4 },
  no_show: { label: 'No show', tone: 'critical', rank: 4 },
  cancelled: { label: 'Cancelled', tone: 'muted', rank: 4 },
});

export function isCovering(status) { return COVERING_STATUSES.includes(status); }
export function isPending(status) { return PENDING_STATUSES.includes(status); }
export function isVacated(status) { return VACATED_STATUSES.includes(status); }
/** Assignments that still occupy a slot (covering or pending). */
export function occupies(status) { return isCovering(status) || isPending(status); }

/** Effective headcount for a shift (shift override, else the position's). */
export function shiftHeadcount(shift, position) {
  return shift?.headcount ?? position?.headcount ?? 1;
}

/** True when two [start, end) windows overlap. */
export function windowsOverlap(aStart, aEnd, bStart, bEnd) {
  const as = new Date(aStart).getTime(), ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime(), be = new Date(bEnd).getTime();
  return as < be && bs < ae;
}

export function shiftHours(shift) {
  const ms = new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime();
  return Math.max(0, ms / 3_600_000);
}

/**
 * Does this operator satisfy the position's requirements for this shift?
 * @param {Object} position  with `requirements`
 * @param {Object|null} shift used for power_hours vs shift length
 * @param {Object} user      with capabilities[], station_types[], power_hours, license_class
 * @returns {{ ok: boolean, unmet: Object[], optionalUnmet: Object[], unknown: Object[] }}
 *   `unmet` = mandatory requirements the profile fails; `unknown` = mandatory
 *   requirements the profile cannot confirm (field empty), reported separately
 *   so an incomplete profile reads as "ask" rather than "no".
 */
export function matchRequirements(position, shift, user) {
  const reqs = normalizeRequirements(position?.requirements);
  const caps = new Set(user?.capabilities ?? []);
  const stations = new Set(user?.station_types ?? []);
  const unmet = [], optionalUnmet = [], unknown = [];
  for (const r of reqs) {
    let result = /** @type {'ok'|'no'|'unknown'} */ ('ok');
    switch (r.kind) {
      case 'capability':
        result = caps.size === 0 ? 'unknown' : caps.has(String(r.value)) ? 'ok' : 'no';
        break;
      case 'station_type':
        result = stations.size === 0 ? 'unknown' : stations.has(String(r.value)) ? 'ok' : 'no';
        break;
      case 'power_hours': {
        const need = Math.max(Number(r.value) || 0, shift ? Math.min(shiftHours(shift), Number(r.value) || 0) : 0);
        if (user?.power_hours == null || user.power_hours === '') result = 'unknown';
        else result = Number(user.power_hours) >= need ? 'ok' : 'no';
        break;
      }
      case 'license_class': {
        if (!user?.license_class) result = 'unknown';
        else result = (LICENSE_RANK[user.license_class] ?? 0) >= (LICENSE_RANK[String(r.value)] ?? 0) ? 'ok' : 'no';
        break;
      }
      default:
        result = 'ok'; // free-text requirements are for humans
    }
    if (result === 'ok') continue;
    if (!r.mandatory) { optionalUnmet.push(r); continue; }
    (result === 'unknown' ? unknown : unmet).push(r);
  }
  return { ok: unmet.length === 0, unmet, optionalUnmet, unknown };
}

/**
 * Other shifts this user already occupies that overlap the given shift.
 * @param {Object} shift
 * @param {string} userId
 * @param {Object[]} assignments all assignments (any deployment)
 * @param {Map<string, Object>} shiftById
 */
export function overlappingAssignments(shift, userId, assignments, shiftById) {
  return assignments.filter(a => {
    if (a.user_id !== userId || a.shift_id === shift.id || !occupies(a.status)) return false;
    const other = shiftById.get(a.shift_id);
    return other ? windowsOverlap(shift.starts_at, shift.ends_at, other.starts_at, other.ends_at) : false;
  });
}

/**
 * Coverage for one shift.
 * @returns {{ headcount: number, covered: number, pending: number, open: number, atRisk: number, state: 'covered'|'pending'|'open'|'at_risk'|'over' }}
 */
export function shiftCoverage(shift, position, assignments, usersById = new Map()) {
  const headcount = shiftHeadcount(shift, position);
  const mine = assignments.filter(a => a.shift_id === shift.id);
  let covered = 0, pending = 0, atRisk = 0;
  for (const a of mine) {
    if (isCovering(a.status)) {
      covered += 1;
      const u = usersById.get(a.user_id);
      if (u && !matchRequirements(position, shift, u).ok) atRisk += 1;
    } else if (isPending(a.status)) {
      pending += 1;
    }
  }
  const open = Math.max(0, headcount - covered - pending);
  let state = /** @type {'covered'|'pending'|'open'|'at_risk'|'over'} */ ('covered');
  if (atRisk > 0) state = 'at_risk';
  else if (open > 0) state = 'open';
  else if (pending > 0) state = 'pending';
  else if (covered > headcount) state = 'over';
  return { headcount, covered, pending, open, atRisk, state };
}

/**
 * Deployment-wide coverage numbers for the headline.
 * @param {Object[]} positions
 * @param {Object[]} shifts
 * @param {Object[]} assignments
 * @param {Map<string, Object>} [usersById]
 */
export function coverageSummary(positions, shifts, assignments, usersById = new Map()) {
  const positionById = new Map(positions.map(p => [p.id, p]));
  const totals = { slots: 0, covered: 0, pending: 0, open: 0, atRisk: 0, shifts: 0, positions: positions.length, positionsWithoutShifts: 0 };
  const withShift = new Set();
  for (const s of shifts) {
    const p = positionById.get(s.position_id);
    if (!p) continue;
    withShift.add(p.id);
    const c = shiftCoverage(s, p, assignments, usersById);
    totals.shifts += 1;
    totals.slots += c.headcount;
    totals.covered += Math.min(c.covered, c.headcount);
    totals.pending += c.pending;
    totals.open += c.open;
    totals.atRisk += c.atRisk;
  }
  totals.positionsWithoutShifts = positions.filter(p => !withShift.has(p.id)).length;
  return totals;
}

/**
 * Rank operators for a shift: fully qualified and free first, then partial,
 * then unavailable. Never excludes anyone; the coordinator decides.
 * @param {Object} position
 * @param {Object} shift
 * @param {Object[]} users
 * @param {Object[]} assignments
 * @param {Object[]} allShifts
 * @returns {Array<{ user: Object, match: ReturnType<typeof matchRequirements>, overlaps: Object[], alreadyHere: boolean, score: number }>}
 */
export function rankCandidates(position, shift, users, assignments, allShifts) {
  const shiftById = new Map(allShifts.map(s => [s.id, s]));
  const here = new Set(assignments.filter(a => a.shift_id === shift.id && occupies(a.status)).map(a => a.user_id));
  return users
    .filter(u => u.call_sign)
    .map(user => {
      const match = matchRequirements(position, shift, user);
      const overlaps = overlappingAssignments(shift, user.id, assignments, shiftById);
      const alreadyHere = here.has(user.id);
      let score = 0;
      if (alreadyHere) score -= 1000;
      if (overlaps.length) score -= 100;
      score -= match.unmet.length * 20;
      score -= match.unknown.length * 5;
      score -= match.optionalUnmet.length * 2;
      return { user, match, overlaps, alreadyHere, score };
    })
    .sort((a, b) => b.score - a.score || (a.user.call_sign || '').localeCompare(b.user.call_sign || ''));
}

/**
 * Expand a bulk pattern like "AID MILE {n}" over numbers into names.
 * @param {string} pattern contains `{n}`; if absent the number is appended
 * @param {number[]} numbers
 */
export function expandPattern(pattern, numbers) {
  const p = pattern.includes('{n}') ? pattern : `${pattern.trim()} {n}`;
  return numbers.map(n => p.replace(/\{n\}/g, String(n)).trim());
}

/** Parse "1-14" or "2, 4, 6" or "2,4-6" into a sorted unique number list. */
export function parseNumberList(text) {
  const out = new Set();
  for (const part of String(text ?? '').split(/[,\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (b - a > 500) continue;
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Group positions by site id (null for mobile / unsited), keeping sort order. */
export function groupPositionsBySite(positions) {
  const groups = new Map();
  for (const p of [...positions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))) {
    const key = p.site_id || null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return groups;
}

/** Sort key helper: assignment status order for lists. */
export function compareAssignments(a, b) {
  return (ASSIGNMENT_STATUS[a.status]?.rank ?? 9) - (ASSIGNMENT_STATUS[b.status]?.rank ?? 9);
}
