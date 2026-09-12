import { describe, it, expect } from 'vitest';
import { tileXY, tilesAround, tileUrl } from './tilePrefetch';

describe('tile prefetch maths', () => {
  it('converts a point to slippy tile coordinates', () => {
    // Zoo Atlanta at zoom 15: x from longitude, y from the Mercator formula
    const t = tileXY(33.7387, -84.3736, 15);
    expect(t.x).toBe(Math.floor(((-84.3736 + 180) / 360) * 2 ** 15));
    expect(t.y).toBe(13118);
    expect(tileXY(0, 0, 1)).toEqual({ x: 1, y: 1 });
    expect(tileXY(85.1, -180, 3)).toEqual({ x: 0, y: 0 });
  });

  it('builds a small pyramid around the point', () => {
    const tiles = tilesAround(33.7387, -84.3736);
    expect(tiles.filter(t => t.z === 12)).toHaveLength(9);
    expect(tiles.filter(t => t.z === 16)).toHaveLength(25);
    expect(tiles).toHaveLength(9 * 3 + 25 * 2);
  });

  it('picks the same subdomain as Leaflet', () => {
    const template = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    expect(tileUrl(template, { z: 15, x: 8704, y: 13118 })).toBe('https://a.tile.openstreetmap.org/15/8704/13118.png'); // (8704+13118) % 3 = 0
    expect(tileUrl(template, { z: 15, x: 8705, y: 13118 })).toBe('https://b.tile.openstreetmap.org/15/8705/13118.png');
  });
});
