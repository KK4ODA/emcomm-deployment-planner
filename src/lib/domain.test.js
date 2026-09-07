import { describe, it, expect, vi } from 'vitest';
import { parseCoordinates, formatCoordinates, frameLocations, DEFAULT_MAP_CENTER } from './coordinates';
import { assigneesOf, isUnassigned, toggleAssignee, itemsAssignedTo, distinctAssignees } from './assignments';
import { compareOpenTasks, openTasksFor, summarizeTasks, groupTasksByStatus, tasksInDeployment } from './tasks';
import { deploymentStats, canAccessDeployment, visibleDeployments, locationItemStats } from './deployments';
import { buildTemplateStructure, templateCounts, applyTemplate } from './templates';
import { relativeTime, formatDate, toDateTimeLocal, fileTimestamp } from './time';
import { safeFileName } from './download';
import { normalizeCallsign } from './callsign';

describe('coordinates', () => {
  it('parses "lat, lng" in free text', () => {
    expect(parseCoordinates('40.7128, -74.0060')).toEqual([40.7128, -74.006]);
    expect(parseCoordinates('EOC at 33.75,-84.39 (parking lot)')).toEqual([33.75, -84.39]);
  });
  it('rejects out-of-range or missing values', () => {
    expect(parseCoordinates('123 Main St')).toBeNull();
    expect(parseCoordinates('91, 0')).toBeNull();
    expect(parseCoordinates('0, 181')).toBeNull();
    expect(parseCoordinates(null)).toBeNull();
  });
  it('formats with 5 decimals', () => {
    expect(formatCoordinates([33.7489954, -84.3879824])).toBe('33.74900, -84.38798');
  });
  it('frames sites', () => {
    expect(frameLocations([])).toEqual({ center: DEFAULT_MAP_CENTER, zoom: 4 });
    expect(frameLocations([{ coords: [10, 20] }]).zoom).toBe(12);
    expect(frameLocations([{ coords: [10, 20] }, { coords: [30, 40] }])).toEqual({ center: [20, 30], zoom: 9 });
  });
});

describe('assignments', () => {
  it('normalises legacy string and null values', () => {
    expect(assigneesOf({ assigned_to: ['A', 'B'] })).toEqual(['A', 'B']);
    expect(assigneesOf({ assigned_to: 'A' })).toEqual(['A']);
    expect(assigneesOf({ assigned_to: null })).toEqual([]);
    expect(assigneesOf({})).toEqual([]);
    expect(isUnassigned({ assigned_to: [] })).toBe(true);
  });
  it('toggles and queries call signs', () => {
    expect(toggleAssignee({ assigned_to: ['A'] }, 'B')).toEqual(['A', 'B']);
    expect(toggleAssignee({ assigned_to: ['A', 'B'] }, 'A')).toEqual(['B']);
    const items = [{ id: 1, assigned_to: ['A'] }, { id: 2, assigned_to: ['B', 'A'] }, { id: 3, assigned_to: [] }];
    expect(itemsAssignedTo(items, 'A').map(i => i.id)).toEqual([1, 2]);
    expect(itemsAssignedTo(items, undefined)).toEqual([]);
    expect([...distinctAssignees(items)].sort()).toEqual(['A', 'B']);
  });
});

describe('tasks', () => {
  const tasks = [
    { id: 'a', status: 'pending', priority: 'low', assigned_to_call_sign: 'X', deployment_location_id: 'l1' },
    { id: 'b', status: 'in_progress', priority: 'low', assigned_to_call_sign: 'X', deployment_location_id: 'l1', due_date: '2026-06-02' },
    { id: 'c', status: 'pending', priority: 'high', assigned_to_call_sign: 'X', deployment_location_id: 'l2' },
    { id: 'd', status: 'completed', priority: 'high', assigned_to_call_sign: 'X', deployment_location_id: 'l1' },
    { id: 'e', status: 'in_progress', priority: 'low', assigned_to_call_sign: 'Y', deployment_location_id: 'l1', due_date: '2026-06-01' },
  ];
  it('orders open tasks: in progress, then priority, then due date', () => {
    expect([...tasks].sort(compareOpenTasks).map(t => t.id)).toEqual(['e', 'b', 'c', 'a', 'd']);
  });
  it('lists open tasks for a call sign', () => {
    expect(openTasksFor(tasks, 'X').map(t => t.id)).toEqual(['b', 'c', 'a']);
    expect(openTasksFor(tasks, null)).toEqual([]);
  });
  it('summarises and groups', () => {
    expect(summarizeTasks(tasks)).toEqual({ total: 5, pending: 2, in_progress: 2, completed: 1, percent: 20 });
    expect(summarizeTasks([]).percent).toBe(0);
    const groups = groupTasksByStatus(tasks);
    expect(groups.pending.length).toBe(2);
    expect(groups.completed.map(t => t.id)).toEqual(['d']);
  });
  it('scopes tasks to a deployment and site', () => {
    const locations = [{ id: 'l1' }];
    expect(tasksInDeployment(tasks, locations).length).toBe(4);
    expect(tasksInDeployment(tasks, [{ id: 'l1' }, { id: 'l2' }], 'l2').map(t => t.id)).toEqual(['c']);
  });
});

