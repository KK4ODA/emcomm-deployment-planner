/**
 * After-action review: assemble what the record already knows into a draft
 * the coordinator edits, plus helpers for lessons that follow an event into
 * next year's copy. Pure functions.
 */

export const LESSON_CATEGORIES = Object.freeze({
  staffing: 'Staffing',
  comms: 'Communications',
  equipment: 'Equipment',
  logistics: 'Logistics',
  safety: 'Safety',
  process: 'Process',
});

export const LESSON_STATUS = Object.freeze({
  open: { label: 'Open', tone: 'warning' },
  carried_forward: { label: 'Carried forward', tone: 'info' },
  addressed: { label: 'Addressed', tone: 'success' },
  wont_fix: { label: "Won't fix", tone: 'muted' },
});

const round = (n) => Math.round(n * 100) / 100;

/**
 * Attendance and record summary for one deployment.
 * @param {{ assignments: Object[], positions: Object[], shifts: Object[], log: Object[], hours: Object[], feedback: Object[], usersById: Map<string, Object>, objectives?: Object[], coverage?: Object[], safety?: Object|null }} args
 */
export function aarSummary({ assignments, positions, shifts, log, hours, feedback, usersById, objectives = [], coverage = [], safety = null }) {
  const shiftById = new Map(shifts.map(s => [s.id, s]));
  const positionById = new Map(positions.map(p => [p.id, p]));
  const byStatus = {};
  for (const a of assignments) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  const worked = assignments.filter(a => ['checked_in', 'on_position', 'released'].includes(a.status));
  const operators = new Set(worked.map(a => a.user_id));
  const noShows = assignments.filter(a => a.status === 'no_show').map(a => ({ callSign: usersById.get(a.user_id)?.call_sign || '?', position: positionById.get(shiftById.get(a.shift_id)?.position_id)?.name || '' }));
  const unstaffed = [];
  for (const s of shifts) {
    if (!assignments.some(a => a.shift_id === s.id && ['accepted', 'checked_in', 'on_position', 'released'].includes(a.status))) {
      const p = positionById.get(s.position_id);
      if (p) unstaffed.push({ position: p.name, tactical: p.tactical_callsign || '', startsAt: s.starts_at });
    }
  }
  const totalHours = round(hours.reduce((s, h) => s + (Number(h.hours) || 0), 0));
  const incidents = log.filter(e => ['incident', 'comms_failure', 'equipment_problem', 'note'].includes(e.kind));
  const checkIns = log.filter(e => e.kind === 'check_in');
  const firstCheckIn = checkIns.length ? checkIns.reduce((m, e) => (new Date(e.occurred_at) < new Date(m.occurred_at) ? e : m)).occurred_at : null;
  const lastCheckOut = log.filter(e => e.kind === 'check_out').reduce((m, e) => (!m || new Date(e.occurred_at) > new Date(m) ? e.occurred_at : m), null);
  const ratings = feedback.map(f => f.rating).filter(r => r != null);
  const commsVotes = { yes: 0, partly: 0, no: 0 };
  for (const f of feedback) if (f.comms_worked) commsVotes[f.comms_worked] = (commsVotes[f.comms_worked] || 0) + 1;
  return {
    positions: positions.length,
    shifts: shifts.length,
    slotsWorked: worked.length,
    operators: operators.size,
    byStatus,
    noShows,
    unstaffed,
    totalHours,
    incidents,
    firstCheckIn,
    lastCheckOut,
    feedbackCount: feedback.length,
    coverage: { total: coverage.length, direct: coverage.filter(c => c.result === 'direct').length, relay: coverage.filter(c => c.result === 'relay').length, fail: coverage.filter(c => c.result === 'fail').length },
    safety: safety ? { signed: !!safety.signed_at, signedName: safety.signed_name || null, signedAt: safety.signed_at || null } : null,
    objectives: { total: objectives.filter(o => o.status !== 'dropped').length, done: objectives.filter(o => o.status === 'done').length, open: objectives.filter(o => o.status === 'open').length, points: objectives.filter(o => o.status === 'done').reduce((s, o) => s + (o.points || 0), 0) },
    averageRating: ratings.length ? round(ratings.reduce((s, r) => s + r, 0) / ratings.length) : null,
    commsVotes,
  };
}

/**
 * Plain-text AAR draft (Markdown) the coordinator can paste into an email or
 * a document. Never invents content; empty sections say so.
 */
