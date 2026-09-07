import { describe, it, expect } from 'vitest';
import { buildIcs205aRows, entriesForIcs214, hoursRollup } from './icsForms';

describe('ICS 205A rows', () => {
  const positions = [{ id: 'p1', name: 'AID MILE 2', tactical_callsign: 'AID 2', net: 'RACE', sort_order: 1 }, { id: 'p0', name: 'Net Control', tactical_callsign: 'NET', sort_order: 0 }];
  const shifts = [{ id: 's1', position_id: 'p1', operational_period_id: 'op1' }, { id: 's0', position_id: 'p0' }, { id: 's2', position_id: 'p1', operational_period_id: 'op2' }];
  const assignments = [
    { shift_id: 's1', user_id: 'u1', status: 'accepted' },
    { shift_id: 's1', user_id: 'u9', status: 'declined' },
    { shift_id: 's2', user_id: 'u1', status: 'accepted' },
  ];
  const users = new Map([['u1', { full_name: 'Karen', call_sign: 'WZ4DVA', phone: '678', aprs_call_sign: 'WZ4DVA-7' }]]);
  it('lists staffed and unstaffed positions in plan order without duplicates', () => {
    const rows = buildIcs205aRows({ positions, shifts, assignments, usersById: users });
    expect(rows.map(r => [r.position, r.name])).toEqual([['Net Control', '(unstaffed)'], ['AID MILE 2', 'Karen']]);
    expect(rows[1]).toMatchObject({ tactical: 'AID 2', callSign: 'WZ4DVA', method: '678 · APRS WZ4DVA-7', net: 'RACE' });
  });
  it('filters by operational period', () => {
    expect(buildIcs205aRows({ positions, shifts, assignments, usersById: users, periodId: 'op2' })).toHaveLength(2);
  });
});

describe('ICS 214 entries', () => {
  const log = [
    { user_id: 'u1', occurred_at: '2026-03-01T06:00:00Z', summary: 'B', kind: 'check_in' },
    { user_id: 'u2', occurred_at: '2026-03-01T05:00:00Z', summary: 'A', kind: 'note' },
    { user_id: 'u1', occurred_at: '2026-03-02T05:00:00Z', summary: 'C', kind: 'check_out' },
  ];
  it('orders chronologically and filters by person and window', () => {
    expect(entriesForIcs214(log).map(e => e.text)).toEqual(['A', 'B', 'C']);
    expect(entriesForIcs214(log, { userId: 'u1' }).map(e => e.text)).toEqual(['B', 'C']);
    expect(entriesForIcs214(log, { to: '2026-03-01T23:59:00Z' }).map(e => e.text)).toEqual(['A', 'B']);
  });
});

describe('hours rollup', () => {
  const users = new Map([['u1', { call_sign: 'KK4ODA', full_name: 'F' }], ['u2', { call_sign: 'AB1CD', full_name: 'G' }]]);
  const entries = [
    { user_id: 'u1', occurred_on: '2026-03-01', activity_type: 'public_service', hours: 8.5, estimated: true },
    { user_id: 'u1', occurred_on: '2026-03-10', activity_type: 'admin', hours: 2 },
    { user_id: 'u2', occurred_on: '2026-03-15', activity_type: 'net', hours: 1 },
    { user_id: 'u2', occurred_on: '2026-02-15', activity_type: 'net', hours: 1 },
  ];
  it('sums the month per operator and in total', () => {
    const { rows, totals } = hoursRollup(entries, '2026-03', users);
    expect(rows.map(r => r.callSign)).toEqual(['AB1CD', 'KK4ODA']);
    expect(rows[1]).toMatchObject({ public_service: 8.5, admin: 2, total: 10.5, estimated: 1 });
    expect(totals).toMatchObject({ public_service: 8.5, admin: 2, net: 1, total: 11.5, operators: 2 });
  });
});
