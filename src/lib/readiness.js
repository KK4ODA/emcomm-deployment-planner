/**
 * The readiness checklist: a continuously computed list of problems with the
 * plan, presented as a worklist rather than a score (design doc 9.10). Pure;
 * every check returns a row with a state and a place to fix it.
 */
import { coverageSummary, overlappingAssignments, occupies } from './staffing';
import { planWarnings, channelsForNet, snapshotStale } from './comms';
import { isUnassigned } from './assignments';
import { ROUTES } from '@/app/routes';

/** @typedef {{ id: string, group: string, label: string, state: 'todo'|'warn'|'ok', detail?: string, to?: string, cta?: string }} ReadinessItem */

const GROUPS = ['Plan', 'Staffing', 'Comms', 'Sites', 'Logistics'];
const n = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * @param {{
 *   deployment: Object, positions?: Object[], shifts?: Object[], assignments?: Object[], users?: Object[],
 *   locations?: Object[], items?: Object[], tasks?: Object[], periods?: Object[], planRows?: Object[],
 *   channels?: Object[], unpublishedChanges?: number|null, now?: Date
 * }} ctx everything already scoped to the deployment except channels and users
 * @returns {{ items: ReadinessItem[], groups: { name: string, items: ReadinessItem[] }[], todo: number, warn: number, ok: number, ready: boolean }}
 */
