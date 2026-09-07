import { describe, it, expect } from 'vitest';
import { aarSummary, aarMarkdown, lessonsToCarry } from './aar';

const users = new Map([['u1', { call_sign: 'KK4ODA', full_name: 'F' }], ['u2', { call_sign: 'W4CEF' }]]);
const positions = [{ id: 'p1', name: 'AID 12', tactical_callsign: 'AID 12' }, { id: 'p2', name: 'SAG 1' }];
const shifts = [{ id: 's1', position_id: 'p1', starts_at: '2026-03-01T05:00:00Z' }, { id: 's2', position_id: 'p2', starts_at: '2026-03-01T05:00:00Z' }];
const assignments = [
  { shift_id: 's1', user_id: 'u1', status: 'released' },
  { shift_id: 's2', user_id: 'u2', status: 'no_show' },
];
const log = [
  { kind: 'check_in', occurred_at: '2026-03-01T05:10:00Z', summary: 'KK4ODA checked in' },
  { kind: 'check_out', occurred_at: '2026-03-01T14:00:00Z', summary: 'KK4ODA checked out' },
  { kind: 'note', occurred_at: '2026-03-01T09:00:00Z', summary: 'Repeater timed out twice' },
];
const feedback = [{ user_id: 'u1', rating: 4, comms_worked: 'partly', problems: 'SAG net busy' }, { anonymous: true, user_id: null, rating: 2, comms_worked: 'no', one_change: 'more relays' }];

describe('aarSummary', () => {
  it('counts participation, no-shows, unstaffed shifts and feedback', () => {
    const s = aarSummary({ assignments, positions, shifts, log, hours: [{ hours: 8.5 }, { hours: '1.5' }], feedback, usersById: users });
    expect(s).toMatchObject({ positions: 2, shifts: 2, slotsWorked: 1, operators: 1, totalHours: 10, feedbackCount: 2, averageRating: 3 });
    expect(s.noShows).toEqual([{ callSign: 'W4CEF', position: 'SAG 1' }]);
    expect(s.unstaffed.map(u => u.position)).toEqual(['SAG 1']);
    expect(s.incidents).toHaveLength(1);
    expect(s.firstCheckIn).toBe('2026-03-01T05:10:00Z');
    expect(s.commsVotes).toEqual({ yes: 0, partly: 1, no: 1 });
  });
});

describe('aarMarkdown', () => {
  it('writes every section, naming only non-anonymous respondents', () => {
    const summary = aarSummary({ assignments, positions, shifts, log, hours: [], feedback, usersById: users });
    const md = aarMarkdown({ deployment: { name: 'PAM 2026', profile: 'public_service' }, summary, feedback, lessons: [{ category: 'comms', finding: 'Timeouts', recommendation: 'Shorter transmissions', status: 'open' }], usersById: users, planChanges: [{ version: 2, note: 'SAG net moved' }] });
    expect(md).toContain('# After-action review: PAM 2026');
    expect(md).toContain('- KK4ODA: problems: SAG net busy');
    expect(md).toContain('- Anonymous: one change: more relays');
    expect(md).toContain('- v2: SAG net moved');
    expect(md).toContain('[Communications] Timeouts → Shorter transmissions (Open)');
    expect(md).toContain('No-shows: W4CEF (SAG 1)');
  });
});

describe('lessonsToCarry', () => {
  it('carries open lessons into the new deployment with remapped positions', () => {
    const rows = lessonsToCarry([
      { id: 'l1', ares_group_id: 'g', position_id: 'p1', category: 'comms', finding: 'A', status: 'open' },
      { id: 'l2', ares_group_id: 'g', position_id: null, category: 'safety', finding: 'B', status: 'addressed' },
      { id: 'l3', ares_group_id: 'g', position_id: 'p9', category: 'process', finding: 'C', status: 'carried_forward' },
    ], 'new', new Map([['p1', 'p1n']]));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ deployment_id: 'new', position_id: 'p1n', status: 'carried_forward', carried_from_lesson_id: 'l1' });
    expect(rows[1].position_id).toBeNull();
  });
});
