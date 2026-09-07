import { describe, it, expect } from 'vitest';
import { openShifts } from './staffing';

const now = new Date('2026-03-01T00:00:00Z');
const positions = [
  { id: 'p1', name: 'AID 12', headcount: 2, requirements: [{ kind: 'capability', value: 'vhf_voice', mandatory: true }] },
  { id: 'p2', name: 'SAG 1', headcount: 1, requirements: [{ kind: 'capability', value: 'aprs', mandatory: true }] },
  { id: 'p3', name: 'Net Control', headcount: 1, open_signup: false },
  { id: 'p4', name: 'Finish', headcount: 1 },
];
const shifts = [
  { id: 's1', position_id: 'p1', starts_at: '2026-03-07T10:00:00Z', ends_at: '2026-03-07T14:00:00Z' },
  { id: 's2', position_id: 'p2', starts_at: '2026-03-07T11:00:00Z', ends_at: '2026-03-07T15:00:00Z' },
  { id: 's3', position_id: 'p3', starts_at: '2026-03-07T09:00:00Z', ends_at: '2026-03-07T16:00:00Z' },
  { id: 's4', position_id: 'p4', starts_at: '2026-02-01T09:00:00Z', ends_at: '2026-02-01T12:00:00Z' },
  { id: 's5', position_id: 'p4', starts_at: '2026-03-07T09:00:00Z', ends_at: '2026-03-07T10:30:00Z' },
];
const me = { id: 'u1', call_sign: 'KK4ODA', capabilities: ['vhf_voice'] };

describe('openShifts', () => {
  it('lists only open, future, self-signup shifts the operator does not already hold', () => {
    const assignments = [
      { id: 'a1', shift_id: 's1', user_id: 'u2', status: 'accepted' },   // one of two slots taken
      { id: 'a2', shift_id: 's5', user_id: 'u3', status: 'offered' },    // pending still occupies
    ];
    const list = openShifts({ positions, shifts, assignments, user: me, now });
    expect(list.map(x => x.shift.id)).toEqual(['s1', 's2']);
    expect(list[0]).toMatchObject({ open: 1, headcount: 2, canTake: true });
    expect(list[1].canTake).toBe(false);
    expect(list[1].match.unmet.map(r => r.value)).toEqual(['aprs']);
  });

  it('flags overlap with a shift the operator already holds', () => {
    const assignments = [{ id: 'a1', shift_id: 's5', user_id: 'u1', status: 'accepted' }];
    const list = openShifts({ positions, shifts, assignments, user: me, now });
    const aid = list.find(x => x.shift.id === 's1');
    expect(aid.overlaps).toHaveLength(1);
    expect(aid.canTake).toBe(false);
    expect(list.find(x => x.shift.id === 's5')).toBeUndefined();
  });

  it('hides a shift the operator declined only if it is still open to them', () => {
    const assignments = [{ id: 'a1', shift_id: 's1', user_id: 'u1', status: 'declined' }];
    const list = openShifts({ positions, shifts, assignments, user: me, now });
    expect(list.find(x => x.shift.id === 's1')).toBeDefined();
  });
});
