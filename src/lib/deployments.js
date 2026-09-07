import { assigneesOf, isUnassigned } from './assignments';

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
