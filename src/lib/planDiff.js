/**
 * What changed in each operator's packet between two publications.
 *
 * A packet snapshot is the small set of fields an operator acts on: name and
 * tactical call, site and its logistics, shift times, who they report to,
 * and the channels for their net by condition. The snapshot published last
 * time is stored on the position; diffing it against the current plan tells
 * us who must be told, and what to tell them. Pure functions.
 */
import { channelsForNet, groupByCondition, channelSummary } from './comms';
import { normalizeRequirements } from './capabilities';
import { occupies } from './staffing';
import { formatDateTime } from './time';

const CONDITION_ROLES = ['primary', 'alternate', 'contingency', 'emergency'];

/**
 * Snapshot of one position's packet.
 * @param {{ position: Object, shifts: Object[], site?: Object|null, supervisorPosition?: Object|null, planRows?: Object[] }} ctx
 */
export function packetSnapshot({ position, shifts, site = null, supervisorPosition = null, planRows = [] }) {
  const rows = channelsForNet(planRows, position.net);
  const byCondition = groupByCondition(rows);
  const channels = [];
  for (const c of [1, 2, 3]) {
    for (const r of byCondition[c] ?? []) channels.push({ condition: c, role: r.path_role || 'primary', name: r.channel_name || '', summary: channelSummary(r) });
  }
  return {
    name: position.name || '',
    tactical: position.tactical_callsign || null,
    net: position.net || null,
    headcount: position.headcount ?? null,
    briefing: position.briefing_notes || null,
    requirements: normalizeRequirements(position.requirements).map(r => `${r.kind}:${r.value}${r.mandatory === false ? '?' : ''}`).sort(),
    supervisor: supervisorPosition ? (supervisorPosition.tactical_callsign || supervisorPosition.name || null) : null,
    site: site ? {
      id: site.id, name: site.name || '', address: site.address || null, lat: site.lat ?? null, lon: site.lon ?? null,
      parking: site.parking_notes || null, arrival: site.arrival_notes || null, access: site.access_notes || null, contact: site.contact_person || null,
    } : null,
    shifts: shifts
      .filter(s => s.position_id === position.id)
      .map(s => ({ id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, muster_at: s.muster_at || null }))
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))),
    channels,
  };
}

const t = (iso) => formatDateTime(iso, 'EEE HH:mm');
const arrow = (a, b) => `${a ?? '—'} → ${b ?? '—'}`;

/**
 * Human-readable differences, in the operator's words. Empty when nothing
 * that reaches the packet changed.
 * @param {Object|null|undefined} prev
 * @param {Object} next
 * @returns {string[]}
 */
export function diffSnapshots(prev, next) {
  if (!prev) return ['New in the plan'];
  const out = [];
  if (prev.name !== next.name) out.push(`Renamed ${arrow(prev.name, next.name)}`);
  if ((prev.tactical || null) !== (next.tactical || null)) out.push(`Tactical call ${arrow(prev.tactical, next.tactical)}`);

  // Site
  const ps = prev.site, ns = next.site;
  if (!ps && ns) out.push(`Site set: ${ns.name}`);
  else if (ps && !ns) out.push(`Site removed (was ${ps.name})`);
  else if (ps && ns) {
    if (ps.id !== ns.id || ps.name !== ns.name) out.push(`Site moved: ${arrow(ps.name, ns.name)}`);
    else {
      if ((ps.address || null) !== (ns.address || null) || ps.lat !== ns.lat || ps.lon !== ns.lon) out.push('Site address or coordinates updated');
      const notes = [['parking', 'parking'], ['arrival', 'arrival'], ['access', 'access'], ['contact', 'contact']].filter(([k]) => (ps[k] || null) !== (ns[k] || null)).map(([, l]) => l);
      if (notes.length) out.push(`Site notes updated (${notes.join(', ')})`);
    }
  }

  // Shifts, matched by id
  const prevShifts = new Map((prev.shifts || []).map(s => [s.id, s]));
  const nextShifts = new Map((next.shifts || []).map(s => [s.id, s]));
  for (const [id, s] of nextShifts) {
    const p = prevShifts.get(id);
    if (!p) { out.push(`New shift ${t(s.starts_at)}–${t(s.ends_at)}`); continue; }
    if (p.starts_at !== s.starts_at || p.ends_at !== s.ends_at) out.push(`Shift ${arrow(`${t(p.starts_at)}–${t(p.ends_at)}`, `${t(s.starts_at)}–${t(s.ends_at)}`)}`);
    if ((p.muster_at || null) !== (s.muster_at || null)) out.push(`Muster ${arrow(p.muster_at ? t(p.muster_at) : 'not set', s.muster_at ? t(s.muster_at) : 'not set')}`);
  }
  for (const [id, p] of prevShifts) if (!nextShifts.has(id)) out.push(`Shift ${t(p.starts_at)}–${t(p.ends_at)} removed`);

  if ((prev.supervisor || null) !== (next.supervisor || null)) out.push(`Reports to ${next.supervisor ?? 'nobody'}${prev.supervisor ? ` (was ${prev.supervisor})` : ''}`);
  if ((prev.net || null) !== (next.net || null)) out.push(`Net ${arrow(prev.net, next.net)}`);

  // Channels, per condition and role
  const key = (c) => `${c.condition}|${c.role}`;
  const group = (list) => {
    const m = new Map();
    for (const c of list || []) { const k = key(c); m.set(k, [...(m.get(k) || []), `${c.name} ${c.summary}`.trim()]); }
    return m;
  };
  const pc = group(prev.channels), nc = group(next.channels);
  for (const c of [1, 2, 3]) {
    for (const role of CONDITION_ROLES) {
      const k = `${c}|${role}`;
      const a = (pc.get(k) || []).join(', '), b = (nc.get(k) || []).join(', ');
      if (a === b) continue;
      if (!a) out.push(`Condition ${c} ${role}: ${b}`);
      else if (!b) out.push(`Condition ${c} ${role} removed (was ${a})`);
      else out.push(`Condition ${c} ${role}: ${b} (was ${a})`);
    }
  }

  if ((prev.headcount ?? null) !== (next.headcount ?? null)) out.push(`Headcount ${arrow(prev.headcount, next.headcount)}`);
  if ((prev.briefing || null) !== (next.briefing || null)) out.push('Briefing notes updated');
  if ((prev.requirements || []).join('|') !== (next.requirements || []).join('|')) out.push('Requirements updated');
  return out;
}