export function aarMarkdown({ deployment, summary, feedback, lessons, usersById, planChanges = [], objectives = [] }) {
  const lines = [];
  const who = (f) => (f.anonymous || !f.user_id ? 'Anonymous' : usersById.get(f.user_id)?.call_sign || usersById.get(f.user_id)?.full_name || 'Member');
  lines.push(`# After-action review: ${deployment.name}`);
  lines.push('');
  lines.push(`Kind: ${deployment.profile || 'public_service'}${deployment.served_agency ? `  ·  Served agency: ${deployment.served_agency}` : ''}`);
  if (deployment.starts_at) lines.push(`Dates: ${new Date(deployment.starts_at).toLocaleString()} to ${deployment.ends_at ? new Date(deployment.ends_at).toLocaleString() : '—'}`);
  lines.push('');
  lines.push('## Participation');
  lines.push(`- ${summary.operators} operators worked ${summary.slotsWorked} of ${summary.shifts} shift slots across ${summary.positions} positions`);
  lines.push(`- ${summary.totalHours} person-hours recorded`);
  if (summary.firstCheckIn) lines.push(`- First check-in ${new Date(summary.firstCheckIn).toLocaleString()}${summary.lastCheckOut ? `, last check-out ${new Date(summary.lastCheckOut).toLocaleString()}` : ''}`);
  if (summary.noShows.length) lines.push(`- No-shows: ${summary.noShows.map(n => `${n.callSign} (${n.position})`).join(', ')}`);
  if (summary.unstaffed.length) lines.push(`- Unstaffed shifts: ${summary.unstaffed.map(u => `${u.tactical || u.position}`).join(', ')}`);
  lines.push('');
  lines.push('## Plan changes');
  if (planChanges.length) for (const c of planChanges) lines.push(`- v${c.version}${c.at ? ` (${new Date(c.at).toLocaleString()})` : ''}: ${c.note || 'no note'}`);
  else lines.push('- None recorded');
  lines.push('');
  lines.push('## Incidents and notes from the log');
  if (summary.incidents.length) for (const e of summary.incidents) lines.push(`- ${new Date(e.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${e.summary}`);
  else lines.push('- None logged');
  lines.push('');
  lines.push(`## Operator feedback (${feedback.length} response${feedback.length === 1 ? '' : 's'}${summary.averageRating ? `, average rating ${summary.averageRating}/5` : ''})`);
  if (feedback.length) {
    lines.push(`- Communications worked: yes ${summary.commsVotes.yes}, partly ${summary.commsVotes.partly}, no ${summary.commsVotes.no}`);
    for (const f of feedback) {
      const bits = [];
      if (f.went_well) bits.push(`went well: ${f.went_well}`);
      if (f.problems) bits.push(`problems: ${f.problems}`);
      if (f.comms_notes) bits.push(`comms: ${f.comms_notes}`);
      if (f.equipment_notes) bits.push(`equipment: ${f.equipment_notes}`);
      if (f.one_change) bits.push(`one change: ${f.one_change}`);
      if (bits.length) lines.push(`- ${who(f)}: ${bits.join(' · ')}`);
    }
  } else {
    lines.push('- No responses yet');
  }
  lines.push('');
  if (summary.coverage?.total) {
    lines.push('## Coverage checks');
    lines.push(`- ${summary.coverage.total} path checks: ${summary.coverage.direct} direct, ${summary.coverage.relay} via relay, ${summary.coverage.fail} failed`);
    lines.push('');
  }
  if (summary.safety) {
    lines.push('## Safety');
    lines.push(summary.safety.signed ? `- Safety checklist signed by ${summary.safety.signedName || 'the Safety Officer'} on ${new Date(summary.safety.signedAt).toLocaleString()}` : '- Safety checklist started but never signed');
    lines.push('');
  }
  if (summary.objectives?.total) {
    lines.push('## Objectives');
    lines.push(`- ${summary.objectives.done} of ${summary.objectives.total} done${summary.objectives.points ? ` (${summary.objectives.points} points)` : ''}${summary.objectives.open ? `, ${summary.objectives.open} never taken` : ''}`);
    for (const o of (objectives || [])) if (o.status !== 'dropped') lines.push(`  - [${o.status === 'done' ? 'x' : ' '}] ${o.title}${o.status === 'done' && o.evidence ? ` (${o.evidence})` : ''}`);
    lines.push('');
  }
  lines.push('## Lessons');
  if (lessons.length) for (const l of lessons) lines.push(`- [${LESSON_CATEGORIES[l.category] || l.category}] ${l.finding}${l.recommendation ? ` → ${l.recommendation}` : ''} (${LESSON_STATUS[l.status]?.label || l.status})`);
  else lines.push('- None recorded yet');
  lines.push('');
  lines.push(`_Generated by EmComm Planner on ${new Date().toLocaleDateString()}_`);
  return lines.join('\n');
}

/**
 * Lessons to carry into a copied deployment: open and previously carried
 * ones, re-pointed at the new deployment (and new position when mapped).
 * @param {Object[]} lessons lessons of the source deployment
 * @param {string} newDeploymentId
 * @param {Map<string, string>} positionIds old → new
 */
export function lessonsToCarry(lessons, newDeploymentId, positionIds = new Map()) {
  return lessons
    .filter(l => l.status === 'open' || l.status === 'carried_forward')
    .map(l => ({
      ares_group_id: l.ares_group_id,
      deployment_id: newDeploymentId,
      position_id: l.position_id ? positionIds.get(l.position_id) ?? null : null,
      site_id: null,
      category: l.category,
      finding: l.finding,
      recommendation: l.recommendation ?? null,
      status: 'carried_forward',
      carried_from_lesson_id: l.id,
    }));
}
