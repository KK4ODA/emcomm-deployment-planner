import { describe, it, expect } from 'vitest';
import { buildPersonnelCards, buildCrewCards } from './icsCards';

const deployment = { name: 'UASI exercise', served_agency: 'Atlanta UASI', location: 'Atlanta' };
const sitesById = new Map([['s1', { id: 's1', name: 'Training Center' }]]);
const positions = [
  { id: 'p1', name: 'Field team F', tactical_callsign: 'TEAM F', site_id: 's1', headcount: 3, sort_order: 0, net: 'RACE', winlink_address: 'DKARES-F', briefing_notes: 'Deploy to Fire Station 10' },
  { id: 'p2', name: 'Net control', tactical_callsign: 'NCS', site_id: 's1', headcount: 1, sort_order: 1 },
  { id: 'p3', name: 'Unstaffed spare', tactical_callsign: 'SPARE', headcount: 1, sort_order: 2 },
];
const shifts = [
  { id: 'sh1', position_id: 'p1', starts_at: '2026-10-01T10:00:00Z', ends_at: '2026-10-01T16:00:00Z', muster_at: '2026-10-01T09:30:00Z', operational_period_id: 'op1' },
  { id: 'sh2', position_id: 'p2', starts_at: '2026-10-01T11:00:00Z', ends_at: '2026-10-01T15:00:00Z', operational_period_id: 'op1' },
  { id: 'sh3', position_id: 'p3', starts_at: '2026-10-01T11:00:00Z', ends_at: '2026-10-01T15:00:00Z', operational_period_id: 'op1' },
];
const assignments = [
  { id: 'a1', shift_id: 'sh1', user_id: 'u1', status: 'accepted' },
  { id: 'a2', shift_id: 'sh1', user_id: 'u2', status: 'offered' },
  { id: 'a3', shift_id: 'sh2', user_id: 'u3', status: 'checked_in' },
  { id: 'a4', shift_id: 'sh1', user_id: 'u4', status: 'declined' },
];
const usersById = new Map([
  ['u1', { id: 'u1', call_sign: 'KK4ODA', full_name: 'Facundo', phone: '404-555-0100', license_class: 'general', station_types: ['mobile'] }],
  ['u2', { id: 'u2', call_sign: 'K4QOA', full_name: 'Roberta', license_class: 'extra' }],
  ['u3', { id: 'u3', call_sign: 'KR4CJZ', full_name: 'Cynthia', license_class: 'technician' }],
  ['u4', { id: 'u4', call_sign: 'NOPE', full_name: 'Declined' }],
]);
const args = { positions, shifts, assignments, usersById, sitesById, deployment };

describe('ICS 219 cards', () => {
  it('makes one personnel card per occupied assignment, in call-sign order', () => {
    const cards = buildPersonnelCards(args);
    expect(cards.map(c => c.callSign)).toEqual(['K4QOA', 'KK4ODA', 'KR4CJZ']);
    const mine = cards.find(c => c.callSign === 'KK4ODA');
    expect(mine).toMatchObject({ unit: 'TEAM F', site: 'Training Center', agency: 'Atlanta UASI', transport: 'POV', licence: 'GENERAL' });
    expect(mine.eta).toBe('2026-10-01T09:30:00Z');
  });

  it('skips operators who declined', () => {
    expect(buildPersonnelCards(args).some(c => c.callSign === 'NOPE')).toBe(false);
  });

  it('makes one crew card per staffed position and flags a short team', () => {
    const cards = buildCrewCards(args);
    expect(cards.map(c => c.unit)).toEqual(['TEAM F', 'NCS']);
    const f = cards[0];
    expect(f).toMatchObject({ headcount: 2, needed: 3, short: true, leader: 'KK4ODA', winlink: 'DKARES-F', net: 'RACE' });
    expect(f.crew.find(c => c.callSign === 'K4QOA').confirmed).toBe(false);
    expect(cards[1]).toMatchObject({ headcount: 1, needed: 1, short: false });
  });

  it('leaves out positions nobody is on', () => {
    expect(buildCrewCards(args).some(c => c.unit === 'SPARE')).toBe(false);
  });

  it('honours an operational period filter', () => {
    expect(buildPersonnelCards({ ...args, periodId: 'other' })).toEqual([]);
    expect(buildCrewCards({ ...args, periodId: 'op1' }).length).toBe(2);
  });
});
