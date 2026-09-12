import { describe, it, expect, vi } from 'vitest';
import { buildBundle, parseBundle, importBundle, bundleCounts, BUNDLE_FORMAT } from './deploymentBundle';

function fakeRepos() {
  let n = 0;
  const mk = () => ({ create: vi.fn(async (data) => ({ id: `id-${++n}`, ...data })), update: vi.fn(async () => ({})) });
  return { deployments: mk(), locations: mk(), categories: mk(), items: mk(), tasks: mk(), operationalPeriods: mk(), positions: mk(), shifts: mk(), channels: mk(), commsPlans: mk(), commsPlanChannels: mk(), mapLayers: mk(), objectives: mk(), safetyChecklists: mk() };
}

const parts = {
  source: { id: 'd1', name: 'Marathon 2027', profile: 'public_service', ares_group_id: 'g1', served_agency: 'ATC', starts_at: '2027-03-07T09:00:00.000Z', ends_at: '2027-03-07T20:00:00.000Z', created_by: 'u1' },
  periods: [{ id: 'op1', sequence: 1, label: 'Race day', starts_at: '2027-03-07T09:00:00.000Z', ends_at: '2027-03-07T20:00:00.000Z' }],
  locations: [{ id: 'l1', name: 'MACC', site_type: 'net_control', lat: 33.75, lon: -84.39, sort_order: 1, assigned_call_signs: ['KK4ODA'] }, { id: 'l2', name: 'Aid 20', sort_order: 2 }],
  categories: [{ id: 'c1', name: 'Kit', color: 'amber', sort_order: 1 }],
  items: [{ id: 'i1', name: 'HT', category_id: 'c1', deployment_location_id: 'l2', quantity: 1, priority: 'essential', assigned_to: ['KK4ODA'] }],
  tasks: [{ id: 't1', name: 'Test antenna', deployment_location_id: 'l1', priority: 'high', due_date: '2027-02-26', assigned_to_call_sign: 'KK4ODA' }],
  positions: [
    { id: 'p1', name: 'NCS RACE', tactical_callsign: 'NCS RACE', position_type: 'net_control', net: 'RACE', headcount: 2, site_id: 'l1', requirements: [{ kind: 'capability', value: 'net_control', mandatory: true }], sort_order: 1 },
    { id: 'p2', name: 'AID MILE 20', tactical_callsign: 'AID 20', position_type: 'aid_station', net: 'RACE', site_id: 'l2', supervisor_position_id: 'p1', sort_order: 2, open_signup: false },
  ],
  shifts: [{ id: 's1', position_id: 'p2', operational_period_id: 'op1', starts_at: '2027-03-07T10:45:00.000Z', ends_at: '2027-03-07T18:30:00.000Z', muster_at: '2027-03-07T10:45:00.000Z', headcount: 2 }],
  assignments: [{ id: 'a1', shift_id: 's1', user_id: 'u1', status: 'accepted' }],
  channels: [{ id: 'ch1', ares_group_id: 'g1', name: 'RACE net repeater', config: 'repeater', rx_freq: 146.82, tx_freq: 146.22, tx_tone: '146.2', mode: 'A', sort_order: 1 }, { id: 'ch9', ares_group_id: 'g1', name: 'Unused', rx_freq: 147.0 }],
  plans: [{ id: 'cp1', name: 'Plan', operational_period_id: 'op1', prepared_by_name: 'Facundo', prepared_by_position: 'COML', special_instructions: 'Program everything' }],
  planRows: [{ id: 'r1', comms_plan_id: 'cp1', channel_id: 'ch1', channel_name: 'RACE net repeater', rx_freq: 146.82, tx_freq: 146.22, tx_tone: '146.2', mode: 'A', net: 'RACE', condition_level: 1, path_role: 'primary', sort_order: 1, created_at: 'x' }],
  layers: [{ id: 'm1', name: 'Course', kind: 'route', color: '#00f', geojson: { type: 'FeatureCollection', features: [] }, sort_order: 0, created_by: 'u1' }],
  objectives: [{ id: 'o1', title: 'Six bands', points: 10, status: 'done', sort_order: 1 }, { id: 'o2', title: 'Dropped one', status: 'dropped' }],
  safety: { id: 'sc1', template_name: 'ARRL Field Day safety check list', items: [{ id: 's1', text: 'Fuel stored safely', state: 'ok', note: 'yes' }], notes: 'Watch the guys', signed_by: 'u1' },
};

