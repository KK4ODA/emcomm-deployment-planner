/**
 * The operator packet is a projection: everything one operator needs for one
 * assignment, assembled from the plan. Pure functions; the page renders the
 * result and the print stylesheet fits it on one sheet.
 */
import { channelsForNet, groupByCondition } from './comms';
import { normalizeRequirements } from './capabilities';
import { occupies } from './staffing';

/**
 * Pick the assignment an operator should see by default: the one currently
 * running, else the next upcoming, else the most recent.
 * @param {Object[]} assignments the operator's assignments (any status)
 * @param {Map<string, Object>} shiftById
 * @param {Date} [now]
 */
export function pickCurrentAssignment(assignments, shiftById, now = new Date()) {
  const live = assignments.filter(a => occupies(a.status) && shiftById.has(a.shift_id));
  if (!live.length) return null;
  const t = now.getTime();
  const withShift = live.map(a => ({ a, s: shiftById.get(a.shift_id) }));
  const running = withShift.find(({ s }) => new Date(s.starts_at).getTime() <= t && t < new Date(s.ends_at).getTime());
  if (running) return running.a;
  const upcoming = withShift.filter(({ s }) => new Date(s.starts_at).getTime() > t).sort((x, y) => new Date(x.s.starts_at).getTime() - new Date(y.s.starts_at).getTime());
  if (upcoming.length) return upcoming[0].a;
  return withShift.sort((x, y) => new Date(y.s.starts_at).getTime() - new Date(x.s.starts_at).getTime())[0].a;
}

/**
 * Build the packet for one assignment.
 * @param {{
 *   assignment: Object, shift: Object, position: Object, deployment: Object,
 *   site?: Object|null, supervisorPosition?: Object|null, supervisorUsers?: Object[],
 *   ncsUsers?: Object[], planRows?: Object[], items?: Object[], period?: Object|null
 * }} ctx
 */
export function buildPacket(ctx) {
  const { assignment, shift, position, deployment, site = null, supervisorPosition = null, supervisorUsers = [], ncsUsers = [], planRows = [], items = [], period = null } = ctx;
  const rows = channelsForNet(planRows, position.net);
  const byCondition = groupByCondition(rows);
  const primary = byCondition[1].find(r => r.path_role === 'primary') || byCondition[1][0] || rows[0] || null;
  const requirements = normalizeRequirements(position.requirements);
  const equipment = items.filter(i => !site || i.deployment_location_id === site.id);
  return {
    version: deployment.plan_version || 1,
    publishedAt: deployment.plan_published_at || null,
    changeNote: deployment.plan_change_note || null,
    seenVersion: assignment.packet_version_seen ?? null,
    hasUnseenChange: !!deployment.plan_published_at && (assignment.packet_version_seen ?? 0) < (deployment.plan_version || 1),
    deployment: { id: deployment.id, name: deployment.name, servedAgency: deployment.served_agency || null, status: deployment.status },
    position: { id: position.id, name: position.name, tactical: position.tactical_callsign || null, type: position.position_type || null, net: position.net || null, briefing: position.briefing_notes || null, headcount: position.headcount },
    shift: {
      id: shift.id, startsAt: shift.starts_at, endsAt: shift.ends_at, musterAt: shift.muster_at || null, notes: shift.notes || null,
      period: period ? { label: period.label || `Period ${period.sequence}`, startsAt: period.starts_at, endsAt: period.ends_at } : null,
    },
    site: site ? {
      id: site.id, name: site.name, address: site.address || null, lat: site.lat ?? null, lon: site.lon ?? null,
      parking: site.parking_notes || null, arrival: site.arrival_notes || null, access: site.access_notes || null,
      contact: site.contact_person || null, description: site.description || null,
    } : null,
    supervisor: supervisorPosition ? { name: supervisorPosition.name, tactical: supervisorPosition.tactical_callsign || null, people: supervisorUsers.map(contactOf) } : null,
    netControl: ncsUsers.map(contactOf),
    primaryChannel: primary,
    channelsByCondition: byCondition,
    requirements,
    equipment,
    status: assignment.status,
    assignmentId: assignment.id,
  };
}

function contactOf(u) {
  return { callSign: u.call_sign || null, name: u.full_name || null, phone: u.phone || null };
}

/** Directions link for a site (Google Maps handles both coordinates and text). */
export function directionsUrl(site) {
  if (!site) return null;
  if (site.lat != null && site.lon != null) return `https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lon}`;
  if (site.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.address)}`;
  return null;
}
