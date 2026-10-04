/**
 * Objectives per deployment (design doc 9.16): a list the group can see,
 * claim and tick off. Pure helpers; the server RPC owns the rules.
 */

/**
 * How an exercise objective came out, written up afterwards. The agency
 * report wants this table, and writing it by hand is what the UASI
 * after-action cost an evening.
 */
export const OBJECTIVE_EVALUATION = Object.freeze({
  met: { label: 'Met', tone: 'success', rank: 0 },
  partly_met: { label: 'Partly met', tone: 'warning', rank: 1 },
  not_met: { label: 'Not met', tone: 'critical', rank: 2 },
  not_exercised: { label: 'Not exercised', tone: 'muted', rank: 3 },
});

/** Counts for the after-action report, ignoring dropped objectives. */
export function evaluationSummary(objectives = []) {
  const live = objectives.filter(o => o.status !== 'dropped');
  const by = (k) => live.filter(o => o.evaluation === k).length;
  return { total: live.length, met: by('met'), partlyMet: by('partly_met'), notMet: by('not_met'), notExercised: by('not_exercised'), unscored: live.filter(o => !o.evaluation).length };
}

export const OBJECTIVE_STATUS = Object.freeze({
  open: { label: 'Open', tone: 'warning', rank: 0 },
  claimed: { label: 'Claimed', tone: 'info', rank: 1 },
  done: { label: 'Done', tone: 'success', rank: 2 },
  dropped: { label: 'Dropped', tone: 'muted', rank: 3 },
});

/**
 * What the signed-in user may do with an objective. Mirrors the RPC rules.
 * @returns {Array<{ status: string, label: string, primary?: boolean }>}
 */
export function objectiveActions(objective, user, isPlanner) {
  if (!objective || !user) return [];
  const mine = objective.claimed_by === user.id || objective.completed_by === user.id;
  const out = [];
  switch (objective.status) {
    case 'open':
      out.push({ status: 'claimed', label: 'I will take this', primary: true });
      if (isPlanner) out.push({ status: 'done', label: 'Mark done' }, { status: 'dropped', label: 'Drop' });
      break;
    case 'claimed':
      if (mine || isPlanner) out.push({ status: 'done', label: 'Done', primary: true }, { status: 'open', label: 'Release' });
      if (isPlanner) out.push({ status: 'dropped', label: 'Drop' });
      break;
    case 'done':
      if (mine || isPlanner) out.push({ status: 'claimed', label: 'Undo' });
      break;
    case 'dropped':
      if (isPlanner) out.push({ status: 'open', label: 'Reopen' });
      break;
    default: break;
  }
  return out;
}

/** Counts and points for headers, the AAR and the score panel. */
export function objectiveSummary(objectives) {
  const s = { total: 0, open: 0, claimed: 0, done: 0, dropped: 0, points: 0, pointsDone: 0 };
  for (const o of objectives) {
    s.total += 1;
    if (o.status in s) s[o.status] += 1;
    if (o.status !== 'dropped') s.points += o.points || 0;
    if (o.status === 'done') s.pointsDone += o.points || 0;
  }
  return s;
}

/** Display order: open first, then claimed, done, dropped; then by sort order and title. */
export function sortObjectives(objectives) {
  return [...objectives].sort((a, b) => (OBJECTIVE_STATUS[a.status]?.rank ?? 9) - (OBJECTIVE_STATUS[b.status]?.rank ?? 9) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.title || '').localeCompare(b.title || ''));
}

/** Copy objectives to a new deployment (duplicate): fresh, unclaimed. */
export function objectivesToCopy(objectives, newDeploymentId) {
  return objectives.filter(o => o.status !== 'dropped').map(o => ({
    deployment_id: newDeploymentId, title: o.title, description: o.description ?? null, category: o.category ?? null,
    points: o.points ?? null, status: 'open', sort_order: o.sort_order ?? 0,
  }));
}
