import { describe, it, expect } from 'vitest';
import {
  normalizeFrequency, bandOf, suggestTx, offsetLabel, channelSummary, snapshotFromChannel, snapshotStale,
  groupByCondition, channelsForNet, planWarnings, toChirpCsv, frequencyWarning,
} from './comms';

describe('frequencies', () => {
  it('normalises to four decimals', () => {
    expect(normalizeFrequency('146.76')).toBe('146.7600');
    expect(normalizeFrequency('146,820')).toBe('146.8200');
    expect(normalizeFrequency(' 445.95 MHz ')).toBe('445.9500');
    expect(normalizeFrequency('')).toBe('');
    expect(normalizeFrequency('abc')).toBe('');
  });
  it('names bands and warns outside them', () => {
    expect(bandOf(146.82)).toBe('2m');
    expect(bandOf(444.975)).toBe('70cm');
    expect(bandOf(7.1025)).toBe('HF');
    expect(bandOf(462.5625)).toBe('GMRS');
    expect(bandOf(300)).toBe('');
    expect(frequencyWarning(300)).toMatch(/outside/i);
    expect(frequencyWarning(146.52)).toBe('');
  });
  it('suggests standard repeater offsets', () => {
    expect(suggestTx(146.82)).toBe(146.22);
    expect(suggestTx(147.105)).toBe(147.705);
    expect(suggestTx(145.15)).toBe(144.55);
    expect(suggestTx(444.975)).toBe(449.975);
    expect(suggestTx(146.55)).toBe(146.55);
  });
  it('labels offsets', () => {
    expect(offsetLabel(146.82, 146.22)).toBe('−');
    expect(offsetLabel(147.105, 147.705)).toBe('+');
    expect(offsetLabel(146.55, 146.55)).toBe('');
    expect(offsetLabel(146.55, 146.85)).toBe('+0.300');
  });
});

describe('channel summary and snapshots', () => {
  const repeater = { id: 'c1', name: 'W4DOC', config: 'repeater', rx_freq: 146.82, tx_freq: 146.22, tx_tone: '146.2', mode: 'A', owner_callsign: 'W4DOC' };
  it('summarises analog, simplex, digital and phone channels', () => {
    expect(channelSummary(repeater)).toBe('146.8200− PL 146.2');
    expect(channelSummary({ config: 'simplex', rx_freq: 146.55, tx_freq: 146.55, mode: 'A' })).toBe('146.5500 simplex');
    expect(channelSummary({ config: 'digital', mode: 'D', digital_mode: 'vara_fm', rx_freq: 145.77, tx_freq: 145.77, gateway_callsign: 'WD5EMA-10' })).toBe('VARA FM 145.7700 → WD5EMA-10');
    expect(channelSummary({ config: 'phone', phone_number: '404-612-5650' })).toBe('404-612-5650');
  });
  it('snapshots and detects drift', () => {
    const snap = snapshotFromChannel(repeater);
    expect(snap.channel_id).toBe('c1');
    expect(snap.channel_name).toBe('W4DOC');
    expect(snapshotStale(snap, repeater)).toBe(false);
    expect(snapshotStale(snap, { ...repeater, tx_tone: '100.0' })).toBe(true);
    expect(snapshotStale(snap, null)).toBe(false);
  });
});

describe('plan structure', () => {
  const rows = [
    { id: 'a', condition_level: 1, path_role: 'alternate', sort_order: 0, net: 'RACE', function: 'Tactical', rx_freq: 147.105, tx_freq: 147.705 },
    { id: 'b', condition_level: 1, path_role: 'primary', sort_order: 1, net: 'RACE', function: 'Tactical', rx_freq: 146.82, tx_freq: 146.22 },
    { id: 'c', condition_level: 3, path_role: 'primary', sort_order: 0, function: 'Tactical', rx_freq: 146.55, tx_freq: 146.55, config: 'simplex' },
    { id: 'd', condition_level: 1, path_role: 'primary', sort_order: 2, net: 'SAG', function: 'Tactical', rx_freq: 145.15, tx_freq: 144.55 },
  ];
  it('groups by condition and orders PACE', () => {
    const g = groupByCondition(rows);
    expect(g[1].map(r => r.id)).toEqual(['b', 'd', 'a']);
    expect(g[2]).toEqual([]);
    expect(g[3].map(r => r.id)).toEqual(['c']);
  });
  it('selects channels for a net plus general ones', () => {
    expect(channelsForNet(rows, 'sag').map(r => r.id)).toEqual(['d', 'c']);
    expect(channelsForNet(rows, '').length).toBe(4);
  });
  it('reports gaps', () => {
    expect(planWarnings(rows)).toEqual([]);
    expect(planWarnings([])).toHaveLength(1);
    expect(planWarnings([rows[1]])).toEqual(expect.arrayContaining([expect.stringMatching(/no alternate/i), expect.stringMatching(/Condition 3/)]));
    expect(planWarnings([{ ...rows[1], tx_freq: null, function: '' }])).toEqual(expect.arrayContaining([expect.stringMatching(/transmit/), expect.stringMatching(/function/)]));
  });
});

describe('CHIRP export', () => {
  it('writes analog channels and skips digital/phone', () => {
    const csv = toChirpCsv([
      { channel_name: 'W4DOC RACE', rx_freq: 146.82, tx_freq: 146.22, tx_tone: '146.2', mode: 'A', function: 'Tactical' },
      { channel_name: 'Simplex', rx_freq: 146.55, tx_freq: 146.55, mode: 'A', rx_bandwidth: 'N' },
      { channel_name: 'VARA', rx_freq: 145.77, mode: 'D' },
      { channel_name: 'All call', config: 'phone', phone_number: '404' },
    ]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toMatch(/^Location,Name,Frequency,Duplex,Offset,Tone/);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('0,W4DOC R,146.820000,-,0.600000,Tone,146.2,146.2,023,NN,FM,5.00,,Tactical,,,,');
    expect(lines[2]).toMatch(/^1,Simplex,146.550000,,0.000000,,88.5,88.5,023,NN,NFM/);
  });
});
