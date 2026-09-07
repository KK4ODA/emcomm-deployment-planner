/** Application routes. Keep in one place so navigation and redirects agree. */
export const ROUTES = Object.freeze({
  dashboard: '/',
  deployments: '/deployments',
  templates: '/templates',
  sites: '/sites',
  siteTasks: (siteId) => `/sites/${siteId}/tasks`,
  staffing: '/staffing',
  myAssignments: '/my-assignments',
  members: '/members',
  aresGroups: '/ares-groups',
  profile: '/profile',
  about: '/profile?tab=about',
  login: '/login',
  resetPassword: '/reset-password',
});

/** Pre-modernization PascalCase paths → new paths (kept for bookmarks). */
export const LEGACY_REDIRECTS = Object.freeze({
  '/Dashboard': ROUTES.dashboard,
  '/Deployments': ROUTES.deployments,
  '/Templates': ROUTES.templates,
  '/Locations': ROUTES.sites,
  '/MyAssignments': ROUTES.myAssignments,
  '/Members': ROUTES.members,
  '/ARESGroups': ROUTES.aresGroups,
  '/Profile': ROUTES.profile,
  '/Login': ROUTES.login,
});
