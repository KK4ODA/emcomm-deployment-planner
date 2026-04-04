// Role-based permissions system
export const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  PENDING: 'pending'
};

export const PERMISSIONS = {
  // Deployment permissions
  CREATE_DEPLOYMENT: [ROLES.ADMIN],
  EDIT_DEPLOYMENT: [ROLES.ADMIN, ROLES.OPERATOR],
  DELETE_DEPLOYMENT: [ROLES.ADMIN],
  VIEW_DEPLOYMENT: [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  EXPORT_DEPLOYMENT: [ROLES.ADMIN, ROLES.OPERATOR],
  
  // Location permissions
  CREATE_LOCATION: [ROLES.ADMIN],
  EDIT_LOCATION: [ROLES.ADMIN, ROLES.OPERATOR],
  DELETE_LOCATION: [ROLES.ADMIN],
  VIEW_LOCATION: [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  
  // Category permissions
  CREATE_CATEGORY: [ROLES.ADMIN],
  EDIT_CATEGORY: [ROLES.ADMIN, ROLES.OPERATOR],
  DELETE_CATEGORY: [ROLES.ADMIN],
  VIEW_CATEGORY: [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  
  // Item permissions
  CREATE_ITEM: [ROLES.ADMIN, ROLES.OPERATOR],
  EDIT_ITEM: [ROLES.ADMIN, ROLES.OPERATOR],
  DELETE_ITEM: [ROLES.ADMIN],
  ASSIGN_ITEM: [ROLES.ADMIN, ROLES.OPERATOR],
  VIEW_ITEM: [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  
  // Task permissions
  CREATE_TASK: [ROLES.ADMIN, ROLES.OPERATOR],
  EDIT_TASK: [ROLES.ADMIN, ROLES.OPERATOR],
  DELETE_TASK: [ROLES.ADMIN],
  ASSIGN_TASK: [ROLES.ADMIN, ROLES.OPERATOR],
  VIEW_TASK: [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  
  // Template permissions
  CREATE_TEMPLATE: [ROLES.ADMIN],
  EDIT_TEMPLATE: [ROLES.ADMIN],
  DELETE_TEMPLATE: [ROLES.ADMIN],
  VIEW_TEMPLATE: [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  
  // User management permissions
  MANAGE_USERS: [ROLES.ADMIN],
  INVITE_USERS: [ROLES.ADMIN, ROLES.OPERATOR],
  CHANGE_USER_ROLE: [ROLES.ADMIN]
};

export function hasPermission(userRole, permission) {
  if (!userRole || !permission) return false;
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles && allowedRoles.includes(userRole);
}

export function canCreate(userRole, entity) {
  const permissionMap = {
    'deployment': 'CREATE_DEPLOYMENT',
    'location': 'CREATE_LOCATION',
    'category': 'CREATE_CATEGORY',
    'item': 'CREATE_ITEM',
    'template': 'CREATE_TEMPLATE',
    'task': 'CREATE_TASK'
  };
  return hasPermission(userRole, permissionMap[entity]);
}

export function canEdit(userRole, entity) {
  const permissionMap = {
    'deployment': 'EDIT_DEPLOYMENT',
    'location': 'EDIT_LOCATION',
    'category': 'EDIT_CATEGORY',
    'item': 'EDIT_ITEM',
    'template': 'EDIT_TEMPLATE',
    'task': 'EDIT_TASK'
  };
  return hasPermission(userRole, permissionMap[entity]);
}

export function canDelete(userRole, entity) {
  const permissionMap = {
    'deployment': 'DELETE_DEPLOYMENT',
    'location': 'DELETE_LOCATION',
    'category': 'DELETE_CATEGORY',
    'item': 'DELETE_ITEM',
    'template': 'DELETE_TEMPLATE',
    'task': 'DELETE_TASK'
  };
  return hasPermission(userRole, permissionMap[entity]);
}

export function getRoleLabel(role) {
  const labels = {
    [ROLES.ADMIN]: 'Admin',
    [ROLES.OPERATOR]: 'Operator',
    [ROLES.VIEWER]: 'Viewer',
    [ROLES.PENDING]: 'Pending Approval'
  };
  return labels[role] || role;
}

export function getRoleDescription(role) {
  const descriptions = {
    [ROLES.ADMIN]: 'Full access - can manage deployments, users, and all data',
    [ROLES.OPERATOR]: 'Can edit deployments, manage items and tasks, invite users',
    [ROLES.VIEWER]: 'Read-only access - can view all data but cannot make changes',
    [ROLES.PENDING]: 'Awaiting admin approval - very limited access until verified'
  };
  return descriptions[role] || '';
}