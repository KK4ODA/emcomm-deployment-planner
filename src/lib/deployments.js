import { assigneesOf, isUnassigned } from './assignments';
import { DEPLOYMENT_STATUS_ORDER } from './constants';
import { coverageSummary } from './staffing';

/** Locations belonging to a deployment. */
export function locationsOf(locations, deploymentId) {
  return locations.filter(l => l.deployment_id === deploymentId);
}

/** Items belonging to a deployment (through its locations). */
export function itemsOf(items, deploymentLocations) {
  const ids = new Set(deploymentLocations.map(l => l.id));
  return items.filter(i => ids.has(i.deployment_location_id));
}

/** Headline numbers for a deployment card. */
export function deploymentStats({ deploymentId, categories, locations, items, users }) {
  const deploymentLocations = locationsOf(locations, deploymentId);
  const deploymentItems = itemsOf(items, deploymentLocations);
  return {
    categories: categories.filter(c => c.deployment_id === deploymentId).length,
    sites: deploymentLocations.length,
    items: deploymentItems.length,
    assigned: deploymentItems.filter(i => !isUnassigned(i)).length,
    unassigned: deploymentItems.filter(isUnassigned).length,
    members: users.filter(u => u.call_sign).length,
  };
}

/**
 * Readiness of a deployment at a glance: the stats above plus task progress
 * and how many sites have an ICS 205 radio plan.
 */
export function deploymentReadiness({ deploymentId, categories, locations, items, users, tasks = [], planRows = [], positions = [], shifts = [], assignments = [] }) {
  const stats = deploymentStats({ deploymentId, categories, locations, items, users });
  const siteIds = new Set(locationsOf(locations, deploymentId).map(l => l.id));
  const deploymentTasks = tasks.filter(t => siteIds.has(t.deployment_location_id));
  const planChannels = planRows.filter(r => r.deployment_id === deploymentId).length;
  const tasksCompleted = deploymentTasks.filter(t => t.status === 'completed').length;
  const usersById = new Map(users.map(u => [u.id, u]));
  const staffing = coverageSummary(
    positions.filter(p => p.deployment_id === deploymentId),
    shifts.filter(s => s.deployment_id === deploymentId),
    assignments.filter(a => a.deployment_id === deploymentId),
    usersById,
  );
  return {
    ...stats,
    tasksTotal: deploymentTasks.length,
    tasksCompleted,
    planChannels,
    hasCommsPlan: planChannels > 0,
    slots: staffing.slots,
    slotsCovered: staffing.covered,
    slotsOpen: staffing.open,
    slotsPending: staffing.pending,
    positions: staffing.positions,
    /** Everything a leader checks before go time is green. */
    ready: stats.sites > 0 && stats.unassigned === 0 && deploymentTasks.length === tasksCompleted && planChannels > 0
      && staffing.open === 0 && staffing.pending === 0 && staffing.atRisk === 0,
  };
}

/** Whether a user may open a deployment (admins see all). */
export function canAccessDeployment(user, deployment) {
  if (!user || !deployment) return false;
  if (user.app_role === 'admin') return true;
  return Array.isArray(user.ares_group_ids) && user.ares_group_ids.includes(deployment.ares_group_id);
}

/** Deployments visible to a user. */
export function visibleDeployments(user, deployments) {
  return deployments.filter(d => canAccessDeployment(user, d));
}

export function isArchived(deployment) {
  return deployment?.status === 'archived';
}

/**
 * Active first, then planning, completed, archived; newest first within a
 * status. Stable for equal keys.
 */
export function sortDeployments(deployments) {
  const rank = (d) => {
    const i = DEPLOYMENT_STATUS_ORDER.indexOf(d.status);
    return i === -1 ? DEPLOYMENT_STATUS_ORDER.length : i;
  };
  const time = (d) => (d.created_at ? new Date(d.created_at).getTime() : 0);
  return [...deployments].sort((a, b) => rank(a) - rank(b) || time(b) - time(a));
}

/** Per-site item counts. */
export function locationItemStats(items, locationId) {
  const locationItems = items.filter(i => i.deployment_location_id === locationId);
  const assignees = new Set();
  for (const i of locationItems) for (const cs of assigneesOf(i)) assignees.add(cs);
  return {
    itemCount: locationItems.length,
    assigneeCount: assignees.size,
    unassignedCount: locationItems.filter(isUnassigned).length,
  };
}

