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
export function deploymentReadiness({ deploymentId, categories, locations, items, users, tasks = [], forms = [], positions = [], shifts = [], assignments = [] }) {
  const stats = deploymentStats({ deploymentId, categories, locations, items, users });
  const siteIds = new Set(locationsOf(locations, deploymentId).map(l => l.id));
  const deploymentTasks = tasks.filter(t => siteIds.has(t.deployment_location_id));
  const sitesWithIcs205 = new Set(forms.filter(f => siteIds.has(f.deployment_location_id)).map(f => f.deployment_location_id)).size;
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
    sitesWithIcs205,
    slots: staffing.slots,
    slotsCovered: staffing.covered,
    slotsOpen: staffing.open,
    slotsPending: staffing.pending,
    positions: staffing.positions,
    /** Everything a leader checks before go time is green. */
    ready: stats.sites > 0 && stats.unassigned === 0 && deploymentTasks.length === tasksCompleted && sitesWithIcs205 === stats.sites
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

/**
 * Copy a deployment with its sites, categories and items, optionally keeping
 * assignments and re-creating setup tasks (as pending). Returns the new
 * deployment row.
 *
 * @param {{ deployments: { create: Function }, locations: { create: Function }, categories: { create: Function }, items: { create: Function } }} repos
 * @param {{ source: Object, locations: Object[], categories: Object[], items: Object[], tasks?: Object[] }} data already scoped to the source deployment
 * @param {{ name: string, createdBy?: string|null, withAssignments?: boolean, withTasks?: boolean, createTask?: (task: Object) => Promise<any> }} options
 */
export async function duplicateDeployment(repos, { source, locations, categories, items, tasks = [] }, { name, createdBy = null, withAssignments = true, withTasks = true, createTask }) {
  const deployment = await repos.deployments.create({
    name,
    description: source.description ?? null,
    location: source.location ?? null,
    ares_group_id: source.ares_group_id,
    status: 'planning',
    start_date: null,
    end_date: null,
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

  return { deployment, counts: { categories: categoryIds.size, locations: locationIds.size, items: itemCount, tasks: taskCount } };
}
