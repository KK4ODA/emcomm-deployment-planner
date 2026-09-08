import { describe, it, expect } from 'vitest';
import { exportChannelLibrary, importChannelLibrary } from './channelLibrary';

const lib = [
  { id: '1', ares_group_id: 'g1', name: 'W4DOC', kind: 'repeater', rx_freq: 146.82, tx_freq: 146.22, tx_tone: '146.2', active: true, created_at: 'x' },
  { id: '2', ares_group_id: 'g1', name: 'Simplex', kind: 'simplex', rx_freq: 146.55, tx_freq: 146.55, active: true },
  { id: '3', ares_group_id: 'g1', name: 'Old', kind: 'repeater', rx_freq: 147.0, active: false },
];

describe('channel library exchange', () => {
  it('exports active channels without ids or group', () => {
    const doc = exportChannelLibrary(lib, { groupName: 'DeKalb ARES', exportedBy: 'KK4ODA' });
    expect(doc.format).toBe('emcomm-planner-channels');
    expect(doc.channels).toHaveLength(2);
    expect(doc.channels[0]).not.toHaveProperty('id');
    expect(doc.channels[0]).not.toHaveProperty('ares_group_id');
    expect(doc.channels[0]).toMatchObject({ name: 'W4DOC', rx_freq: 146.82, tx_tone: '146.2' });
    expect(doc.group).toBe('DeKalb ARES');
  });

  it('imports only what the receiving group does not have', () => {
    const doc = exportChannelLibrary(lib, { groupName: 'DeKalb ARES' });
    doc.channels.push({ name: 'W4PME', rx_freq: 145.45, tx_freq: 144.85 });
    const r = importChannelLibrary(JSON.stringify(doc), [{ name: 'w4doc', rx_freq: 146.82 }]);
    expect(r.error).toBeUndefined();
    expect(r.rows.map(c => c.name)).toEqual(['Simplex', 'W4PME']);
    expect(r.duplicates.map(c => c.name)).toEqual(['W4DOC']);
    expect(r.rows[1].kind).toBe('repeater');
    expect(r.source.group).toBe('DeKalb ARES');
  });

  it('rejects other files with a clear message', () => {
    expect(importChannelLibrary('not json').error).toBe('Not a JSON file');
    expect(importChannelLibrary({ format: 'chirp' }).error).toMatch(/Not an EmComm Planner/);
  });
});
