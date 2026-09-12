/**
 * Tasking: what the desk asks a unit to do during the event, tracked on a
 * short ladder so the board, the packet, APRS and the ICS 214 agree. Pure
 * helpers; the server RPCs own the rules.
 */

export const TASK_KINDS = Object.freeze([
  { id: 'message', label: 'Pass a message', hint: 'Deliver traffic to a person or site' },
  { id: 'relay', label: 'Relay', hint: 'Relay between two stations that cannot hear each other' },
  { id: 'pickup', label: 'Pick up', hint: 'Collect a person or item and bring them somewhere' },
  { id: 'deliver', label: 'Deliver', hint: 'Take supplies, equipment or a person to a site' },
  { id: 'stage', label: 'Stage / reposition', hint: 'Move to a location and wait for instructions' },
  { id: 'patrol', label: 'Patrol', hint: 'Move between locations looking for problems' },
  { id: 'search', label: 'Search / locate', hint: 'Find a person, vehicle or hazard in an area' },
  { id: 'rendezvous', label: 'Rendezvous', hint: 'Meet another unit or agency face to face' },
  { id: 'check', label: 'Welfare / equipment check', hint: 'Confirm a person, site or system is all right' },
  { id: 'other', label: 'Other', hint: '' },
]);

export const TASK_PRIORITY = Object.freeze({
  routine: { label: 'Routine', tone: 'neutral', rank: 2 },
  priority: { label: 'Priority', tone: 'warning', rank: 1 },
  urgent: { label: 'Urgent', tone: 'critical', rank: 0 },
});

export const TASK_STATUS = Object.freeze({
  issued: { label: 'Issued', short: 'Issued', tone: 'warning', rank: 0 },
  acknowledged: { label: 'Acknowledged', short: 'Ack', tone: 'info', rank: 1 },
  en_route: { label: 'En route', short: 'En route', tone: 'info', rank: 2 },
  on_scene: { label: 'On scene', short: 'On scene', tone: 'success', rank: 3 },
  complete: { label: 'Complete', short: 'Done', tone: 'neutral', rank: 4 },
  cancelled: { label: 'Cancelled', short: 'Cancelled', tone: 'muted', rank: 5 },
});

export const OPEN_TASK_STATUSES = Object.freeze(['issued', 'acknowledged', 'en_route', 'on_scene']);
export const isOpenTask = (t) => OPEN_TASK_STATUSES.includes(t?.status);

/** The operator's next step on the ladder, if any. */
export function nextTaskStep(status) {
  switch (status) {
    case 'issued': return { status: 'acknowledged', label: 'Acknowledge' };
    case 'acknowledged': return { status: 'en_route', label: 'En route' };
    case 'en_route': return { status: 'on_scene', label: 'On scene' };
    case 'on_scene': return { status: 'complete', label: 'Done' };
    default: return null;
  }
}

/**
 * Steps the desk can jump to from a given state (operators use nextTaskStep).
 * @returns {Array<{ status: string, label: string, destructive?: boolean }>}
 */
export function deskTaskActions(status) {
  if (!isOpenTask({ status })) return [];
  const order = ['acknowledged', 'en_route', 'on_scene', 'complete'];
  const rank = TASK_STATUS[status]?.rank ?? 0;
  return [...order.filter(s => TASK_STATUS[s].rank > rank).map(s => ({ status: s, label: TASK_STATUS[s].label })), { status: 'cancelled', label: 'Cancel', destructive: true }];
}

/** Human line for where a task goes: "Aid station mile 2 to HDBY". */
export function taskRoute(task, sitesById = new Map()) {
  const from = task.from_site_id ? sitesById.get(task.from_site_id)?.name : task.from_text;
  const to = task.to_site_id ? sitesById.get(task.to_site_id)?.name : task.to_text;
  if (from && to) return `${from} to ${to}`;
  return from || to || '';
}

/** Minutes a task has waited in its current state. */
export function taskAgeMinutes(task, now = new Date()) {
  const since = task.status === 'issued' ? task.issued_at : task.status === 'acknowledged' ? task.acknowledged_at : task.status === 'en_route' ? task.en_route_at : task.status === 'on_scene' ? task.on_scene_at : task.completed_at || task.cancelled_at;
  if (!since) return 0;
  return Math.max(0, Math.round((now.getTime() - new Date(since).getTime()) / 60000));
}

/**
 * Attention level for the board: issued tasks nobody acknowledged go amber at
 * 5 minutes and red at 10; anything open longer than an hour is flagged.
 * Urgent tasks halve those thresholds.
 */
export function taskAttention(task, now = new Date()) {
  if (!isOpenTask(task)) return 'none';
  const age = taskAgeMinutes(task, now);
  const f = task.priority === 'urgent' ? 0.5 : 1;
  if (task.status === 'issued') return age >= 10 * f ? 'critical' : age >= 5 * f ? 'warning' : 'none';
  const total = Math.round((now.getTime() - new Date(task.issued_at).getTime()) / 60000);
  return total >= 60 * f ? 'warning' : 'none';
}

/** Open first (urgent, then oldest issued), then closed newest first. */
export function sortTasks(tasks, now = new Date()) {
  const att = { critical: 0, warning: 1, none: 2 };
  return [...tasks].sort((a, b) => {
    const ao = isOpenTask(a), bo = isOpenTask(b);
    if (ao !== bo) return ao ? -1 : 1;
    if (ao) {
      const d = (TASK_PRIORITY[a.priority]?.rank ?? 2) - (TASK_PRIORITY[b.priority]?.rank ?? 2) || att[taskAttention(a, now)] - att[taskAttention(b, now)];
      if (d) return d;
      return new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime();
    }
    return new Date(b.completed_at || b.cancelled_at || b.issued_at).getTime() - new Date(a.completed_at || a.cancelled_at || a.issued_at).getTime();
  });
}

/** Tasks that concern one operator: their assignment, their position, or unassigned. */
export function tasksForOperator(tasks, { assignmentIds = [], positionIds = [] }) {
  const a = new Set(assignmentIds), p = new Set(positionIds);
  return tasks.filter(t => (t.assignment_id && a.has(t.assignment_id)) || (!t.assignment_id && t.position_id && p.has(t.position_id)) || (!t.assignment_id && !t.position_id));
}

/** Counts for the board header and the AAR. */
export function taskSummary(tasks, now = new Date()) {
  const open = tasks.filter(isOpenTask);
  const done = tasks.filter(t => t.status === 'complete');
  const waits = done.filter(t => t.on_scene_at).map(t => (new Date(t.on_scene_at).getTime() - new Date(t.issued_at).getTime()) / 60000);
  return {
    open: open.length,
    unacknowledged: open.filter(t => t.status === 'issued').length,
    overdue: open.filter(t => taskAttention(t, now) !== 'none').length,
    complete: done.length,
    cancelled: tasks.filter(t => t.status === 'cancelled').length,
    medianToScene: waits.length ? Math.round(waits.sort((x, y) => x - y)[Math.floor(waits.length / 2)]) : null,
  };
}

/** One APRS-sized line (67 chars) for the dispatch message. */
export function taskAprsText(task, sitesById = new Map()) {
  const route = taskRoute(task, sitesById);
  const s = `T${task.seq}${task.priority === 'urgent' ? '!' : task.priority === 'priority' ? '+' : ''} ${task.title}${route ? ` @${route}` : ''}`;
  return s.length <= 67 ? s : `${s.slice(0, 66)}~`;
}