describe('deployment bundle', () => {
  it('builds a file without people or ids, keyed for re-import', () => {
    const b = buildBundle(parts, { appVersion: '2.5.9', groupName: 'DeKalb ARES', exportedBy: 'KK4ODA' });
    expect(b.format).toBe(BUNDLE_FORMAT);
    expect(JSON.stringify(b)).not.toMatch(/"id"|u1|assigned_to|assigned_call_signs|prepared_by_name/);
    expect(b.positions[1]).toMatchObject({ key: 'p2', site_key: 's2', supervisor_key: 'p1', open_signup: false });
    expect(b.shifts[0]).toMatchObject({ position_key: 'p2', period_key: 'op1' });
    expect(b.channels).toHaveLength(1); // only the referenced channel travels
    expect(b.comms_plans[0].rows[0]).toMatchObject({ channel_key: 'ch1', net: 'RACE', condition_level: 1 });
    expect(b.objectives.map(o => o.title)).toEqual(['Six bands']);
    expect(b.safety_checklist.items).toEqual([{ text: 'Fuel stored safely' }]);
    expect(bundleCounts(b)).toMatchObject({ sites: 2, positions: 2, shifts: 1, channels: 1, planRows: 1, layers: 1, objectives: 1, safety: 1 });
  });

  it('parses and rejects', () => {
    const text = JSON.stringify(buildBundle(parts));
    expect(/** @type {any} */ (parseBundle(text)).counts.positions).toBe(2);
    expect(parseBundle('nope').error).toBe('Not a JSON file');
    expect(parseBundle({ format: 'x' }).error).toMatch(/Not an EmComm Planner/);
    expect(parseBundle({ format: BUNDLE_FORMAT, version: 99, deployment: { name: 'a' } }).error).toMatch(/newer/);
  });

  it('imports into another group, remaps keys, moves dates and relinks channels', async () => {
    const { bundle } = parseBundle(JSON.stringify(buildBundle(parts)));
    const repos = fakeRepos();
    const existing = [{ id: 'lib-1', name: 'race NET repeater', rx_freq: 146.82, sort_order: 3 }];
    const r = await importBundle(repos, bundle, { groupId: 'g2', createdBy: 'u9', name: 'Marathon 2028', newStartsAt: '2028-03-05T09:00:00.000Z', existingChannels: existing });
    expect(r.deployment).toMatchObject({ name: 'Marathon 2028', ares_group_id: 'g2', status: 'planning', start_date: '2028-03-05', created_by: 'u9' });
    expect(r.shiftedDays).toBe(364);
    expect(r.counts).toMatchObject({ sites: 2, positions: 2, shifts: 1, tasks: 1, channels: 1, channelsCreated: 0, planRows: 1, layers: 1, objectives: 1, safety: 1 });
    const shift = repos.shifts.create.mock.calls[0][0];
    expect(shift.starts_at).toBe('2028-03-05T10:45:00.000Z');
    expect(shift.position_id).toMatch(/^id-/);
    expect(repos.positions.update).toHaveBeenCalledWith(expect.any(String), { supervisor_position_id: expect.any(String) });
    expect(repos.channels.create).not.toHaveBeenCalled();
    expect(repos.commsPlanChannels.create.mock.calls[0][0]).toMatchObject({ channel_id: 'lib-1', net: 'RACE' });
    expect(repos.tasks.create.mock.calls[0][0]).toMatchObject({ due_date: '2028-02-25', status: 'pending', assigned_to_call_sign: null });
    expect(repos.safetyChecklists.create.mock.calls[0][0].items[0]).toMatchObject({ state: 'pending', note: null });
    expect(repos.objectives.create.mock.calls[0][0]).toMatchObject({ status: 'open', created_by: 'u9' });
  });

  it('creates missing channels in the target library', async () => {
    const { bundle } = parseBundle(buildBundle(parts));
    const repos = fakeRepos();
    const r = await importBundle(repos, bundle, { groupId: 'g3', existingChannels: [] });
    expect(r.counts.channelsCreated).toBe(1);
    expect(repos.channels.create.mock.calls[0][0]).toMatchObject({ ares_group_id: 'g3', name: 'RACE net repeater', rx_freq: 146.82, active: true });
    expect(r.deployment.starts_at).toBe('2027-03-07T09:00:00.000Z');
  });
});
