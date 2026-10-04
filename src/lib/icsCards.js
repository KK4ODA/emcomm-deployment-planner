/**
 * ICS 219 resource status cards ("T-cards"), built from the plan instead of
 * being filled in by hand and e-mailed around. Two kinds:
 *
 *   219-5 (personnel, grey)  one card per assigned operator
 *   219-2 (crew, green)      one card per position, listing its operators
 *
 * The UASI exercise showed why these should be generated: the hand-filled
 * crew card disagreed with the plan on the leader's name, the headcount, the
 * departure point and three times.
 *
 * Pure row builders; the PDF renderer only draws what these return.
 */
import { isCovering, occupies, shiftHeadcount } from './staffing';
import { formatDateTime } from './time';

const t = (v) => (v == null || v === '' ? '' : String(v));

/**
 * One 219-5 card per operator with a live assignment, in call-sign order.
 * @param {{ positions: Object[], shifts: Object[], assignments: Object[], usersById: Map<string, Object>, sitesById?: Map<string, Object>, deployment: Object, periodId?: string|null }} args
 */
export function buildPersonnelCards({ positions, shifts, assignments, usersById, sitesById = new Map(), deployment, periodId = null }) {
  const positionById = new Map(positions.map(p => [p.id, p]));
  const shiftById = new Map(shifts.map(s => [s.id, s]));
  const cards = [];
  for (const a of assignments) {
    if (!occupies(a.status)) continue;
    const shift = shiftById.get(a.shift_id);
    if (!shift || (periodId && shift.operational_period_id !== periodId)) continue;
    const position = positionById.get(shift.position_id);
    const user = usersById.get(a.user_id);
    const site = position?.site_id ? sitesById.get(position.site_id) : null;
    cards.push({
      kind: 'personnel',
      callSign: t(user?.call_sign) || '—',
      name: t(user?.full_name),
      phone: t(user?.phone),
      licence: t(user?.license_class).toUpperCase(),
      agency: t(deployment?.served_agency) || 'ARES',
      unit: t(position?.tactical_callsign) || t(position?.name),
      position: t(position?.name),
      site: t(site?.name),
      departurePoint: t(site?.name) || t(deployment?.location),
      eta: shift?.muster_at || shift?.starts_at || null,
      etd: shift?.starts_at || null,
      release: shift?.ends_at || null,
      status: a.status,
      transport: t(user?.station_types?.includes?.('mobile') ? 'POV' : ''),
      remarks: t(position?.net ? `Net ${position.net}` : ''),
    });
  }
  return cards.sort((x, y) => x.callSign.localeCompare(y.callSign));
}

/**
 * One 219-2 crew card per position that has anyone on it. `personnel` is the
 * crew list; `headcount` is what the plan asks for, so a card that is short
 * says so rather than quietly carrying the wrong number.
 * @param {{ positions: Object[], shifts: Object[], assignments: Object[], usersById: Map<string, Object>, sitesById?: Map<string, Object>, deployment: Object, periodId?: string|null }} args
 */
export function buildCrewCards({ positions, shifts, assignments, usersById, sitesById = new Map(), deployment, periodId = null }) {
  const cards = [];
  for (const position of [...positions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    const mine = shifts.filter(s => s.position_id === position.id && (!periodId || s.operational_period_id === periodId));
    if (!mine.length) continue;
    const crew = [];
    let needed = 0;
    let first = null;
    let last = null;
    for (const shift of mine) {
      needed = Math.max(needed, shiftHeadcount(shift, position));
      if (!first || new Date(shift.starts_at) < new Date(first)) first = shift.starts_at;
      if (!last || new Date(shift.ends_at) > new Date(last)) last = shift.ends_at;
      for (const a of assignments) {
        if (a.shift_id !== shift.id || !occupies(a.status)) continue;
        const user = usersById.get(a.user_id);
        if (!user || crew.some(c => c.callSign === user.call_sign)) continue;
        crew.push({ callSign: t(user.call_sign), name: t(user.full_name), phone: t(user.phone), licence: t(user.license_class).toUpperCase(), confirmed: isCovering(a.status) });
      }
    }
    if (!crew.length) continue;
    const site = position.site_id ? sitesById.get(position.site_id) : null;
    cards.push({
      kind: 'crew',
      unit: t(position.tactical_callsign) || t(position.name),
      position: t(position.name),
      agency: t(deployment?.served_agency) || 'ARES',
      leader: crew[0]?.callSign || '',
      crew,
      headcount: crew.length,
      needed,
      short: crew.length < needed,
      site: t(site?.name),
      departurePoint: t(site?.name) || t(deployment?.location),
      etd: first,
      release: last,
      winlink: t(position.winlink_address),
      net: t(position.net),
      remarks: t(position.briefing_notes).slice(0, 120),
    });
  }
  return cards;
}

/** Header line shared by both card kinds. */
export function cardHeading(deployment, period) {
  const window = period ? `${formatDateTime(period.starts_at)} to ${formatDateTime(period.ends_at)}` : '';
  return [t(deployment?.name), window].filter(Boolean).join('  ·  ');
}
