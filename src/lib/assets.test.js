import { describe, it, expect } from 'vitest';
import { assetActions, outstandingAssets, assetSummary, custodyLine, assetsCsv } from './assets';

const me = { id: 'u1', call_sign: 'KK4ODA' };
const users = new Map([['u1', me], ['u2', { id: 'u2', call_sign: 'W4CEF' }]]);

describe('assetActions', () => {
  it('offers "I have it" from storage and return/hand-over when held', () => {
    expect(assetActions({ status: 'storage' }, me, false).map(a => a.action)).toEqual(['checked_out']);
    expect(assetActions({ status: 'with_person', custodian_user_id: 'u1' }, me, false).map(a => a.action)).toEqual(['returned', 'on_site', 'transferred']);
    expect(assetActions({ status: 'with_person', custodian_user_id: 'u2' }, me, false).map(a => a.action)).toEqual(['checked_out', 'returned', 'on_site']);
  });
  it('lets planners retire and restore', () => {
    expect(assetActions({ status: 'storage' }, me, true).map(a => a.action)).toEqual(['checked_out', 'on_site', 'transferred', 'retired']);
    expect(assetActions({ status: 'retired' }, me, true).map(a => a.action)).toEqual(['restored']);
    expect(assetActions({ status: 'retired' }, me, false)).toEqual([]);
  });
});

describe('teardown and summaries', () => {
  const assets = [
    { id: 'a1', name: '50 A cord', kind: 'cable', status: 'on_site', deployment_id: 'd1', custodian_user_id: 'u2' },
    { id: 'a2', name: 'Mast', kind: 'mast', status: 'with_person', deployment_id: 'd1', custodian_user_id: 'u1' },
    { id: 'a3', name: 'HT', kind: 'radio', status: 'storage', deployment_id: null, home_location: 'EOC cage' },
    { id: 'a4', name: 'Old TNC', kind: 'digital', status: 'retired' },
  ];
  it('lists what is still out for a deployment', () => {
    expect(outstandingAssets(assets, 'd1').map(a => a.id)).toEqual(['a1', 'a2']);
    expect(outstandingAssets(assets, 'd9')).toEqual([]);
  });
  it('counts by status', () => {
    expect(assetSummary(assets)).toEqual({ total: 4, storage: 1, with_person: 1, on_site: 1, retired: 1 });
  });
  it('describes custody in words', () => {
    expect(custodyLine(assets[0], users, 'PAM 2027', 'Mile 12')).toBe('On site at Mile 12 (PAM 2027), W4CEF responsible');
    expect(custodyLine(assets[1], users, 'PAM 2027')).toBe('With KK4ODA for PAM 2027');
    expect(custodyLine(assets[2], users)).toBe('In storage: EOC cage');
  });
  it('exports CSV', () => {
    const csv = assetsCsv(assets, users, new Map([['d1', 'PAM 2027']]));
    expect(csv.split('\n')[1]).toBe('50 A cord,Cable / adapter,,Group,,On site,W4CEF,PAM 2027,');
  });
});
