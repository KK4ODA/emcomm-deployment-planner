/**
 * Central registry of React Query keys so pages, hooks and the sync engine
 * invalidate the same caches.
 */
export const queryKeys = Object.freeze({
  users: ['users'],
  deployments: ['deployments'],
  deployment: (id) => ['deployment', id],
  locations: ['locations'],
  categories: ['categories'],
  items: ['items'],
  tasks: ['tasks'],
  templates: ['templates'],
  ics205Forms: ['ics205forms'],
  aresGroups: ['ares-groups'],
  notifications: (email) => (email ? ['notifications', email] : ['notifications']),
});
