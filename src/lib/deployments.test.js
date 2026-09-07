import { describe, it, expect, vi } from 'vitest';
import { sortDeployments, deploymentReadiness, missingSiteOperators, duplicateDeployment, isArchived } from './deployments';

const d = (id, status, created_at) => ({ id, status, created_at, name: id });

describe('sortDeployments', () => {
  it('orders active, planning, completed, archived, newest first within a status', () => {
    const list = [
      d('old-planning', 'planning', '2026-01-01'),
      d('archived', 'archived', '2026-05-01'),
      d('new-planning', 'planning', '2026-03-01'),
      d('completed', 'completed', '2026-04-01'),
      d('active', 'active', '2025-01-01'),
    ];
    expect(sortDeployments(list).map(x => x.id)).toEqual(['active', 'new-planning', 'old-planning', 'completed', 'archived']);
  });
  it('does not mutate the input', () => {
    const list = [d('b', 'archived'), d('a', 'active')];
    sortDeployments(list);
    expect(list[0].id).toBe('b');
  });
  it('detects archived', () => {
    expect(isArchived(d('x', 'archived'))).toBe(true);
    expect(isArchived(d('x', 'active'))).toBe(false);
    expect(isArchived(null)).toBe(false);
  });
});

describe('deploymentReadiness', () => {
  const base = {
    deploymentId: 'dep',
    categories: [{ id: 'c1', deployment_id: 'dep' }],
    locations: [{ id: 'l1', deployment_id: 'dep' }, { id: 'l2', deployment_id: 'dep' }, { id: 'other', deployment_id: 'x' }],
    users: [{ call_sign: 'A' }],
  };
  it('counts tasks and ICS 205 forms only for the deployment sites', () => {
    const r = deploymentReadiness({
      ...base,
      items: [{ id: 'i1', deployment_location_id: 'l1', assigned_to: ['A'] }],
      tasks: [
        { deployment_location_id: 'l1', status: 'completed' },
        { deployment_location_id: 'l2', status: 'pending' },
        { deployment_location_id: 'other', status: 'pending' },
      ],
      forms: [{ deployment_location_id: 'l1' }, { deployment_location_id: 'l1' }, { deployment_location_id: 'other' }],
    });
    expect(r).toMatchObject({ sites: 2, items: 1, unassigned: 0, tasksTotal: 2, tasksCompleted: 1, sitesWithIcs205: 1, ready: false });
  });
  it('is ready when everything is assigned, done and planned', () => {
    const r = deploymentReadiness({
      ...base,
      items: [{ id: 'i1', deployment_location_id: 'l1', assigned_to: ['A'] }],
      tasks: [{ deployment_location_id: 'l1', status: 'completed' }],
      forms: [{ deployment_location_id: 'l1' }, { deployment_location_id: 'l2' }],
    });
    expect(r.ready).toBe(true);
  });
  it('is never ready without sites', () => {
    expect(deploymentReadiness({ ...base, locations: [], items: [] }).ready).toBe(false);
  });
});

describe('missingSiteOperators', () => {
  const site = { id: 'l1', assigned_call_signs: ['A'] };
  it('finds item and task assignees missing from the roster, sorted and unique', () => {
    const items = [
      { deployment_location_id: 'l1', assigned_to: ['A', 'C'] },
      { deployment_location_id: 'l1', assigned_to: 'B' },
      { deployment_location_id: 'l2', assigned_to: ['Z'] },
    ];
    const tasks = [
      { deployment_location_id: 'l1', assigned_to_call_sign: 'C' },
      { deployment_location_id: 'l1', assigned_to_call_sign: null },
      { deployment_location_id: 'l2', assigned_to_call_sign: 'Y' },
    ];
    expect(missingSiteOperators(site, items, tasks)).toEqual(['B', 'C']);
  });
  it('returns nothing when the roster covers everyone', () => {
    expect(missingSiteOperators(site, [{ deployment_location_id: 'l1', assigned_to: ['A'] }], [])).toEqual([]);
    expect(missingSiteOperators({ id: 'l9' }, [], [])).toEqual([]);
  });
});

describe('duplicateDeployment', () => {
  function fakeRepos() {
    let n = 0;
    const mk = (name) => ({ create: vi.fn(async (data) => ({ id: `${name}-${++n}`, ...data })) });
    return { deployments: mk('dep'), locations: mk('loc'), categories: mk('cat'), items: mk('item') };
  }
  const data = {
    source: { id: 'src', name: 'Field Day', description: 'd', location: 'County', ares_group_id: 'g', status: 'completed', start_date: '2026-06-01' },
    locations: [{ id: 'L', name: 'EOC', address: 'x', assigned_call_signs: ['A'], sort_order: 1 }],
    categories: [{ id: 'C', name: 'Radios', color: 'sky', sort_order: 0 }],
    items: [{ id: 'I', name: 'HT', category_id: 'C', deployment_location_id: 'L', assigned_to: ['A'], quantity: 2, priority: 'essential', sort_order: 0 }],
    tasks: [{ name: 'Raise mast', deployment_location_id: 'L', status: 'completed', priority: 'high', assigned_to_call_sign: 'A', due_date: '2026-06-01' }],
  };

  it('copies structure with assignments and remaps ids', async () => {
    const repos = fakeRepos();
    const createTask = vi.fn(async (t) => t);
    const { deployment, counts } = await duplicateDeployment(repos, data, { name: 'Field Day 2027', createdBy: 'u', createTask });

    expect(deployment).toMatchObject({ name: 'Field Day 2027', status: 'planning', start_date: null, end_date: null, ares_group_id: 'g', created_by: 'u' });
    expect(counts).toEqual({ categories: 1, locations: 1, items: 1, tasks: 1 });
    expect(repos.locations.create).toHaveBeenCalledWith(expect.objectContaining({ deployment_id: deployment.id, assigned_call_signs: ['A'] }));
    const item = repos.items.create.mock.calls[0][0];
    expect(item.category_id).toBe('cat-2');
    expect(item.deployment_location_id).toBe('loc-3');
    expect(item.assigned_to).toEqual(['A']);
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', due_date: null, assigned_to_call_sign: 'A', deployment_location_id: 'loc-3', deployment_id: deployment.id }));
  });

  it('can strip assignments and skip tasks', async () => {
    const repos = fakeRepos();
    const createTask = vi.fn();
    const { counts } = await duplicateDeployment(repos, data, { name: 'Blank', withAssignments: false, withTasks: false, createTask });
    expect(repos.locations.create.mock.calls[0][0].assigned_call_signs).toEqual([]);
    expect(repos.items.create.mock.calls[0][0].assigned_to).toEqual([]);
    expect(createTask).not.toHaveBeenCalled();
    expect(counts.tasks).toBe(0);
  });
});
