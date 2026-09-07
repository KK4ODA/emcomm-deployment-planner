/**
 * Deployment templates capture the structure of a deployment (categories,
 * sites, items) without ids or assignments so it can be re-applied later.
 */

/**
 * @param {{ categories: Object[], locations: Object[], items: Object[] }} parts
 *   already scoped to one deployment
 */
export function buildTemplateStructure({ categories, locations, items }) {
  const categoryName = new Map(categories.map(c => [c.id, c.name]));
  const locationName = new Map(locations.map(l => [l.id, l.name]));
  return {
    categories: categories.map(c => ({
      name: c.name, color: c.color, description: c.description, sort_order: c.sort_order,
    })),
    locations: locations.map(l => ({
      name: l.name, description: l.description, address: l.address, contact_person: l.contact_person, sort_order: l.sort_order,
    })),
    items: items.map(i => ({
      name: i.name,
      description: i.description,
      category_name: categoryName.get(i.category_id) ?? null,
      location_name: locationName.get(i.deployment_location_id) ?? null,
      quantity: i.quantity,
      priority: i.priority,
    })),
  };
}

/** Counts stored alongside the structure for quick display. */
export function templateCounts(structure) {
  return {
    category_count: structure.categories?.length ?? 0,
    item_count: structure.items?.length ?? 0,
    location_count: structure.locations?.length ?? 0,
  };
}

/**
 * Create the categories, sites and items described by a template inside a
 * deployment. Items whose category or site name cannot be resolved are
 * created without that link rather than dropped.
 *
 * @param {{ categories: { create: (data: Object) => Promise<any> }, locations: { create: (data: Object) => Promise<any> }, items: { create: (data: Object) => Promise<any> } }} repos
 * @param {string} deploymentId
 * @param {ReturnType<typeof buildTemplateStructure>} structure
 */
export async function applyTemplate(repos, deploymentId, structure) {
  const categoryIds = new Map();
  for (const cat of structure.categories ?? []) {
    const created = await repos.categories.create({ ...cat, deployment_id: deploymentId });
    categoryIds.set(cat.name, created.id);
  }

  const locationIds = new Map();
  for (const loc of structure.locations ?? []) {
    const created = await repos.locations.create({ ...loc, deployment_id: deploymentId });
    locationIds.set(loc.name, created.id);
  }

  for (const item of structure.items ?? []) {
    await repos.items.create({
      name: item.name,
      description: item.description,
      category_id: categoryIds.get(item.category_name) ?? null,
      deployment_location_id: locationIds.get(item.location_name) ?? null,
      quantity: item.quantity,
      priority: item.priority,
    });
  }

  return { categories: categoryIds.size, locations: locationIds.size, items: structure.items?.length ?? 0 };
}
