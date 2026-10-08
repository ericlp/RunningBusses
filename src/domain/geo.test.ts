import { describe, expect, it } from 'vitest';
import { boundsIntersect, pathBounds } from './geo';

describe('cached route bounds', () => {
  it('uses longitude/latitude order and reuses an immutable geometry extent', () => {
    const coords: [number, number][] = [[12, 58], [11, 57], [13, 57.5]];
    const bounds = pathBounds(coords);
    expect(bounds).toEqual({ west: 11, east: 13, south: 57, north: 58 });
    expect(pathBounds(coords)).toBe(bounds);
    expect(pathBounds([[15, 60], [16, 61]])).not.toBe(bounds);
  });
  it('retains routes crossing a viewport even when both endpoints are outside', () => {
    const viewport = { west: 11, east: 12, south: 57, north: 58 };
    expect(boundsIntersect(pathBounds([[10, 57.5], [13, 57.5]]), viewport)).toBe(true);
    expect(boundsIntersect(pathBounds([[12, 58], [13, 59]]), viewport)).toBe(true);
    expect(boundsIntersect(pathBounds([[14, 60], [15, 61]]), viewport)).toBe(false);
    expect(boundsIntersect(pathBounds([]), viewport)).toBe(false);
  });
});