/**
 * Call signs that have equipment or tasks at a site but are not on the site's
 * operator roster. Sorted for stable display.
 * @returns {string[]}
 */
export function missingSiteOperators(location, items, tasks) {
  const roster = new Set(location.assigned_call_signs ?? []);
  const found = new Set();
  for (const i of items) {
    if (i.deployment_location_id !== location.id) continue;
    for (const cs of assigneesOf(i)) if (!roster.has(cs)) found.add(cs);
  }
  for (const t of tasks) {
    if (t.deployment_location_id === location.id && t.assigned_to_call_sign && !roster.has(t.assigned_to_call_sign)) found.add(t.assigned_to_call_sign);
  }
  return [...found].sort();
}

/** Shift an ISO timestamp by a number of milliseconds (null-safe). */
export function shiftIso(iso, deltaMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : new Date(t + deltaMs).toISOString();
}

/**
 * Copy a deployment with its sites, categories, items, operational periods,
 * positions, shifts and communications plan, optionally keeping who was
 * assigned (re-offered, so people confirm for the new date) and re-creating
 * setup tasks (as pending). When `newStartsAt` is given every timestamp is
 * moved by the same offset so a yearly event lands on its new date.
 * Returns the new deployment row and counts.
 *
 * @param {Object} repos db repositories (deployments, locations, categories, items, operationalPeriods?, positions?, shifts?, assignments?, commsPlans?, commsPlanChannels?)
 * @param {{ source: Object, locations: Object[], categories: Object[], items: Object[], tasks?: Object[], periods?: Object[], positions?: Object[], shifts?: Object[], assignments?: Object[], plans?: Object[], planRows?: Object[] }} data already scoped to the source deployment
 * @param {{ name: string, createdBy?: string|null, withAssignments?: boolean, withTasks?: boolean, withPlan?: boolean, newStartsAt?: string|null, createTask?: (task: Object) => Promise<any> }} options
 */
