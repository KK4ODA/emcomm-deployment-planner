/**
 * Role-based permissions. The server enforces the same rules through
 * Supabase Row-Level Security; this copy only drives what the UI offers.
 */
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  PENDING: 'pending',
});

/** @typedef {typeof ROLES[keyof typeof ROLES]} Role */

const A = ROLES.ADMIN;
const O = ROLES.OPERATOR;
const V = ROLES.VIEWER;

export const PERMISSIONS = Object.freeze({
  CREATE_DEPLOYMENT: [A],
  EDIT_DEPLOYMENT: [A, O],
  DELETE_DEPLOYMENT: [A],
  VIEW_DEPLOYMENT: [A, O, V],
  EXPORT_DEPLOYMENT: [A, O],

  CREATE_LOCATION: [A],
  EDIT_LOCATION: [A, O],
  DELETE_LOCATION: [A],
  VIEW_LOCATION: [A, O, V],

  CREATE_CATEGORY: [A],
  EDIT_CATEGORY: [A, O],
  DELETE_CATEGORY: [A],
  VIEW_CATEGORY: [A, O, V],

  CREATE_ITEM: [A, O],
  EDIT_ITEM: [A, O],
  DELETE_ITEM: [A],
  ASSIGN_ITEM: [A, O],
  VIEW_ITEM: [A, O, V],

  CREATE_TASK: [A, O],
  EDIT_TASK: [A, O],
  DELETE_TASK: [A],
  ASSIGN_TASK: [A, O],
  VIEW_TASK: [A, O, V],

  CREATE_TEMPLATE: [A],
  EDIT_TEMPLATE: [A],
  DELETE_TEMPLATE: [A],
  VIEW_TEMPLATE: [A, O, V],

  MANAGE_USERS: [A],
  INVITE_USERS: [A, O],
  CHANGE_USER_ROLE: [A],
});

/** @typedef {keyof typeof PERMISSIONS} Permission */

const ENTITY_KEYS = Object.freeze({
  deployment: 'DEPLOYMENT',
  location: 'LOCATION',
  category: 'CATEGORY',
  item: 'ITEM',
  template: 'TEMPLATE',
  task: 'TASK',
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

const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.OPERATOR]: 'Operator',
  [ROLES.VIEWER]: 'Viewer',
  [ROLES.PENDING]: 'Pending Approval',
};

const ROLE_DESCRIPTIONS = {
  [ROLES.ADMIN]: 'Full access: manages deployments, members and all data',
  [ROLES.OPERATOR]: 'Edits deployments, manages items and tasks, invites members',
  [ROLES.VIEWER]: 'Read-only access to all deployment data',
  [ROLES.PENDING]: 'Awaiting admin approval; very limited access until verified',
};

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export function getRoleDescription(role) {
  return ROLE_DESCRIPTIONS[role] || '';
}

/** Roles in display order, most privileged first. */
export const ROLE_ORDER = [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER, ROLES.PENDING];
