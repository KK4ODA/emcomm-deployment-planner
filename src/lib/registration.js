/**
 * Registration with the served agency: the host keeps its own participant
 * roster, and being assigned here does not put you on it. The Atlanta UASI
 * exercise of October 2026 lost a team leader and two operators to a
 * registration rejection discovered the morning before start, so this is
 * tracked per operator, with a deadline, and surfaced in readiness.
 */

export const REGISTRATION_STATUS = Object.freeze({
  not_submitted: { label: 'Not submitted', short: 'Not sent', tone: 'warning', rank: 0, blocking: true },
  submitted: { label: 'Submitted, waiting', short: 'Waiting', tone: 'info', rank: 1, blocking: true },
  confirmed: { label: 'Confirmed by the agency', short: 'Confirmed', tone: 'success', rank: 2, blocking: false },
  rejected: { label: 'Rejected', short: 'Rejected', tone: 'critical', rank: 3, blocking: true },
  not_required: { label: 'Not required', short: 'N/A', tone: 'muted', rank: 4, blocking: false },
});

export const REGISTRATION_ORDER = Object.freeze(['rejected', 'not_submitted', 'submitted', 'confirmed', 'not_required']);

/** The status of one operator, defaulting to not submitted when no row exists. */
export function registrationFor(registrations, userId) {
  return registrations.find(r => r.user_id === userId) || null;
}

export const registrationStatus = (registrations, userId) => registrationFor(registrations, userId)?.status || 'not_submitted';

/** True when this operator still has something to do before the agency will admit them. */
export const registrationBlocking = (status) => REGISTRATION_STATUS[status]?.blocking ?? true;

/**
 * Who needs registering: one entry per operator holding a live assignment,
 * with their status. Sorted worst first, so the desk sees rejections on top.
 * @param {{ assignments: Object[], usersById: Map<string, Object>, registrations?: Object[] }} args
 * @returns {Array<{ userId: string, user: Object|null, status: string, row: Object|null, assignments: number }>}
 */
export function registrationRoster({ assignments, usersById, registrations = [] }) {
  const live = assignments.filter(a => ['offered', 'accepted', 'checked_in', 'on_position'].includes(a.status));
  const byUser = new Map();
  for (const a of live) {
    if (!a.user_id) continue;
    const seen = byUser.get(a.user_id);
    if (seen) seen.assignments += 1;
    else byUser.set(a.user_id, { userId: a.user_id, user: usersById.get(a.user_id) || null, status: registrationStatus(registrations, a.user_id), row: registrationFor(registrations, a.user_id), assignments: 1 });
  }
  return [...byUser.values()].sort((x, y) =>
    REGISTRATION_ORDER.indexOf(x.status) - REGISTRATION_ORDER.indexOf(y.status)
    || String(x.user?.call_sign || '').localeCompare(String(y.user?.call_sign || '')));
}

/** Counts for the readiness line and the staffing header. */
export function registrationSummary(roster) {
  return {
    total: roster.length,
    confirmed: roster.filter(r => r.status === 'confirmed').length,
    rejected: roster.filter(r => r.status === 'rejected').length,
    waiting: roster.filter(r => r.status === 'submitted').length,
    notSubmitted: roster.filter(r => r.status === 'not_submitted').length,
    outstanding: roster.filter(r => registrationBlocking(r.status)).length,
  };
}

/**
 * How much time is left to fix a registration, and how loud to be about it.
 * Critical once the deadline has passed or the deployment starts within a day.
 * @returns {'none'|'warning'|'critical'}
 */
export function registrationUrgency(deployment, now = new Date()) {
  if (!deployment?.registration_required) return 'none';
  const deadline = deployment.registration_deadline ? new Date(deployment.registration_deadline) : null;
  const start = deployment.starts_at ? new Date(deployment.starts_at) : null;
  if (deadline && deadline.getTime() <= now.getTime()) return 'critical';
  if (start && start.getTime() - now.getTime() <= 24 * 3600_000) return 'critical';
  if (deadline && deadline.getTime() - now.getTime() <= 3 * 24 * 3600_000) return 'warning';
  if (start && start.getTime() - now.getTime() <= 7 * 24 * 3600_000) return 'warning';
  return 'none';
}
