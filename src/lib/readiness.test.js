import { describe, it, expect } from 'vitest';
import { readinessChecklist } from './readiness';

const deployment = { id: 'd1', profile: 'public_service', starts_at: '2026-03-07T09:00:00Z', ends_at: '2026-03-07T18:00:00Z', served_agency: 'Atlanta Track Club', plan_version: 2, plan_published_at: '2026-03-01T00:00:00Z' };
const positions = [
  { id: 'p1', name: 'AID 12', tactical_callsign: 'AID 12', net: 'RACE', site_id: 'l1', headcount: 1, position_type: 'station' },
  { id: 'p9', name: 'Net Control', tactical_callsign: 'RACE NET', net: 'RACE', headcount: 1, position_type: 'net_control' },
];
const shifts = [
  { id: 's1', position_id: 'p1', starts_at: '2026-03-07T10:00:00Z', ends_at: '2026-03-07T14:00:00Z' },
  { id: 's9', position_id: 'p9', starts_at: '2026-03-07T09:00:00Z', ends_at: '2026-03-07T18:00:00Z' },
];
const users = [{ id: 'u1', call_sign: 'KK4ODA', capabilities: ['vhf_voice'] }, { id: 'u2', call_sign: 'W4CEF' }];
const rows = [
  { id: 'r1', condition_level: 1, path_role: 'primary', net: 'RACE', channel_name: 'W4DOC', rx_freq: 146.82, tx_freq: 146.22, function: 'Tactical' },
  { id: 'r2', condition_level: 1, path_role: 'alternate', channel_name: 'W4PME', rx_freq: 145.45, tx_freq: 144.85, function: 'Tactical' },
  { id: 'r3', condition_level: 3, path_role: 'primary', channel_name: 'Simplex', rx_freq: 146.55, tx_freq: 146.55, config: 'simplex', function: 'Tactical' },
];
const locations = [{ id: 'l1', name: 'Mile 12', lat: 33.7, lon: -84.4, parking_notes: 'Red deck' }];

describe('readinessChecklist', () => {
  it('is all green for a complete plan', () => {
    const assignments = [
      { id: 'a1', shift_id: 's1', user_id: 'u1', status: 'accepted', packet_version_seen: 2 },
      { id: 'a2', shift_id: 's9', user_id: 'u2', status: 'accepted', packet_version_seen: 2 },
    ];
    const r = readinessChecklist({ deployment, positions, shifts, assignments, users, locations, planRows: rows, periods: [{ id: 'op1' }], items: [], tasks: [] });
    expect(r.todo).toBe(0);
    expect(r.warn).toBe(0);
    expect(r.ready).toBe(true);
    expect(r.groups.map(g => g.name)).toEqual(['Plan', 'Staffing', 'Comms', 'Sites']);
  });

  it('lists the problems as a worklist, worst first within each group', () => {
    const assignments = [
      { id: 'a1', shift_id: 's1', user_id: 'u2', status: 'offered', packet_version_seen: null },        // pending offer
      { id: 'a3', shift_id: 's9', user_id: 'u1', status: 'accepted', packet_version_seen: 1 },       // has not seen v2
    ];
    const r = readinessChecklist({
      deployment: { ...deployment, served_agency: null },
      positions: [positions[0], { ...positions[1], headcount: 2 }, { id: 'p2', name: 'SAG 1', net: 'SAG', headcount: 1 }],
      shifts, assignments, users, locations: [{ ...locations[0], lat: null, lon: null, parking_notes: null }],
      planRows: rows, periods: [], unpublishedChanges: 1,
      items: [{ id: 'i1', name: 'HT', priority: 'essential', assigned_call_signs: [] }],
      tasks: [{ id: 't1', status: 'pending', due_date: '2020-01-01' }],
    });
    const ids = r.items.filter(i => i.state !== 'ok').map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining(['agency', 'periods', 'shifts', 'pending', 'tactical', 'nets', 'published', 'acks', 'coords', 'arrival', 'essential', 'overdue']));
    expect(r.items.find(i => i.id === 'nets').label).toMatch(/SAG/);
    expect(r.items.find(i => i.id === 'published')).toMatchObject({ state: 'warn', to: '/staffing' });
    expect(r.items.find(i => i.id === 'open')).toMatchObject({ state: 'todo', to: '/staffing?filter=open' });
    expect(r.ready).toBe(false);
    const rank = { todo: 0, warn: 1, ok: 2 };
    for (const g of r.groups) {
      const ranks = g.items.map(i => rank[i.state]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('flags operators on overlapping shifts', () => {
    const assignments = [
      { id: 'a1', shift_id: 's1', user_id: 'u1', status: 'accepted', packet_version_seen: 2 },
      { id: 'a2', shift_id: 's9', user_id: 'u1', status: 'accepted', packet_version_seen: 2 },
    ];
    const r = readinessChecklist({ deployment, positions, shifts, assignments, users, locations, planRows: rows, periods: [{ id: 'op1' }] });
    expect(r.items.find(i => i.id === 'double')).toMatchObject({ state: 'warn', detail: 'KK4ODA' });
  });
});
