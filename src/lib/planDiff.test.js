import { describe, it, expect } from 'vitest';
import { packetSnapshot, diffSnapshots, planChanges, toPublishPayload } from './planDiff';

const site = { id: 'l1', name: 'Mile 12', address: 'Northside Dr', lat: 33.7, lon: -84.4, parking_notes: 'Red deck' };
const position = { id: 'p1', deployment_id: 'd1', name: 'AID MILE 12', tactical_callsign: 'AID 12', net: 'RACE', site_id: 'l1', supervisor_position_id: 'p9', headcount: 2, requirements: [{ kind: 'capability', value: 'vhf_voice', mandatory: true }] };
const ncs = { id: 'p9', deployment_id: 'd1', name: 'Net Control', tactical_callsign: 'RACE NET', net: 'RACE' };
const shifts = [
  { id: 's1', deployment_id: 'd1', position_id: 'p1', starts_at: '2026-03-01T10:15:00Z', ends_at: '2026-03-01T19:00:00Z', muster_at: '2026-03-01T10:00:00Z' },
  { id: 's9', deployment_id: 'd1', position_id: 'p9', starts_at: '2026-03-01T09:00:00Z', ends_at: '2026-03-01T20:00:00Z' },
];
const rows = [
  { id: 'r1', comms_plan_id: 'cp1', condition_level: 1, path_role: 'primary', net: 'RACE', channel_name: 'W4DOC', rx_freq: 146.82, tx_freq: 146.22, tx_tone: '146.2' },
  { id: 'r2', comms_plan_id: 'cp1', condition_level: 1, path_role: 'primary', net: 'SAG', channel_name: 'W4PME', rx_freq: 145.45, tx_freq: 144.85 },
  { id: 'r3', comms_plan_id: 'cp1', condition_level: 3, path_role: 'primary', channel_name: 'Simplex', rx_freq: 146.55, tx_freq: 146.55, config: 'simplex' },
];

describe('packetSnapshot', () => {
  it('captures only the operator-facing fields and the channels for the net', () => {
    const snap = packetSnapshot({ position, shifts, site, supervisorPosition: ncs, planRows: rows });
    expect(snap.tactical).toBe('AID 12');
    expect(snap.supervisor).toBe('RACE NET');
    expect(snap.site.parking).toBe('Red deck');
    expect(snap.shifts).toEqual([{ id: 's1', starts_at: '2026-03-01T10:15:00Z', ends_at: '2026-03-01T19:00:00Z', muster_at: '2026-03-01T10:00:00Z' }]);
    expect(snap.channels.map(c => c.name)).toEqual(['W4DOC', 'Simplex']);
    expect(snap.requirements).toEqual(['capability:vhf_voice']);
  });
});

describe('diffSnapshots', () => {
  const base = packetSnapshot({ position, shifts, site, supervisorPosition: ncs, planRows: rows });

  it('is empty when nothing operator-facing changed', () => {
    const same = packetSnapshot({ position: { ...position, sort_order: 5, created_at: 'x' }, shifts, site, supervisorPosition: ncs, planRows: rows });
    expect(diffSnapshots(base, same)).toEqual([]);
  });

  it('says what changed, in operator terms', () => {
    const next = packetSnapshot({
      position: { ...position, tactical_callsign: 'AID 12A' },
      shifts: [{ ...shifts[0], muster_at: '2026-03-01T09:45:00Z' }],
      site: { ...site, parking_notes: 'Blue deck' },
      supervisorPosition: ncs,
      planRows: [{ ...rows[0], channel_name: 'W4PME', rx_freq: 145.45, tx_freq: 144.85, tx_tone: null }, rows[1], rows[2]],
    });
    const d = diffSnapshots(base, next);
    expect(d).toContain('Tactical call AID 12 → AID 12A');
    expect(d).toContain('Site notes updated (parking)');
    expect(d.find(x => x.startsWith('Muster'))).toMatch(/→/);
    expect(d.find(x => x.startsWith('Condition 1 primary'))).toMatch(/W4PME 145\.4500−.*\(was W4DOC 146\.8200− PL 146\.2\)/);
    expect(d).toHaveLength(4);
  });

  it('reports a new or removed shift and a site move', () => {
    const next = packetSnapshot({ position, shifts: [{ ...shifts[0], id: 's2' }], site: { ...site, id: 'l2', name: 'Mile 20' }, supervisorPosition: ncs, planRows: rows });
    const d = diffSnapshots(base, next);
    expect(d).toContain('Site moved: Mile 12 → Mile 20');
    expect(d.some(x => x.startsWith('New shift'))).toBe(true);
    expect(d.some(x => x.endsWith('removed'))).toBe(true);
  });

  it('treats a missing previous snapshot as new', () => {
    expect(diffSnapshots(null, base)).toEqual(['New in the plan']);
  });
});

describe('planChanges', () => {
  const deployment = { id: 'd1', plan_published_at: '2026-02-01T00:00:00Z', plan_version: 2 };
  const plans = [{ id: 'cp1', deployment_id: 'd1', operational_period_id: null }];
  const assignments = [
    { id: 'a1', deployment_id: 'd1', shift_id: 's1', user_id: 'u1', status: 'accepted' },
    { id: 'a2', deployment_id: 'd1', shift_id: 's9', user_id: 'u2', status: 'accepted' },
    { id: 'a3', deployment_id: 'd1', shift_id: 's1', user_id: 'u3', status: 'declined' },
  ];

  it('flags only positions whose packet differs from the stored snapshot', () => {
    const stored = packetSnapshot({ position, shifts, site, supervisorPosition: ncs, planRows: rows });
    const storedNcs = packetSnapshot({ position: ncs, shifts, site: null, supervisorPosition: null, planRows: rows });
    const positions = [{ ...position, packet_snapshot: stored }, { ...ncs, packet_snapshot: storedNcs }];
    const moved = shifts.map(s => s.id === 's1' ? { ...s, starts_at: '2026-03-01T10:00:00Z' } : s);
    const r = planChanges({ deployment, positions, shifts: moved, locations: [site], plans, planRows: rows, assignments });
    expect(r.entries).toHaveLength(2);
    expect(r.changed.map(e => e.position.id)).toEqual(['p1']);
    expect([...r.affectedUserIds]).toEqual(['u1']);
    expect([...r.assignedUserIds].sort()).toEqual(['u1', 'u2']);
    const payload = toPublishPayload(r.entries);
    expect(payload[0]).toMatchObject({ position_id: 'p1' });
    expect(payload[0].changes[0]).toMatch(/^Shift /);
    expect(payload[1].changes).toEqual([]);
  });

  it('marks every position on the first publication', () => {
    const r = planChanges({ deployment: { id: 'd1', plan_published_at: null }, positions: [position, ncs], shifts, locations: [site], plans, planRows: rows, assignments });
    expect(r.changed).toHaveLength(2);
    expect(r.entries[0].changes).toEqual(['First published packet']);
  });
});
