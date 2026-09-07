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
  it('counts tasks and comms-plan channels only for this deployment', () => {
    const r = deploymentReadiness({
      ...base,
      items: [{ id: 'i1', deployment_location_id: 'l1', assigned_to: ['A'] }],
      tasks: [
        { deployment_location_id: 'l1', status: 'completed' },
        { deployment_location_id: 'l2', status: 'pending' },
        { deployment_location_id: 'other', status: 'pending' },
      ],
      planRows: [{ deployment_id: 'dep' }, { deployment_id: 'dep' }, { deployment_id: 'x' }],
    });
    expect(r).toMatchObject({ sites: 2, items: 1, unassigned: 0, tasksTotal: 2, tasksCompleted: 1, planChannels: 2, hasCommsPlan: true, ready: false });
  });
  it('is ready when everything is assigned, staffed, done and planned', () => {
    const args = {
      ...base,
      items: [{ id: 'i1', deployment_location_id: 'l1', assigned_to: ['A'] }],
      tasks: [{ deployment_location_id: 'l1', status: 'completed' }],
      planRows: [{ deployment_id: 'dep' }],
      positions: [{ id: 'p1', deployment_id: 'dep', headcount: 1, requirements: [] }],
      shifts: [{ id: 's1', deployment_id: 'dep', position_id: 'p1', starts_at: '2026-03-01T05:00:00Z', ends_at: '2026-03-01T14:00:00Z' }],
      assignments: [{ shift_id: 's1', deployment_id: 'dep', user_id: 'u1', status: 'accepted' }],
    };
    expect(deploymentReadiness(args)).toMatchObject({ slots: 1, slotsCovered: 1, slotsOpen: 0, ready: true });
    expect(deploymentReadiness({ ...args, assignments: [] })).toMatchObject({ slotsOpen: 1, ready: false });
    expect(deploymentReadiness({ ...args, planRows: [] }).ready).toBe(false);
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
    expect(counts).toMatchObject({ categories: 1, locations: 1, items: 1, tasks: 1, positions: 0, channels: 0 });
    expect(repos.locations.create).toHaveBeenCalledWith(expect.objectContaining({ deployment_id: deployment.id, assigned_call_signs: ['A'] }));
    const item = repos.items.create.mock.calls[0][0];
    expect(item.category_id).toBe('cat-2');
    expect(item.deployment_location_id).toBe('loc-3');
    expect(item.assigned_to).toEqual(['A']);
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', due_date: null, assigned_to_call_sign: 'A', deployment_location_id: 'loc-3', deployment_id: deployment.id }));
  });

  it('copies periods, positions, shifts, offers and the comms plan, moved to a new date', async () => {
    const repos = fakeRepos();
    let n = 100;
    const mk = (name) => ({ create: vi.fn(async (data) => ({ id: `${name}-${++n}`, ...data })), update: vi.fn(async () => ({})) });
    Object.assign(repos, { operationalPeriods: mk('per'), positions: mk('pos'), shifts: mk('sh'), assignments: mk('as'), commsPlans: mk('plan'), commsPlanChannels: mk('row') });
    const full = {
      ...data,
      source: { ...data.source, starts_at: '2026-03-01T05:00:00Z', ends_at: '2026-03-01T15:00:00Z' },
      periods: [{ id: 'op1', sequence: 1, label: 'Race day', starts_at: '2026-03-01T05:00:00Z', ends_at: '2026-03-01T15:00:00Z' }],
      positions: [
        { id: 'p1', name: 'Net Control', site_id: 'L', headcount: 1, requirements: [], sort_order: 0 },
        { id: 'p2', name: 'AID 12', supervisor_position_id: 'p1', headcount: 1, requirements: [{ kind: 'capability', value: 'vhf_voice' }], sort_order: 1 },
      ],
      shifts: [{ id: 's1', position_id: 'p2', operational_period_id: 'op1', starts_at: '2026-03-01T05:15:00Z', ends_at: '2026-03-01T14:00:00Z', muster_at: '2026-03-01T05:00:00Z' }],
      assignments: [{ shift_id: 's1', user_id: 'u1', status: 'released' }, { shift_id: 's1', user_id: 'u2', status: 'declined' }],
      plans: [{ id: 'cp', name: 'Plan', operational_period_id: 'op1', special_instructions: 'TAC only' }],
      planRows: [{ id: 'r1', comms_plan_id: 'cp', deployment_id: 'src', channel_name: 'W4DOC', rx_freq: 146.82, condition_level: 1, path_role: 'primary', created_at: 'x' }],
    };
    const { deployment, counts, shiftedDays } = await duplicateDeployment(repos, full, { name: 'PAM 2027', newStartsAt: '2027-02-28T05:00:00Z', createTask: vi.fn() });
    expect(shiftedDays).toBe(364);
    expect(deployment.starts_at).toBe('2027-02-28T05:00:00.000Z');
    expect(deployment.start_date).toBe('2027-02-28');
    expect(counts).toMatchObject({ periods: 1, positions: 2, shifts: 1, assignments: 1, channels: 1 });
    expect(repos.shifts.create.mock.calls[0][0]).toMatchObject({ starts_at: '2027-02-28T05:15:00.000Z', muster_at: '2027-02-28T05:00:00.000Z' });
    expect(repos.assignments.create.mock.calls[0][0]).toMatchObject({ user_id: 'u1', status: 'offered' });
    expect(repos.positions.update).toHaveBeenCalledWith(expect.any(String), { supervisor_position_id: expect.any(String) });
    const row = repos.commsPlanChannels.create.mock.calls[0][0];
    expect(row).toMatchObject({ channel_name: 'W4DOC', deployment_id: deployment.id });
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('created_at');
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