export async function duplicateDeployment(
  repos,
  { source, locations, categories, items, tasks = [], periods = [], positions = [], shifts = [], assignments = [], plans = [], planRows = [] },
  { name, createdBy = null, withAssignments = true, withTasks = true, withPlan = true, newStartsAt = null, createTask },
) {
  const anchor = source.starts_at || periods[0]?.starts_at || shifts[0]?.starts_at || null;
  const delta = newStartsAt && anchor ? new Date(newStartsAt).getTime() - new Date(anchor).getTime() : 0;
  const move = (iso) => (delta ? shiftIso(iso, delta) : iso ?? null);
  const dateOf = (iso) => (iso ? iso.slice(0, 10) : null);

  const deployment = await repos.deployments.create({
    name,
    description: source.description ?? null,
    location: source.location ?? null,
    ares_group_id: source.ares_group_id,
    profile: source.profile ?? 'public_service',
    served_agency: source.served_agency ?? null,
    requesting_official: source.requesting_official ?? null,
    status: 'planning',
    starts_at: delta ? move(source.starts_at) : null,
    ends_at: delta ? move(source.ends_at) : null,
    start_date: delta ? dateOf(move(source.starts_at)) : null,
    end_date: delta ? dateOf(move(source.ends_at)) : null,
    created_by: createdBy,
  });

  const categoryIds = new Map();
  for (const c of categories) {
    const created = await repos.categories.create({
      name: c.name, color: c.color, description: c.description, sort_order: c.sort_order, deployment_id: deployment.id,
    });
    categoryIds.set(c.id, created.id);
  }

  const locationIds = new Map();
  for (const l of locations) {
    const created = await repos.locations.create({
      name: l.name, description: l.description, address: l.address, contact_person: l.contact_person, sort_order: l.sort_order,
      assigned_call_signs: withAssignments ? (l.assigned_call_signs ?? []) : [],
      deployment_id: deployment.id,
    });
    locationIds.set(l.id, created.id);
  }

  let itemCount = 0;
  for (const i of items) {
    await repos.items.create({
      name: i.name, description: i.description, quantity: i.quantity, priority: i.priority, sort_order: i.sort_order,
      category_id: categoryIds.get(i.category_id) ?? null,
      deployment_location_id: locationIds.get(i.deployment_location_id) ?? null,
      assigned_to: withAssignments ? assigneesOf(i) : [],
    });
    itemCount += 1;
  }

  let taskCount = 0;
  if (withTasks && createTask) {
    for (const t of tasks) {
      const locationId = locationIds.get(t.deployment_location_id);
      if (!locationId) continue;
      await createTask({
        name: t.name, description: t.description ?? null, priority: t.priority ?? 'medium', status: 'pending', due_date: null,
        assigned_to_call_sign: withAssignments ? (t.assigned_to_call_sign ?? null) : null,
        deployment_location_id: locationId,
        deployment_id: deployment.id,
      });
      taskCount += 1;
    }
  }

  // Operational periods
  const periodIds = new Map();
  if (repos.operationalPeriods) {
    for (const p of periods) {
      const created = await repos.operationalPeriods.create({ deployment_id: deployment.id, sequence: p.sequence, label: p.label ?? null, starts_at: move(p.starts_at), ends_at: move(p.ends_at) });
      periodIds.set(p.id, created.id);
    }
  }

  // Positions (supervisor links resolved in a second pass), shifts, assignments
  const positionIds = new Map();
  let shiftCount = 0, assignmentCount = 0;
  if (repos.positions) {
    for (const p of positions) {
      const created = await repos.positions.create({
        deployment_id: deployment.id, site_id: p.site_id ? locationIds.get(p.site_id) ?? null : null,
        name: p.name, tactical_callsign: p.tactical_callsign ?? null, position_type: p.position_type ?? null, net: p.net ?? null,
        headcount: p.headcount ?? 1, requirements: p.requirements ?? [], briefing_notes: p.briefing_notes ?? null, sort_order: p.sort_order ?? 0,
      });
      positionIds.set(p.id, created.id);
    }
    if (repos.positions.update) {
      for (const p of positions) {
        if (p.supervisor_position_id && positionIds.has(p.supervisor_position_id)) {
          await repos.positions.update(positionIds.get(p.id), { supervisor_position_id: positionIds.get(p.supervisor_position_id) });
        }
      }
    }
    if (repos.shifts) {
      for (const s of shifts) {
        const positionId = positionIds.get(s.position_id);
        if (!positionId) continue;
        const created = await repos.shifts.create({
          position_id: positionId, deployment_id: deployment.id,
          operational_period_id: s.operational_period_id ? periodIds.get(s.operational_period_id) ?? null : null,
          starts_at: move(s.starts_at), ends_at: move(s.ends_at), muster_at: move(s.muster_at), headcount: s.headcount ?? null, notes: s.notes ?? null,
        });
        shiftCount += 1;
        if (withAssignments && repos.assignments) {
          for (const a of assignments) {
            if (a.shift_id !== s.id || !['offered', 'accepted', 'checked_in', 'on_position', 'released'].includes(a.status)) continue;
            await repos.assignments.create({ shift_id: created.id, deployment_id: deployment.id, user_id: a.user_id, status: 'offered', created_by: createdBy });
            assignmentCount += 1;
          }
        }
      }
    }
  }

  // Communications plan (snapshots copied as they are)
  let channelCount = 0;
  if (withPlan && repos.commsPlans && repos.commsPlanChannels) {
    for (const plan of plans) {
      const created = await repos.commsPlans.create({
        deployment_id: deployment.id, name: plan.name ?? 'Communications plan',
        operational_period_id: plan.operational_period_id ? periodIds.get(plan.operational_period_id) ?? null : null,
        special_instructions: plan.special_instructions ?? null, prepared_by_name: plan.prepared_by_name ?? null, prepared_by_position: plan.prepared_by_position ?? null,
      });
      for (const r of planRows.filter(x => x.comms_plan_id === plan.id)) {
        const { id: _id, comms_plan_id: _p, deployment_id: _d, created_at: _c, updated_at: _u, ...rest } = r;
        await repos.commsPlanChannels.create({ ...rest, comms_plan_id: created.id, deployment_id: deployment.id });
        channelCount += 1;
      }
    }
  }

  return {
    deployment,
    counts: { categories: categoryIds.size, locations: locationIds.size, items: itemCount, tasks: taskCount, periods: periodIds.size, positions: positionIds.size, shifts: shiftCount, assignments: assignmentCount, channels: channelCount },
    shiftedDays: delta ? Math.round(delta / 86_400_000) : 0,
    positionIds,
    locationIds,
  };
}
