import { describe, it, expect } from 'vitest';
import { pickCurrentAssignment, buildPacket, directionsUrl } from './packet';

const shifts = new Map([
  ['s1', { id: 's1', starts_at: '2026-03-01T05:15:00Z', ends_at: '2026-03-01T14:00:00Z' }],
  ['s2', { id: 's2', starts_at: '2026-03-01T14:00:00Z', ends_at: '2026-03-01T20:00:00Z' }],
  ['s3', { id: 's3', starts_at: '2026-02-01T05:15:00Z', ends_at: '2026-02-01T14:00:00Z' }],
]);

describe('pickCurrentAssignment', () => {
  const a = [
    { id: 'a1', shift_id: 's1', status: 'accepted' },
    { id: 'a2', shift_id: 's2', status: 'offered' },
    { id: 'a3', shift_id: 's3', status: 'released' },
    { id: 'a4', shift_id: 's1', status: 'declined' },
  ];
  it('prefers the running shift, then the next upcoming, then the latest past', () => {
    expect(pickCurrentAssignment(a, shifts, new Date('2026-03-01T10:00:00Z')).id).toBe('a1');
    expect(pickCurrentAssignment(a, shifts, new Date('2026-03-01T01:00:00Z')).id).toBe('a1');
    expect(pickCurrentAssignment(a, shifts, new Date('2026-03-01T15:00:00Z')).id).toBe('a2');
    expect(pickCurrentAssignment(a, shifts, new Date('2026-04-01T00:00:00Z')).id).toBe('a2');
  });
  it('ignores declined assignments and returns null when nothing is live', () => {
    expect(pickCurrentAssignment([a[3]], shifts)).toBeNull();
    expect(pickCurrentAssignment([], shifts)).toBeNull();
  });
});

describe('buildPacket', () => {
  const ctx = {
    assignment: { id: 'a1', status: 'accepted', packet_version_seen: 1 },
    shift: { id: 's1', starts_at: '2026-03-01T05:15:00Z', ends_at: '2026-03-01T14:00:00Z', muster_at: '2026-03-01T05:00:00Z' },
    position: { id: 'p1', name: 'AID MILE 12', tactical_callsign: 'AID 12', net: 'RACE', requirements: [{ kind: 'capability', value: 'vhf_voice' }], briefing_notes: 'Wet bulb site' },
    deployment: { id: 'd1', name: 'PAM 2027', plan_version: 2, plan_published_at: '2026-02-20T00:00:00Z', plan_change_note: 'SAG net moved' },
    site: { id: 'l1', name: 'Northside Dr', address: '33.75, -84.39', lat: 33.75, lon: -84.39, parking_notes: 'Red deck' },
    supervisorPosition: { name: 'Net Control', tactical_callsign: 'NET' },
    supervisorUsers: [{ call_sign: 'N4RAR', full_name: 'Jim', phone: '404' }],
    planRows: [
      { id: 'r1', condition_level: 1, path_role: 'primary', net: 'RACE', channel_name: 'W4DOC', rx_freq: 146.82 },
      { id: 'r2', condition_level: 1, path_role: 'primary', net: 'SAG', channel_name: 'W4AQL', rx_freq: 145.15 },
      { id: 'r3', condition_level: 3, path_role: 'primary', channel_name: 'Simplex', rx_freq: 146.55 },
    ],
    items: [{ id: 'i1', deployment_location_id: 'l1', name: 'HT' }, { id: 'i2', deployment_location_id: 'l2', name: 'Other' }],
  };
  it('assembles the operator view and filters channels by net', () => {
    const p = buildPacket(ctx);
    expect(p.position.tactical).toBe('AID 12');
    expect(p.primaryChannel.channel_name).toBe('W4DOC');
    expect(p.channelsByCondition[1].map(r => r.id)).toEqual(['r1']);
    expect(p.channelsByCondition[3].map(r => r.id)).toEqual(['r3']);
    expect(p.equipment.map(i => i.id)).toEqual(['i1']);
    expect(p.supervisor.people[0].callSign).toBe('N4RAR');
    expect(p.requirements).toHaveLength(1);
  });
  it('flags an unseen plan version', () => {
    expect(buildPacket(ctx).hasUnseenChange).toBe(true);
    expect(buildPacket({ ...ctx, assignment: { ...ctx.assignment, packet_version_seen: 2 } }).hasUnseenChange).toBe(false);
    expect(buildPacket({ ...ctx, deployment: { ...ctx.deployment, plan_published_at: null } }).hasUnseenChange).toBe(false);
  });
  it('works without a site or plan', () => {
    const p = buildPacket({ ...ctx, site: null, planRows: [], supervisorPosition: null });
    expect(p.site).toBeNull();
    expect(p.primaryChannel).toBeNull();
    expect(p.equipment).toHaveLength(2);
  });
});

describe('directionsUrl', () => {
  it('prefers coordinates, falls back to the address, null otherwise', () => {
    expect(directionsUrl({ lat: 33.75, lon: -84.39 })).toContain('destination=33.75,-84.39');
    expect(directionsUrl({ address: '201 Armour Dr' })).toContain('201%20Armour%20Dr');
    expect(directionsUrl({})).toBeNull();
    expect(directionsUrl(null)).toBeNull();
  });
});
