import { describe, it, expect } from 'vitest';
import { ROLES, hasPermission, canCreate, canEdit, canDelete, getRoleLabel, getRoleDescription } from './permissions';

describe('role permissions', () => {
  it('admin can do everything on deployments', () => {
    expect(canCreate(ROLES.ADMIN, 'deployment')).toBe(true);
    expect(canEdit(ROLES.ADMIN, 'deployment')).toBe(true);
    expect(canDelete(ROLES.ADMIN, 'deployment')).toBe(true);
  });

  it('operator can edit but not create or delete deployments', () => {
    expect(canCreate(ROLES.OPERATOR, 'deployment')).toBe(false);
    expect(canEdit(ROLES.OPERATOR, 'deployment')).toBe(true);
    expect(canDelete(ROLES.OPERATOR, 'deployment')).toBe(false);
  });

  it('operator can create items and tasks but not delete them', () => {
    expect(canCreate(ROLES.OPERATOR, 'item')).toBe(true);
    expect(canCreate(ROLES.OPERATOR, 'task')).toBe(true);
    expect(canDelete(ROLES.OPERATOR, 'item')).toBe(false);
    expect(canDelete(ROLES.OPERATOR, 'task')).toBe(false);
  });

  it('viewer and pending are read-only', () => {
    for (const role of [ROLES.VIEWER, ROLES.PENDING]) {
      for (const entity of /** @type {const} */ (['deployment', 'location', 'category', 'item', 'task', 'template'])) {
        expect(canCreate(role, entity)).toBe(false);
        expect(canEdit(role, entity)).toBe(false);
        expect(canDelete(role, entity)).toBe(false);
      }
    }
  });

  it('only admins manage users; operators may invite', () => {
    expect(hasPermission(ROLES.ADMIN, 'MANAGE_USERS')).toBe(true);
    expect(hasPermission(ROLES.OPERATOR, 'MANAGE_USERS')).toBe(false);
    expect(hasPermission(ROLES.OPERATOR, 'INVITE_USERS')).toBe(true);
    expect(hasPermission(ROLES.VIEWER, 'INVITE_USERS')).toBe(false);
  });

  it('rejects unknown roles, permissions and entities', () => {
    expect(hasPermission(undefined, 'MANAGE_USERS')).toBe(false);
    expect(hasPermission('admin', /** @type {any} */ ('NOT_A_PERMISSION'))).toBeFalsy();
    expect(canCreate('admin', /** @type {any} */ ('spaceship'))).toBeFalsy();
  });

  it('provides labels and descriptions for every role', () => {
    for (const role of Object.values(ROLES)) {
      expect(getRoleLabel(role)).toBeTruthy();
      expect(getRoleDescription(role)).toBeTruthy();
    }
    expect(getRoleLabel(ROLES.PENDING)).toBe('Pending Approval');
  });
});
