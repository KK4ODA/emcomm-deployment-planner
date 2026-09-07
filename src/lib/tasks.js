import { TASK_STATUS, TASK_PRIORITY } from './constants';

/**
 * Sort open tasks for an operator: in-progress first, then by priority,
 * then earliest due date (tasks without a due date last).
 */
export function compareOpenTasks(a, b) {
  const statusOrder = { in_progress: 0, pending: 1, completed: 2 };
  const s = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
  if (s !== 0) return s;
  const p = (TASK_PRIORITY[a.priority]?.rank ?? 99) - (TASK_PRIORITY[b.priority]?.rank ?? 99);
  if (p !== 0) return p;
  const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
  const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
  return ad - bd;
}

/** Tasks assigned to a call sign that are not completed, sorted for action. */
export function openTasksFor(tasks, callSign) {
  if (!callSign) return [];
  return tasks
    .filter(t => t.assigned_to_call_sign === callSign && t.status !== 'completed')
    .sort(compareOpenTasks);
}

/** Count tasks per status. */
export function summarizeTasks(tasks) {
  const summary = { total: tasks.length, pending: 0, in_progress: 0, completed: 0, percent: 0 };
  for (const t of tasks) if (t.status in summary) summary[t.status] += 1;
  summary.percent = tasks.length ? Math.round((summary.completed / tasks.length) * 100) : 0;
  return summary;
}

/** Group tasks by status in display order. */
export function groupTasksByStatus(tasks) {
  const groups = {};
  for (const status of Object.keys(TASK_STATUS)) groups[status] = [];
  for (const t of tasks) (groups[t.status] ??= []).push(t);
  return groups;
}

/** Tasks belonging to a deployment (through its sites), optionally one site. */
export function tasksInDeployment(tasks, locations, locationId = null) {
  const ids = new Set(locations.map(l => l.id));
  return tasks.filter(t => ids.has(t.deployment_location_id) && (!locationId || t.deployment_location_id === locationId));
}
