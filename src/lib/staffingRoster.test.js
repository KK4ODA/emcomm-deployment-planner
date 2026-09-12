import { describe, it, expect } from 'vitest';
import { buildStaffingRoster, rosterCsv, rosterBySite } from './staffingRoster';

const data = {
  deploymentId: 'd1',
  sites: [{ id: 'l1', name: 'MACC', sort_order: 1 }, { id: 'l2', name: 'Aid 20', sort_order: 2 }],
  positions: [
    { id: 'p2', deployment_id: 'd1', name: 'AID MILE 20', tactical_callsign: 'AID 20', net: 'RACE', site_id: 'l2', sort_order: 2, headcount: 2 },
    { id: 'p1', deployment_id: 'd1', name: 'NCS RACE', tactical_callsign: 'NCS RACE', net: 'RACE', site_id: 'l1', sort_order: 1, headcount: 1 },
    { id: 'p9', deployment_id: 'other', name: 'Elsewhere', site_id: null },
  ],
  shifts: [
    { id: 's1', position_id: 'p1', starts_at: '2027-03-07T10:00:00Z', ends_at: '2027-03-07T20:00:00Z', muster_at: '2027-03-07T10:00:00Z', headcount: 1 },
    { id: 's2', position_id: 'p2', starts_at: '2027-03-07T10:45:00Z', ends_at: '2027-03-07T18:30:00Z', headcount: 2 },
  ],
  assignments: [
    { id: 'a1', shift_id: 's1', user_id: 'u1', status: 'accepted' },
    { id: 'a2', shift_id: 's2', user_id: 'u2', status: 'checked_in' },
    { id: 'a3', shift_id: 's2', user_id: 'u3', status: 'declined' },
  ],
  users: [
    { id: 'u1', call_sign: 'KK4ODA', full_name: 'Facundo', phone: '404-555-0101' },
    { id: 'u2', call_sign: 'W4XYZ', full_name: 'Pat, "Ops"', phone: '' },
    { id: 'u3', call_sign: 'N0PE', full_name: 'Declined' },
  ],
};

describe('staffing roster', () => {
  it('lists one line per seat, sites in order, open seats marked', () => {
    const rows = buildStaffingRoster(data);
    expect(rows.map(r => `${r.tactical}:${r.callSign || 'OPEN'}`)).toEqual(['NCS RACE:KK4ODA', 'AID 20:W4XYZ', 'AID 20:OPEN']);
    expect(rows[1].status).toBe('checked in');
    expect(rows[2]).toMatchObject({ open: true, status: 'OPEN', site: 'Aid 20' });
  });

  it('writes CSV with quoting and a footer', () => {
    const csv = rosterCsv(buildStaffingRoster(data), { deploymentName: 'Marathon', generatedAt: new Date('2027-03-01T12:00:00Z') });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Site,Position,Tactical call,Net,Start,End,Report,Status,Call sign,Name,Phone');
    expect(lines[2]).toContain('"Pat, ""Ops"""');
    expect(lines.at(-1)).toMatch(/Marathon staffing roster, generated/);
  });

  it('groups by site for the packet', () => {
    const g = rosterBySite(buildStaffingRoster(data));
    expect(g.map(x => x.site)).toEqual(['MACC', 'Aid 20']);
    expect(g[1].positions[0]).toMatchObject({ tactical: 'AID 20', open: 1 });
    expect(g[1].positions[0].people).toEqual([{ callSign: 'W4XYZ', name: 'Pat, "Ops"', phone: '' }]);
  });
});
