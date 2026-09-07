import { describe, it, expect } from 'vitest';
import { nextActions, effectiveStatus, statusTime, buildNcsBoard, ncsSummary, deriveHours, hoursByMonth, hoursCsv, confirmationText } from './operations';

describe('status ladder', () => {
  it('offers the right actions per status', () => {
    expect(nextActions('accepted').map(a => a.status)).toEqual(['checked_in']);
    expect(nextActions('checked_in').map(a => a.status)).toEqual(['on_position', 'released']);
    expect(nextActions('on_position').map(a => a.status)).toEqual(['released']);
    expect(nextActions('released')).toEqual([]);
    expect(nextActions('offered')).toEqual([]);
  });
  it('advances by pending intents but never regresses', () => {
    const a = { id: 'a1', status: 'accepted', checked_in_at: null };
    expect(effectiveStatus(a, [])).toBe('accepted');
    expect(effectiveStatus(a, [{ assignment_id: 'a1', status: 'checked_in', at: '2026-03-01T05:10:00Z' }])).toBe('checked_in');
    expect(effectiveStatus({ ...a, status: 'on_position' }, [{ assignment_id: 'a1', status: 'checked_in' }])).toBe('on_position');
    expect(effectiveStatus(a, [{ assignment_id: 'other', status: 'released' }])).toBe('accepted');
  });
  it('finds the time from the row or the intent', () => {
    const a = { id: 'a1', status: 'checked_in', checked_in_at: '2026-03-01T05:10:00Z' };
    expect(statusTime(a, 'checked_in')).toBe('2026-03-01T05:10:00Z');
    expect(statusTime(a, 'on_position', [{ assignment_id: 'a1', status: 'on_position', at: 'T2' }])).toBe('T2');
    expect(statusTime(a, 'released')).toBeNull();
  });
  it('phrases confirmations for online and offline', () => {
    expect(confirmationText('checked_in', '2026-03-01T05:10:00Z', true)).toMatch(/^Checked in at .*notified\.$/);
    expect(confirmationText('released', '2026-03-01T14:00:00Z', false)).toMatch(/Saved on this device/);
  });
});

describe('NCS board', () => {
  const positions = [
    { id: 'p1', name: 'AID MILE 2', net: 'RACE', headcount: 1 },
    { id: 'p2', name: 'SAG 1', net: 'SAG', headcount: 1 },
    { id: 'p3', name: 'AID MILE 24', net: 'RACE', headcount: 2 },
  ];
  const shifts = [
    { id: 's1', position_id: 'p1', starts_at: '2026-03-01T05:15:00Z', ends_at: '2026-03-01T14:00:00Z' },
    { id: 's2', position_id: 'p2', starts_at: '2026-03-01T05:30:00Z', ends_at: '2026-03-01T14:00:00Z' },
    { id: 's3', position_id: 'p3', starts_at: '2026-03-01T05:30:00Z', ends_at: '2026-03-01T14:00:00Z' },
    { id: 'old', position_id: 'p1', starts_at: '2026-02-01T05:15:00Z', ends_at: '2026-02-01T14:00:00Z' },
  ];
  const users = new Map([['u1', { id: 'u1', call_sign: 'A1' }], ['u2', { id: 'u2', call_sign: 'B2' }], ['u3', { id: 'u3', call_sign: 'C3' }]]);
  const assignments = [
    { id: 'a1', shift_id: 's1', user_id: 'u1', status: 'on_position', on_position_at: '2026-03-01T05:20:00Z' },
    { id: 'a2', shift_id: 's2', user_id: 'u2', status: 'accepted' },
    { id: 'a3', shift_id: 's3', user_id: 'u3', status: 'checked_in', checked_in_at: '2026-03-01T05:25:00Z' },
    { id: 'a4', shift_id: 'old', user_id: 'u1', status: 'released' },
  ];
  const now = new Date('2026-03-01T06:00:00Z');

  it('lists live shifts, worst first, and ignores old ones', () => {
    const rows = buildNcsBoard({ positions, shifts, assignments, usersById: users, now });
    expect(rows.map(r => r.position.name)).toEqual(['SAG 1', 'AID MILE 24', 'AID MILE 2']);
    expect(rows[0].state).toBe('missing');
    expect(rows[1].state).toBe('partial');
    expect(rows[2].state).toBe('on_station');
    expect(ncsSummary(rows)).toMatchObject({ positions: 3, onStation: 1, missing: 1, arriving: 1 });
  });
  it('applies pending intents and filters by net', () => {
    const rows = buildNcsBoard({ positions, shifts, assignments, usersById: users, now, intents: [{ assignment_id: 'a2', status: 'checked_in', at: '2026-03-01T05:40:00Z' }], net: 'SAG' });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('partial');
    expect(rows[0].people[0].pending).toBe(true);
    expect(rows[0].people[0].time).toBe('2026-03-01T05:40:00Z');
  });
  it('shows expected before start and uncovered without people', () => {
    const early = new Date('2026-03-01T04:00:00Z');
    const rows = buildNcsBoard({ positions, shifts, assignments: [assignments[1]], usersById: users, now: early });
    expect(rows.find(r => r.position.id === 'p2').state).toBe('expected');
    expect(rows.find(r => r.position.id === 'p1').state).toBe('uncovered');
  });
});

describe('hours', () => {
  const shift = { starts_at: '2026-03-01T05:15:00Z', ends_at: '2026-03-01T14:00:00Z' };
  it('derives actual hours and flags estimates', () => {
    expect(deriveHours({ checked_in_at: '2026-03-01T05:10:00Z', released_at: '2026-03-01T13:40:00Z' }, shift)).toEqual({ hours: 8.5, estimated: false });
    expect(deriveHours({ checked_in_at: null, released_at: null }, shift)).toEqual({ hours: 8.75, estimated: true });
    expect(deriveHours({ checked_in_at: '2026-03-01T13:00:00Z', released_at: '2026-03-01T12:00:00Z' }, shift)).toEqual({ hours: 1, estimated: true });
  });
  it('groups by month and exports CSV', () => {
    const entries = [
      { user_id: 'u1', occurred_on: '2026-03-01', activity_type: 'public_service', hours: 8.5, source: 'derived', description: 'PAM' },
      { user_id: 'u1', occurred_on: '2026-03-15', activity_type: 'net', hours: 1, source: 'manual', estimated: false },
      { user_id: 'u1', occurred_on: '2026-02-02', activity_type: 'training', hours: 3, source: 'manual' },
    ];
    const months = hoursByMonth(entries);
    expect(months.map(m => m.month)).toEqual(['2026-03', '2026-02']);
    expect(months[0]).toMatchObject({ total: 9.5, byType: { public_service: 8.5, net: 1 } });
    const csv = hoursCsv(entries, new Map([['u1', { call_sign: 'KK4ODA', full_name: 'F' }]]));
    expect(csv.split('\n')[1]).toBe('2026-02-02,KK4ODA,F,Training / drill,3,,manual,');
  });
});
