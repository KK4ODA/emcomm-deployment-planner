import { describe, it, expect } from 'vitest';
import { ageMinutes, ageBucket, distanceM, positionsByUser, nearSite, aprsGeoJson, aprsText, baseCall } from './aprs';

const now = new Date('2026-03-07T12:00:00Z');
const latest = [
  { id: 'p1', callsign: 'KK4ODA-9', base_call: 'KK4ODA', lat: 33.80, lon: -84.13, heard_at: '2026-03-07T11:55:00Z', comment: 'mobile' },
  { id: 'p2', callsign: 'KK4ODA-7', base_call: 'KK4ODA', lat: 33.70, lon: -84.40, heard_at: '2026-03-07T09:00:00Z' },
  { id: 'p3', callsign: 'W4CEF', base_call: 'W4CEF', lat: 33.75, lon: -84.39, heard_at: '2026-03-06T10:00:00Z' },
  { id: 'p4', callsign: 'AID12', base_call: 'AID12', lat: 33.76, lon: -84.38, heard_at: '2026-03-07T11:00:00Z', is_object: true },
];
const users = [
  { id: 'u1', call_sign: 'KK4ODA', aprs_call_sign: 'KK4ODA-7', full_name: 'F' },
  { id: 'u2', call_sign: 'W4CEF' },
  { id: 'u3', call_sign: 'N4RAR' },
];

describe('aprs helpers', () => {
  it('buckets age', () => {
    expect(ageMinutes('2026-03-07T11:55:00Z', now)).toBe(5);
    expect(ageBucket(5).id).toBe('fresh');
    expect(ageBucket(45)).toMatchObject({ id: 'recent', label: '45 min ago' });
    expect(ageBucket(300).id).toBe('stale');
    expect(ageBucket(3000).id).toBe('old');
  });
  it('measures distance and site proximity', () => {
    expect(distanceM([33.80183, -84.12798], [33.80183, -84.12798])).toBe(0);
    expect(distanceM([33.80, -84.13], [33.81, -84.13])).toBeGreaterThan(1000);
    const near = nearSite({ lat: 33.8020, lon: -84.1281 }, { address: '33.80183, -84.12798' });
    expect(near.onSite).toBe(true);
    expect(nearSite({ lat: 33.9, lon: -84.1 }, { lat: 33.80183, lon: -84.12798 }).onSite).toBe(false);
    expect(nearSite(null, { lat: 1, lon: 1 })).toBeNull();
  });
  it('matches operators by APRS call first, then any SSID of the base call', () => {
    const m = positionsByUser(latest, users);
    expect(m.get('u1').callsign).toBe('KK4ODA-7');      // exact APRS call wins over the fresher -9
    expect(m.get('u2').callsign).toBe('W4CEF');
    expect(m.has('u3')).toBe(false);
    expect(baseCall('kk4oda-9')).toBe('KK4ODA');
  });
  it('builds GeoJSON within the age window', () => {
    const fc = aprsGeoJson(latest, { now, maxAgeMinutes: 6 * 60 });
    expect(fc.features.map(f => f.properties.callsign)).toEqual(['KK4ODA-9', 'KK4ODA-7', 'AID12']);
    expect(fc.features[0].properties.color).toBe('#16a34a');
    expect(fc.features[2].properties.isObject).toBe(true);
  });
  it('fits notification text into an APRS message', () => {
    expect(aprsText('Plan updated: PAM 2027 (v3)', 'SAG net moved to 145.450')).toBe('Plan updated: PAM 2027 (v3): SAG net moved to 145.450');
    expect(aprsText('Open shift: AID 12', 'x'.repeat(100))).toHaveLength(67);
  });
});

describe('sites as APRS objects', () => {
  it('names objects within 9 characters, uniquely, with symbols by type', async () => {
    const { sitesToAprsObjects, aprsObjectsCsv, aprsObjectName } = await import('./aprs');
    const sites = [
      { id: 'l1', name: 'Mercedes-Benz Stadium ramp', site_type: 'aid_station', lat: 33.75, lon: -84.39 },
      { id: 'l2', name: 'Fire HQ', address: '33.84, -84.24' },
      { id: 'l3', name: 'No coords' },
    ];
    const positions = [
      { id: 'p1', site_id: 'l1', name: 'AID MILE 12', tactical_callsign: 'AID 12' },
      { id: 'p2', site_id: 'l2', name: 'Net Control', position_type: 'net_control' },
    ];
    const objs = sitesToAprsObjects({ sites, positions, deploymentName: 'PAM 2027' });
    expect(objs).toHaveLength(2);
    expect(objs[0]).toMatchObject({ ObjectName: 'AID12', SymbolTable: '/', SymbolID: '+', Enabled: false, Latitude: 33.75 });
    expect(objs[1]).toMatchObject({ ObjectName: 'FIREHQ', SymbolID: 'r', Longitude: -84.24 });
    expect(objs.every(o => o.ObjectName.length <= 9 && o.Comment.length <= 43)).toBe(true);
    const used = new Set(['AID12']);
    expect(aprsObjectName('AID 12', used)).toBe('AID121');
    expect(aprsObjectsCsv(objs).split('\n')[0]).toBe('ObjectName,Latitude,Longitude,SymbolTable,SymbolID,Comment,IntervalMinutes,Enabled,Path');
  });
});
