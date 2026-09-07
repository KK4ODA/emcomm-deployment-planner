/**
 * Role-based permissions. The server enforces the same rules through
 * Supabase Row-Level Security (migration 008); this copy only drives what
 * the UI offers.
 *
 * Roles, most to least privileged:
 *   admin    manages members, groups, roles and everything else
 *   planner  coordinators: build deployments, positions, comms plans
 *   operator field members: own profile, assignments, tasks, equipment
 *   viewer   read-only
 *   pending  awaiting approval
 */
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  PLANNER: 'planner',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  PENDING: 'pending',
});

/** @typedef {typeof ROLES[keyof typeof ROLES]} Role */

const A = ROLES.ADMIN;
const P = ROLES.PLANNER;
const O = ROLES.OPERATOR;
const V = ROLES.VIEWER;

export const PERMISSIONS = Object.freeze({
  CREATE_DEPLOYMENT: [A, P],
  EDIT_DEPLOYMENT: [A, P],
  DELETE_DEPLOYMENT: [A],
  VIEW_DEPLOYMENT: [A, P, O, V],
  EXPORT_DEPLOYMENT: [A, P, O],

  CREATE_LOCATION: [A, P],
  EDIT_LOCATION: [A, P],
  DELETE_LOCATION: [A, P],
  VIEW_LOCATION: [A, P, O, V],

  CREATE_CATEGORY: [A, P],
  EDIT_CATEGORY: [A, P],
  DELETE_CATEGORY: [A, P],
  VIEW_CATEGORY: [A, P, O, V],

  CREATE_ITEM: [A, P, O],
  EDIT_ITEM: [A, P, O],
  DELETE_ITEM: [A, P],
  ASSIGN_ITEM: [A, P, O],
  VIEW_ITEM: [A, P, O, V],

  CREATE_TASK: [A, P, O],
  EDIT_TASK: [A, P, O],
  DELETE_TASK: [A, P],
  ASSIGN_TASK: [A, P, O],
  VIEW_TASK: [A, P, O, V],

  CREATE_TEMPLATE: [A, P],
  EDIT_TEMPLATE: [A, P],
  DELETE_TEMPLATE: [A, P],
  VIEW_TEMPLATE: [A, P, O, V],

  // Staffing (positions, shifts, assignments) and communications planning
  CREATE_POSITION: [A, P],
  EDIT_POSITION: [A, P],
  DELETE_POSITION: [A, P],
  VIEW_POSITION: [A, P, O, V],
  MANAGE_ASSIGNMENTS: [A, P],
  RECORD_CHECKIN_FOR_OTHERS: [A, P],
  MANAGE_CHANNELS: [A, P],
  MANAGE_COMMS_PLAN: [A, P],

  MANAGE_USERS: [A],
  INVITE_USERS: [A, P],
  CHANGE_USER_ROLE: [A],
  APPROVE_MEMBERSHIPS: [A],
});

/** @typedef {keyof typeof PERMISSIONS} Permission */

const ENTITY_KEYS = Object.freeze({
  deployment: 'DEPLOYMENT',
  location: 'LOCATION',
  category: 'CATEGORY',
  item: 'ITEM',
  template: 'TEMPLATE',
  task: 'TASK',
  position: 'POSITION',
});

/** @typedef {keyof typeof ENTITY_KEYS} EntityKind */

/**
 * @param {string|undefined|null} role
 * @param {Permission} permission
 */
export function hasPermission(role, permission) {
  if (!role || !permission) return false;
  const allowed = /** @type {readonly string[]|undefined} */ (PERMISSIONS[permission]);
  return Array.isArray(allowed) && allowed.includes(role);
}

const entityPermission = (verb) => (role, entity) => {
  const key = ENTITY_KEYS[entity];
  return key ? hasPermission(role, /** @type {Permission} */ (`${verb}_${key}`)) : false;
};

/** @type {(role: string|undefined|null, entity: EntityKind) => boolean} */
export const canCreate = entityPermission('CREATE');
/** @type {(role: string|undefined|null, entity: EntityKind) => boolean} */
export const canEdit = entityPermission('EDIT');
/** @type {(role: string|undefined|null, entity: EntityKind) => boolean} */
export const canDelete = entityPermission('DELETE');

/** Roles that plan deployments (used for "is this a coordinator" checks). */
export function isPlanner(role) {
  return role === ROLES.ADMIN || role === ROLES.PLANNER;
}

const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.PLANNER]: 'Planner',
  [ROLES.OPERATOR]: 'Operator',
  [ROLES.VIEWER]: 'Viewer',
  [ROLES.PENDING]: 'Pending Approval',
};

const ROLE_DESCRIPTIONS = {
  [ROLES.ADMIN]: 'Full access: members, roles, groups and all deployment data',
  [ROLES.PLANNER]: 'Coordinator: builds deployments, positions, assignments and comms plans; invites members',
  [ROLES.OPERATOR]: 'Field member: own profile and assignments, check-in, tasks and equipment',
  [ROLES.VIEWER]: 'Read-only access to the group’s deployments',
  [ROLES.PENDING]: 'Awaiting admin approval; very limited access until verified',
};

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export function getRoleDescription(role) {
  return ROLE_DESCRIPTIONS[role] || '';
}

/** Roles in display order, most privileged first. */
export const ROLE_ORDER = [ROLES.ADMIN, ROLES.PLANNER, ROLES.OPERATOR, ROLES.VIEWER, ROLES.PENDING];
