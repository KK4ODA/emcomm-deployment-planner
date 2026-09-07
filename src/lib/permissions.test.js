import { describe, it, expect } from 'vitest';
import { ROLES, ROLE_ORDER, hasPermission, canCreate, canEdit, canDelete, isPlanner, getRoleLabel, getRoleDescription } from './permissions';

describe('role permissions', () => {
  it('admin can do everything on deployments', () => {
    expect(canCreate(ROLES.ADMIN, 'deployment')).toBe(true);
    expect(canEdit(ROLES.ADMIN, 'deployment')).toBe(true);
    expect(canDelete(ROLES.ADMIN, 'deployment')).toBe(true);
  });

  it('planner plans but cannot delete deployments or manage members', () => {
    expect(canCreate(ROLES.PLANNER, 'deployment')).toBe(true);
    expect(canEdit(ROLES.PLANNER, 'deployment')).toBe(true);
    expect(canDelete(ROLES.PLANNER, 'deployment')).toBe(false);
    expect(canCreate(ROLES.PLANNER, 'position')).toBe(true);
    expect(hasPermission(ROLES.PLANNER, 'MANAGE_ASSIGNMENTS')).toBe(true);
    expect(hasPermission(ROLES.PLANNER, 'MANAGE_COMMS_PLAN')).toBe(true);
    expect(hasPermission(ROLES.PLANNER, 'MANAGE_USERS')).toBe(false);
    expect(hasPermission(ROLES.PLANNER, 'APPROVE_MEMBERSHIPS')).toBe(false);
    expect(hasPermission(ROLES.PLANNER, 'INVITE_USERS')).toBe(true);
  });

  it('operator does field work but does not plan', () => {
    expect(canCreate(ROLES.OPERATOR, 'deployment')).toBe(false);
    expect(canEdit(ROLES.OPERATOR, 'deployment')).toBe(false);
    expect(canEdit(ROLES.OPERATOR, 'location')).toBe(false);
    expect(canCreate(ROLES.OPERATOR, 'position')).toBe(false);
    expect(canCreate(ROLES.OPERATOR, 'item')).toBe(true);
    expect(canCreate(ROLES.OPERATOR, 'task')).toBe(true);
    expect(canDelete(ROLES.OPERATOR, 'item')).toBe(false);
    expect(canDelete(ROLES.OPERATOR, 'task')).toBe(false);
    expect(hasPermission(ROLES.OPERATOR, 'MANAGE_ASSIGNMENTS')).toBe(false);
  });

  it('viewer and pending are read-only', () => {
    for (const role of [ROLES.VIEWER, ROLES.PENDING]) {
      for (const entity of /** @type {const} */ (['deployment', 'location', 'category', 'item', 'task', 'template', 'position'])) {
        expect(canCreate(role, entity)).toBe(false);
        expect(canEdit(role, entity)).toBe(false);
        expect(canDelete(role, entity)).toBe(false);
      }
    }
  });

  it('only admins manage users and approve memberships; planners may invite', () => {
    expect(hasPermission(ROLES.ADMIN, 'MANAGE_USERS')).toBe(true);
    expect(hasPermission(ROLES.ADMIN, 'APPROVE_MEMBERSHIPS')).toBe(true);
    expect(hasPermission(ROLES.OPERATOR, 'MANAGE_USERS')).toBe(false);
    expect(hasPermission(ROLES.OPERATOR, 'INVITE_USERS')).toBe(false);
    expect(hasPermission(ROLES.VIEWER, 'INVITE_USERS')).toBe(false);
  });

  it('identifies planning roles', () => {
    expect(isPlanner(ROLES.ADMIN)).toBe(true);
    expect(isPlanner(ROLES.PLANNER)).toBe(true);
    expect(isPlanner(ROLES.OPERATOR)).toBe(false);
    expect(isPlanner(undefined)).toBe(false);
  });

  it('rejects unknown roles, permissions and entities', () => {
    expect(hasPermission(undefined, 'MANAGE_USERS')).toBe(false);
    expect(hasPermission('admin', /** @type {any} */ ('NOT_A_PERMISSION'))).toBeFalsy();
    expect(canCreate('admin', /** @type {any} */ ('spaceship'))).toBeFalsy();
  });

  it('provides labels and descriptions for every role, in order', () => {
    for (const role of Object.values(ROLES)) {
      expect(getRoleLabel(role)).toBeTruthy();
      expect(getRoleDescription(role)).toBeTruthy();
    }
    expect(getRoleLabel(ROLES.PENDING)).toBe('Pending Approval');
    expect(ROLE_ORDER).toEqual(['admin', 'planner', 'operator', 'viewer', 'pending']);
  });
});