/**
 * Diff every position of a deployment against its stored snapshot.
 * @param {{ deployment: Object, positions: Object[], shifts: Object[], locations?: Object[], plans?: Object[], planRows?: Object[], assignments?: Object[] }} ctx
 * @returns {{ entries: { position: Object, snapshot: Object, changes: string[] }[], changed: { position: Object, snapshot: Object, changes: string[] }[], affectedUserIds: Set<string>, assignedUserIds: Set<string> }}
 */
export function planChanges({ deployment, positions, shifts, locations = [], plans = [], planRows = [], assignments = [] }) {
  const depPositions = positions.filter(p => p.deployment_id === deployment.id);
  const depShifts = shifts.filter(s => s.deployment_id === deployment.id);
  const depPlans = plans.filter(p => p.deployment_id === deployment.id);
  const rowsForPlan = (plan) => plan ? planRows.filter(r => r.comms_plan_id === plan.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : [];
  const byId = new Map(depPositions.map(p => [p.id, p]));
  const firstPublish = !deployment.plan_published_at;

  const entries = depPositions.map(position => {
    const own = depShifts.filter(s => s.position_id === position.id);
    const periodId = own.find(s => s.operational_period_id)?.operational_period_id ?? null;
    const plan = depPlans.find(p => p.operational_period_id && p.operational_period_id === periodId) ?? depPlans.find(p => !p.operational_period_id) ?? depPlans[0] ?? null;
    const snapshot = packetSnapshot({
      position, shifts: own,
      site: position.site_id ? locations.find(l => l.id === position.site_id) ?? null : null,
      supervisorPosition: position.supervisor_position_id ? byId.get(position.supervisor_position_id) ?? null : null,
      planRows: rowsForPlan(plan),
    });
    const changes = position.packet_snapshot ? diffSnapshots(position.packet_snapshot, snapshot) : [firstPublish ? 'First published packet' : 'New in the plan'];
    return { position, snapshot, changes };
  });
  const changed = entries.filter(e => e.changes.length > 0);
  const changedPositionIds = new Set(changed.map(e => e.position.id));
  const shiftPosition = new Map(depShifts.map(s => [s.id, s.position_id]));
  const affectedUserIds = new Set(), assignedUserIds = new Set();
  for (const a of assignments) {
    if (a.deployment_id !== deployment.id || !occupies(a.status)) continue;
    assignedUserIds.add(a.user_id);
    if (changedPositionIds.has(shiftPosition.get(a.shift_id))) affectedUserIds.add(a.user_id);
  }
  return { entries, changed, affectedUserIds, assignedUserIds };
}

/** Payload for the `publish_plan` RPC. */
export function toPublishPayload(entries) {
  return entries.map(e => ({ position_id: e.position.id, snapshot: e.snapshot, changes: e.changes }));
}
