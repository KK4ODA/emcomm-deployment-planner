import { describe, it, expect } from 'vitest';
import {
  matchRequirements, shiftCoverage, coverageSummary, rankCandidates, overlappingAssignments,
  windowsOverlap, expandPattern, parseNumberList, groupPositionsBySite, shiftHeadcount,
} from './staffing';
import { requirementLabel, normalizeRequirements } from './capabilities';

const position = {
  id: 'p1', name: 'AID MILE 12', headcount: 1,
  requirements: [
    { kind: 'capability', value: 'vhf_voice', mandatory: true },
    { kind: 'power_hours', value: 6, mandatory: true },
    { kind: 'capability', value: 'aprs', mandatory: false },
  ],
};
const shift = { id: 's1', position_id: 'p1', starts_at: '2026-03-01T05:15:00Z', ends_at: '2026-03-01T14:00:00Z' };
const full = { id: 'u1', call_sign: 'KK4ODA', capabilities: ['vhf_voice', 'aprs'], station_types: ['mobile'], power_hours: 8, license_class: 'extra' };
const weak = { id: 'u2', call_sign: 'W1AAA', capabilities: ['vhf_voice'], station_types: ['handheld'], power_hours: 2, license_class: 'technician' };
const blank = { id: 'u3', call_sign: 'N0BOD', capabilities: [], station_types: [], power_hours: null, license_class: null };

describe('matchRequirements', () => {
  it('passes a fully qualified operator', () => {
    const m = matchRequirements(position, shift, full);
    expect(m.ok).toBe(true);
    expect(m.unmet).toEqual([]);
    expect(m.optionalUnmet).toEqual([]);
  });
  it('reports mandatory failures and optional gaps separately', () => {
    const m = matchRequirements(position, shift, weak);
    expect(m.ok).toBe(false);
    expect(m.unmet.map(r => r.kind)).toEqual(['power_hours']);
    expect(m.optionalUnmet.map(r => r.value)).toEqual(['aprs']);
  });
  it('treats an empty profile as unknown, not failing', () => {
    const m = matchRequirements(position, shift, blank);
    expect(m.ok).toBe(true);
    expect(m.unknown).toHaveLength(2);
  });
  it('compares licence class by rank and ignores free-text requirements', () => {
    const p = { requirements: [{ kind: 'license_class', value: 'general' }, { kind: 'other', value: 'Bring a ladder' }] };
    expect(matchRequirements(p, null, full).ok).toBe(true);
    expect(matchRequirements(p, null, weak).ok).toBe(false);
    expect(matchRequirements(p, null, blank).unknown).toHaveLength(1);
  });
});

describe('coverage', () => {
  const users = new Map([[full.id, full], [weak.id, weak]]);
  it('counts covered, pending and open slots', () => {
    const two = { ...position, id: 'p2', headcount: 2 };
    const s = { ...shift, id: 's2', position_id: 'p2' };
    expect(shiftCoverage(s, two, [], users)).toMatchObject({ headcount: 2, covered: 0, open: 2, state: 'open' });
    expect(shiftCoverage(s, two, [{ shift_id: 's2', user_id: 'u1', status: 'offered' }], users)).toMatchObject({ pending: 1, open: 1, state: 'open' });
    expect(shiftCoverage(s, two, [
      { shift_id: 's2', user_id: 'u1', status: 'accepted' }, { shift_id: 's2', user_id: 'u9', status: 'offered' },
    ], users)).toMatchObject({ covered: 1, pending: 1, open: 0, state: 'pending' });
    expect(shiftCoverage(s, two, [
      { shift_id: 's2', user_id: 'u1', status: 'accepted' }, { shift_id: 's2', user_id: 'u9', status: 'checked_in' },
    ], users)).toMatchObject({ covered: 2, state: 'covered' });
  });
  it('flags a covering operator who does not meet requirements as at risk', () => {
    expect(shiftCoverage(shift, position, [{ shift_id: 's1', user_id: 'u2', status: 'accepted' }], users).state).toBe('at_risk');
  });
  it('ignores declined and cancelled assignments', () => {
    expect(shiftCoverage(shift, position, [{ shift_id: 's1', user_id: 'u1', status: 'declined' }], users)).toMatchObject({ covered: 0, open: 1 });
  });
  it('uses the shift headcount override', () => {
    expect(shiftHeadcount({ headcount: 3 }, { headcount: 1 })).toBe(3);
    expect(shiftHeadcount({ headcount: null }, { headcount: 2 })).toBe(2);
  });
  it('summarises a deployment', () => {
    const positions = [position, { id: 'p3', name: 'Spare', headcount: 1, requirements: [] }];
    const shifts = [shift, { id: 's3', position_id: 'p1', starts_at: '2026-03-01T14:00:00Z', ends_at: '2026-03-01T18:00:00Z' }];
    const summary = coverageSummary(positions, shifts, [{ shift_id: 's1', user_id: 'u1', status: 'accepted' }], users);
    expect(summary).toMatchObject({ slots: 2, covered: 1, open: 1, shifts: 2, positions: 2, positionsWithoutShifts: 1 });
  });
});