describe('deployments', () => {
  const locations = [{ id: 'l1', deployment_id: 'd1' }, { id: 'l2', deployment_id: 'd2' }];
  const items = [
    { id: 'i1', deployment_location_id: 'l1', assigned_to: ['A'] },
    { id: 'i2', deployment_location_id: 'l1', assigned_to: [] },
    { id: 'i3', deployment_location_id: 'l2', assigned_to: ['B'] },
  ];
  it('computes stats per deployment', () => {
    const stats = deploymentStats({ deploymentId: 'd1', categories: [{ deployment_id: 'd1' }], locations, items, users: [{ call_sign: 'A' }, {}] });
    expect(stats).toEqual({ categories: 1, sites: 1, items: 2, assigned: 1, unassigned: 1, members: 1 });
  });
  it('gates access by ARES group unless admin', () => {
    const dep = { id: 'd1', ares_group_id: 'g1' };
    expect(canAccessDeployment({ app_role: 'admin' }, dep)).toBe(true);
    expect(canAccessDeployment({ app_role: 'viewer', ares_group_ids: ['g1'] }, dep)).toBe(true);
    expect(canAccessDeployment({ app_role: 'viewer', ares_group_ids: ['g2'] }, dep)).toBe(false);
    expect(canAccessDeployment(null, dep)).toBe(false);
    expect(visibleDeployments({ app_role: 'operator', ares_group_ids: ['g1'] }, [dep, { id: 'd2', ares_group_id: 'g9' }])).toEqual([dep]);
  });
  it('computes per-site item stats', () => {
    expect(locationItemStats(items, 'l1')).toEqual({ itemCount: 2, assigneeCount: 1, unassignedCount: 1 });
  });
});

describe('templates', () => {
  const categories = [{ id: 'c1', name: 'Radios', color: 'sky', description: null, sort_order: 0 }];
  const locations = [{ id: 'l1', name: 'EOC', description: 'x', address: '1,2', contact_person: 'KK4ODA', sort_order: 1 }];
  const items = [{ id: 'i1', name: 'HT', description: null, category_id: 'c1', deployment_location_id: 'l1', quantity: 2, priority: 'essential', assigned_to: ['KK4ODA'] }];

  it('captures structure without ids or assignments', () => {
    const s = buildTemplateStructure({ categories, locations, items });
    expect(s.items[0]).toEqual({ name: 'HT', description: null, category_name: 'Radios', location_name: 'EOC', quantity: 2, priority: 'essential' });
    expect(JSON.stringify(s)).not.toContain('assigned_to');
    expect(templateCounts(s)).toEqual({ category_count: 1, item_count: 1, location_count: 1 });
  });

  it('re-creates structure inside a deployment, linking by name', async () => {
    const repos = {
      categories: { create: vi.fn(async (d) => ({ ...d, id: `cat-${d.name}` })) },
      locations: { create: vi.fn(async (d) => ({ ...d, id: `loc-${d.name}` })) },
      items: { create: vi.fn(async (d) => ({ ...d, id: 'item' })) },
    };
    const structure = buildTemplateStructure({ categories, locations, items });
    structure.items.push({ name: 'Orphan', description: null, category_name: 'Missing', location_name: 'Nowhere', quantity: 1, priority: 'optional' });
    const result = await applyTemplate(repos, 'dep-9', structure);
    expect(repos.categories.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Radios', deployment_id: 'dep-9' }));
    expect(repos.items.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ category_id: 'cat-Radios', deployment_location_id: 'loc-EOC' }));
    expect(repos.items.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ category_id: null, deployment_location_id: null }));
    expect(result).toEqual({ categories: 1, locations: 1, items: 2 });
  });
});

describe('time and files', () => {
  it('formats relative time', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    expect(relativeTime('2026-05-05T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-05-05T11:55:00Z', now)).toBe('5m ago');
    expect(relativeTime('2026-05-05T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-05-03T12:00:00Z', now)).toBe('2d ago');
    expect(relativeTime('garbage', now)).toBe('');
  });
  it('formats DATE columns without timezone drift', () => {
    expect(formatDate('2026-05-05')).toBe('May 5, 2026');
    expect(formatDate(null)).toBe('');
  });
  it('produces datetime-local values and file timestamps', () => {
    expect(toDateTimeLocal('2026-05-05T18:42:11.000Z')).toMatch(/^2026-05-0\dT\d\d:\d\d$/);
    expect(fileTimestamp(new Date('2026-05-05T18:42:11.342Z'))).toBe('2026-05-05T18-42-11');
    expect(safeFileName('Hurricane Response 2026!')).toBe('Hurricane_Response_2026_');
  });
  it('normalises call signs', () => {
    expect(normalizeCallsign(' kk4oda ')).toBe('KK4ODA');
  });
});
