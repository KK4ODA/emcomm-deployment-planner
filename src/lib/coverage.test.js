import { describe, it, expect } from 'vitest';
import { coverageSummary, coverageGeoJson, filterCoverage, pathLabel, coverageCsv } from './coverage';

const sites = new Map([
  ['l1', { name: 'Mile 12', lat: 33.75, lon: -84.39 }],
  ['l2', { name: 'Net control', address: '33.80, -84.30' }],
]);
const entries = [
  { id: 'a', from_site_id: 'l1', to_site_id: 'l2', channel_name: 'W4DOC', frequency_mhz: 146.82, result: 'direct', power_w: 5, occurred_at: '2026-03-07T10:00:00Z', reported_by: 'u1' },
  { id: 'b', from_site_id: 'l1', to_site_id: 'l2', channel_name: 'Simplex', frequency_mhz: 146.55, result: 'fail', occurred_at: '2026-03-07T10:05:00Z' },
  { id: 'c', from_lat: 33.7, from_lon: -84.4, to_label: 'Net control', channel_name: 'Simplex', frequency_mhz: 146.55, result: 'relay', occurred_at: '2026-03-07T10:10:00Z' },
];

describe('coverageSummary', () => {
  it('counts results and ranks channels worst first', () => {
    const s = coverageSummary(entries);
    expect(s).toMatchObject({ total: 3, direct: 1, relay: 1, fail: 1 });
    expect(s.byChannel[0]).toMatchObject({ label: 'Simplex 146.550', fail: 1, relay: 1, total: 2 });
    expect(pathLabel({ channel_name: null, frequency_mhz: null })).toBe('unknown channel');
  });
});

describe('coverageGeoJson', () => {
  it('draws lines between known ends, points when only one end is known, coloured by result', () => {
    const fc = coverageGeoJson(entries, sites);
    expect(fc.features).toHaveLength(3);
    expect(fc.features[0].geometry).toEqual({ type: 'LineString', coordinates: [[-84.39, 33.75], [-84.3, 33.8]] });
    expect(fc.features[0].properties.color).toBe('#16a34a');
    expect(fc.features[1].properties.color).toBe('#dc2626');
    expect(fc.features[2].geometry.type).toBe('Point');
  });
  it('skips entries with no coordinates at all', () => {
    expect(coverageGeoJson([{ result: 'fail' }], sites).features).toEqual([]);
  });
});

describe('filters and csv', () => {
  it('filters by result and channel', () => {
    expect(filterCoverage(entries, { result: 'fail' }).map(e => e.id)).toEqual(['b']);
    expect(filterCoverage(entries, { channel: 'Simplex 146.550' }).map(e => e.id)).toEqual(['b', 'c']);
  });
  it('exports csv with site names', () => {
    const csv = coverageCsv(entries, new Map([['u1', { call_sign: 'KK4ODA' }]]), sites);
    expect(csv.split('\n')[1]).toBe('2026-03-07T10:00:00Z,Mile 12,Net control,W4DOC,146.82,,5,,direct,KK4ODA,');
  });
});