describe('overlaps and ranking', () => {
  const other = { id: 's9', position_id: 'p9', starts_at: '2026-03-01T10:00:00Z', ends_at: '2026-03-01T16:00:00Z' };
  const later = { id: 's10', position_id: 'p9', starts_at: '2026-03-01T15:00:00Z', ends_at: '2026-03-01T20:00:00Z' };
  it('detects window overlap', () => {
    expect(windowsOverlap(shift.starts_at, shift.ends_at, other.starts_at, other.ends_at)).toBe(true);
    expect(windowsOverlap(shift.starts_at, shift.ends_at, later.starts_at, later.ends_at)).toBe(false);
  });
  it('finds overlapping assignments for a user, ignoring vacated ones', () => {
    const shiftById = new Map([[other.id, other], [later.id, later]]);
    const a = [{ shift_id: 's9', user_id: 'u1', status: 'accepted' }, { shift_id: 's10', user_id: 'u1', status: 'accepted' }, { shift_id: 's9', user_id: 'u2', status: 'declined' }];
    expect(overlappingAssignments(shift, 'u1', a, shiftById).map(x => x.shift_id)).toEqual(['s9']);
    expect(overlappingAssignments(shift, 'u2', a, shiftById)).toEqual([]);
  });
  it('ranks qualified and free operators first, never dropping anyone', () => {
    const assignments = [{ shift_id: 's9', user_id: 'u1', status: 'accepted' }];
    const ranked = rankCandidates(position, shift, [weak, full, blank, { id: 'u4', call_sign: null }], assignments, [shift, other]);
    expect(ranked.map(r => r.user.id)).toEqual(['u3', 'u2', 'u1']);
    expect(ranked[2].overlaps).toHaveLength(1);
  });
});

describe('bulk helpers', () => {
  it('parses number lists and ranges', () => {
    expect(parseNumberList('1-4')).toEqual([1, 2, 3, 4]);
    expect(parseNumberList('2, 4, 6, 4')).toEqual([2, 4, 6]);
    expect(parseNumberList('2,4-6 9')).toEqual([2, 4, 5, 6, 9]);
    expect(parseNumberList('')).toEqual([]);
  });
  it('expands patterns', () => {
    expect(expandPattern('AID MILE {n}', [2, 4])).toEqual(['AID MILE 2', 'AID MILE 4']);
    expect(expandPattern('SAG', [1])).toEqual(['SAG 1']);
  });
  it('groups positions by site keeping order', () => {
    const g = groupPositionsBySite([{ id: 'b', name: 'B', site_id: 'x', sort_order: 2 }, { id: 'a', name: 'A', site_id: null, sort_order: 1 }, { id: 'c', name: 'C', site_id: 'x', sort_order: 0 }]);
    expect([...g.keys()]).toEqual(['x', null]);
    expect(g.get('x').map(p => p.id)).toEqual(['c', 'b']);
  });
});

describe('capabilities vocabulary', () => {
  it('labels requirements', () => {
    expect(requirementLabel({ kind: 'capability', value: 'winlink_vara_fm' })).toBe('Winlink FM');
    expect(requirementLabel({ kind: 'power_hours', value: 6 })).toBe('6 h independent power');
    expect(requirementLabel({ kind: 'license_class', value: 'general' })).toBe('General or higher');
    expect(requirementLabel({ kind: 'other', value: 'Ladder' })).toBe('Ladder');
  });
  it('normalises stored requirement arrays', () => {
    expect(normalizeRequirements(null)).toEqual([]);
    expect(normalizeRequirements([{ kind: 'capability', value: 'aprs' }, { kind: 'x' }, null])).toEqual([{ kind: 'capability', value: 'aprs', mandatory: true, notes: '' }]);
  });
});
