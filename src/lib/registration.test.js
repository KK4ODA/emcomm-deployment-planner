import { describe, it, expect } from 'vitest';
import { registrationRoster, registrationSummary, registrationStatus, registrationUrgency, registrationBlocking } from './registration';

const usersById = new Map([
  ['u1', { id: 'u1', call_sign: 'KK4ODA', full_name: 'F' }],
  ['u2', { id: 'u2', call_sign: 'KO4WX', full_name: 'M' }],
  ['u3', { id: 'u3', call_sign: 'KI4JLT', full_name: 'R' }],
]);
const assignments = [
  { user_id: 'u1', status: 'accepted' },
  { user_id: 'u1', status: 'checked_in' },
  { user_id: 'u2', status: 'offered' },
  { user_id: 'u3', status: 'declined' },
];

describe('agency registration', () => {
  it('lists every operator holding a live assignment, once, worst status first', () => {
    const roster = registrationRoster({ assignments, usersById, registrations: [{ user_id: 'u2', status: 'rejected' }] });
    expect(roster.map(r => r.user.call_sign)).toEqual(['KO4WX', 'KK4ODA']);
    expect(roster.find(r => r.userId === 'u1').assignments).toBe(2);
    expect(roster.some(r => r.userId === 'u3')).toBe(false);
  });

  it('defaults to not submitted and counts what is outstanding', () => {
    const roster = registrationRoster({ assignments, usersById, registrations: [{ user_id: 'u1', status: 'confirmed' }] });
    expect(registrationStatus([], 'u1')).toBe('not_submitted');
    expect(registrationSummary(roster)).toMatchObject({ total: 2, confirmed: 1, outstanding: 1, notSubmitted: 1 });
  });

  it('treats confirmed and not required as settled, everything else as blocking', () => {
    expect(registrationBlocking('confirmed')).toBe(false);
    expect(registrationBlocking('not_required')).toBe(false);
    expect(registrationBlocking('submitted')).toBe(true);
    expect(registrationBlocking('rejected')).toBe(true);
  });

  it('gets louder as the deadline and the start approach', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const base = { registration_required: true, starts_at: '2026-10-01T11:00:00Z' };
    expect(registrationUrgency({ registration_required: false }, now)).toBe('none');
    expect(registrationUrgency({ ...base, registration_deadline: '2026-09-27T12:00:00Z' }, now)).toBe('critical');
    expect(registrationUrgency({ ...base, registration_deadline: '2026-09-30T12:00:00Z' }, now)).toBe('warning');
    expect(registrationUrgency({ ...base, starts_at: '2026-09-29T06:00:00Z' }, now)).toBe('critical');
    expect(registrationUrgency({ registration_required: true, starts_at: '2026-11-01T11:00:00Z' }, now)).toBe('none');
  });
});