export function readinessChecklist({ deployment, positions = [], shifts = [], assignments = [], users = [], locations = [], items = [], tasks = [], periods = [], planRows = [], channels = [], unpublishedChanges = null, now = new Date() }) {
  /** @type {ReadinessItem[]} */
  const out = [];
  const add = (group, id, state, label, detail, to, cta) => out.push({ id, group, state, label, detail, to, cta });
  const usersById = new Map(users.map(u => [u.id, u]));
  const live = assignments.filter(a => occupies(a.status));

  // ── Plan ──
  if (deployment.starts_at && deployment.ends_at) add('Plan', 'schedule', 'ok', 'Start and end set');
  else add('Plan', 'schedule', 'todo', 'Start and end not set', 'Shifts, hours and ICS forms need the deployment window.', ROUTES.deployments, 'Edit deployment');
  if (deployment.profile === 'activation' || deployment.profile === 'public_service') {
    if (deployment.served_agency) add('Plan', 'agency', 'ok', `Served agency: ${deployment.served_agency}`);
    else add('Plan', 'agency', 'warn', 'Served agency not recorded', 'Who asked for this deployment? Doctrine and liability.', ROUTES.deployments, 'Edit deployment');
  }
  if (deployment.profile === 'activation') {
    if (deployment.authorized_at) add('Plan', 'authorized', 'ok', 'Activation authorized');
    else add('Plan', 'authorized', 'warn', 'Activation not recorded as authorized', 'Record the requesting official and the authorization date before anyone deploys.', ROUTES.deployments, 'Edit deployment');
  }
  if (periods.length) add('Plan', 'periods', 'ok', n(periods.length, 'operational period'));
  else add('Plan', 'periods', 'warn', 'No operational period', 'ICS forms and per-period comms plans are scoped to periods.', ROUTES.staffing, 'Staffing');

  // ── Staffing ──
  const coverage = coverageSummary(positions, shifts, assignments, usersById);
  if (!positions.length) add('Staffing', 'positions', 'todo', 'No positions yet', 'Add the jobs this deployment must staff.', ROUTES.staffing, 'Staffing');
  else {
    const noShift = positions.filter(p => !shifts.some(s => s.position_id === p.id));
    if (noShift.length) add('Staffing', 'shifts', 'todo', `${n(noShift.length, 'position')} without a shift`, noShift.slice(0, 4).map(p => p.tactical_callsign || p.name).join(', ') + (noShift.length > 4 ? ', …' : ''), ROUTES.staffing, 'Staffing');
    else add('Staffing', 'shifts', 'ok', 'Every position has a shift');
    if (coverage.open) add('Staffing', 'open', 'todo', `${n(coverage.open, 'open slot')}`, `${coverage.covered} of ${coverage.slots} covered.`, `${ROUTES.staffing}?filter=open`, 'Fill');
    else add('Staffing', 'open', 'ok', `All ${coverage.slots} slots covered`);
    if (coverage.pending) add('Staffing', 'pending', 'warn', `${n(coverage.pending, 'offer')} awaiting a reply`, 'Chase or reassign; an unanswered offer is not coverage.', `${ROUTES.staffing}?filter=pending`, 'Review');
    if (coverage.atRisk) add('Staffing', 'atrisk', 'warn', `${n(coverage.atRisk, 'assigned operator')} not meeting the requirements`, 'Capability, station type, licence or power endurance for the shift length.', `${ROUTES.staffing}?filter=at_risk`, 'Review');
    const shiftById = new Map(shifts.map(s => [s.id, s]));
    const doubleBooked = new Set();
    for (const a of live) {
      const s = shiftById.get(a.shift_id);
      if (s && overlappingAssignments(s, a.user_id, live, shiftById).length) doubleBooked.add(a.user_id);
    }
    if (doubleBooked.size) add('Staffing', 'double', 'warn', `${n(doubleBooked.size, 'operator')} on overlapping shifts`, [...doubleBooked].map(id => usersById.get(id)?.call_sign || '?').join(', '), ROUTES.staffing, 'Staffing');
    const noTac = positions.filter(p => !p.tactical_callsign);
    if (noTac.length) add('Staffing', 'tactical', 'warn', `${n(noTac.length, 'position')} without a tactical call`, 'Net control needs a name to call on the air.', ROUTES.staffing, 'Staffing');
    if (!positions.some(p => p.position_type === 'net_control')) add('Staffing', 'ncs', 'warn', 'No net control position', 'Who runs the net, and who backs them up?', ROUTES.staffing, 'Staffing');
  }

  // ── Comms ──
  if (!planRows.length) add('Comms', 'plan', 'todo', 'No communications plan', 'Add the nets from the channel library.', ROUTES.comms, 'Comms plan');
  else {
    planWarnings(planRows).forEach((w, i) => add('Comms', `warn-${i}`, 'warn', w, undefined, ROUTES.comms, 'Comms plan'));
    const nets = [...new Set(positions.map(p => (p.net || '').trim()).filter(Boolean))];
    const netsWithoutPrimary = nets.filter(net => !channelsForNet(planRows, net).some(r => r.condition_level === 1 && r.path_role === 'primary'));
    if (netsWithoutPrimary.length) add('Comms', 'nets', 'todo', `No Condition 1 primary for net ${netsWithoutPrimary.join(', ')}`, 'Positions report to a net the plan does not carry.', ROUTES.comms, 'Comms plan');
    else if (nets.length) add('Comms', 'nets', 'ok', `Every net has a primary (${nets.join(', ')})`);
    const channelById = new Map(channels.map(c => [c.id, c]));
    const stale = planRows.filter(r => r.channel_id && channelById.has(r.channel_id) && snapshotStale(r, channelById.get(r.channel_id)));
    if (stale.length) add('Comms', 'stale', 'warn', `${n(stale.length, 'channel')} changed in the library since it was added`, 'Update from library or keep the plan as is on purpose.', ROUTES.comms, 'Comms plan');
    if (!deployment.plan_published_at) add('Comms', 'published', 'todo', 'Plan not published', 'Operators have no packet until you publish.', ROUTES.staffing, 'Publish');
    else if (unpublishedChanges) add('Comms', 'published', 'warn', `${n(unpublishedChanges, 'packet')} changed since v${deployment.plan_version}`, 'Publish so the affected operators are told.', ROUTES.staffing, 'Publish');
    else add('Comms', 'published', 'ok', `Plan v${deployment.plan_version || 1} published`);
    if (deployment.plan_published_at) {
      const unseen = live.filter(a => a.status !== 'offered' && (a.packet_version_seen ?? 0) < (deployment.plan_version || 1));
      if (unseen.length) add('Comms', 'acks', 'warn', `${n(unseen.length, 'operator')} not yet on the latest packet`, 'They will see a change banner; call the ones on critical positions.', ROUTES.ncs, 'Net control');
      else if (live.length) add('Comms', 'acks', 'ok', 'Everyone has seen the latest packet');
    }
  }

  // ── Sites ──
  const usedSiteIds = new Set(positions.map(p => p.site_id).filter(Boolean));
  const used = locations.filter(l => usedSiteIds.has(l.id));
  const noCoords = used.filter(l => l.lat == null || l.lon == null);
  if (noCoords.length) add('Sites', 'coords', 'warn', `${n(noCoords.length, 'staffed site')} without coordinates`, noCoords.slice(0, 4).map(l => l.name).join(', '), ROUTES.sites, 'Sites');
  else if (used.length) add('Sites', 'coords', 'ok', 'Every staffed site has a map pin');
  const noArrival = used.filter(l => !l.parking_notes && !l.arrival_notes);
  if (noArrival.length) add('Sites', 'arrival', 'warn', `${n(noArrival.length, 'staffed site')} without parking or arrival notes`, 'The most common day-of question.', ROUTES.sites, 'Sites');
  else if (used.length) add('Sites', 'arrival', 'ok', 'Parking or arrival notes on every staffed site');

  // ── Logistics ──
  const unassigned = items.filter(isUnassigned);
  const essential = unassigned.filter(i => i.priority === 'essential');
  if (essential.length) add('Logistics', 'essential', 'todo', `${n(essential.length, 'essential item')} nobody is bringing`, undefined, ROUTES.dashboard, 'Equipment');
  if (unassigned.length - essential.length > 0) add('Logistics', 'unassigned', 'warn', `${n(unassigned.length - essential.length, 'item')} unassigned`, undefined, ROUTES.dashboard, 'Equipment');
  if (items.length && !unassigned.length) add('Logistics', 'unassigned', 'ok', 'Every item has someone bringing it');
  const openTasks = tasks.filter(t => t.status !== 'completed');
  const overdue = openTasks.filter(t => t.due_date && new Date(t.due_date).getTime() < now.getTime());
  if (overdue.length) add('Logistics', 'overdue', 'todo', `${n(overdue.length, 'task')} overdue`, undefined, ROUTES.sites, 'Sites');
  if (openTasks.length - overdue.length > 0) add('Logistics', 'tasks', 'warn', `${n(openTasks.length - overdue.length, 'task')} open`, undefined, ROUTES.sites, 'Sites');
  if (tasks.length && !openTasks.length) add('Logistics', 'tasks', 'ok', 'All tasks done');

  const rank = { todo: 0, warn: 1, ok: 2 };
  out.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || rank[a.state] - rank[b.state]);
  const todo = out.filter(i => i.state === 'todo').length;
  const warn = out.filter(i => i.state === 'warn').length;
  const ok = out.filter(i => i.state === 'ok').length;
  return {
    items: out,
    groups: GROUPS.map(name => ({ name, items: out.filter(i => i.group === name) })).filter(g => g.items.length),
    todo, warn, ok,
    ready: todo === 0 && warn === 0,
  };
}
