import { describe, it, expect } from 'vitest';
import { patternToRegex, fillPattern, matchScheme, deriveTactical, schemeDefaults, schemeFromBulk } from './naming';

const schemes = [
  { id: 's1', name: 'Aid stations', position_pattern: 'AID MILE {n}', tactical_pattern: 'AID {n}', position_type: 'aid_station', net: 'RACE', requirements: [{ kind: 'capability', value: 'vhf_voice', mandatory: true }] },
  { id: 's2', name: 'SAG', position_pattern: 'SAG {n}', tactical_pattern: 'SAG {n}', position_type: 'mobile' },
  { id: 's3', name: 'Net control', position_pattern: 'Net Control', tactical_pattern: 'RACE NET' },
];

describe('naming schemes', () => {
  it('matches names produced by a pattern, case-insensitively, capturing the number', () => {
    expect(patternToRegex('AID MILE {n}').exec('aid mile 12')[1]).toBe('12');
    expect(matchScheme('AID MILE 7', schemes)).toMatchObject({ scheme: { id: 's1' }, value: '7' });
    expect(matchScheme('SAG 3', schemes).scheme.id).toBe('s2');
    expect(matchScheme('Finish line', schemes)).toBeNull();
    expect(matchScheme('', schemes)).toBeNull();
  });
  it('derives the tactical call', () => {
    expect(deriveTactical('AID MILE 12', schemes)).toBe('AID 12');
    expect(deriveTactical('net control', schemes)).toBe('RACE NET');
    expect(deriveTactical('Finish line', schemes)).toBeNull();
    expect(fillPattern('SAG', 4)).toBe('SAG 4');
  });
  it('contributes defaults and round-trips from the bulk dialog', () => {
    expect(schemeDefaults(schemes[0])).toEqual({ position_type: 'aid_station', net: 'RACE', requirements: schemes[0].requirements });
    expect(schemeDefaults(schemes[2])).toEqual({});
    expect(schemeFromBulk({ pattern: 'WATER STOP {n}', tacticalPattern: 'water {n}', type: 'aid_station', net: '', requirements: [] }, 'g1')).toEqual({
      ares_group_id: 'g1', name: 'WATER STOP #', position_pattern: 'WATER STOP {n}', tactical_pattern: 'WATER {N}', position_type: 'aid_station', net: null, requirements: [],
    });
  });
});
