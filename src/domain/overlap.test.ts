import { describe, expect, it } from 'vitest';
import { splitByOverlap } from './overlap';

const road = (lat: number, from: number, to: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let lon = from; lon <= to + 1e-9; lon += 0.0002) out.push([lon, lat]);
  return out;
};

describe('splitByOverlap', () => {
  it('marks only the shared stretch as shared', () => {
    const a = { key: 'a', coords: road(57.7, 11.9, 11.96) };
    const b = { key: 'b', coords: road(57.7, 11.93, 11.99) };
    const runs = splitByOverlap([a, b]);
    const groups = runs.get('a')!.map((r) => r.group.join('+'));
    expect(groups).toContain('a');
    expect(groups).toContain('a+b');
    expect(runs.get('b')!.some((r) => r.group.join('+') === 'a+b')).toBe(true);
  });

  it('leaves distant lines alone', () => {
    const a = { key: 'a', coords: road(57.7, 11.9, 11.95) };
    const b = { key: 'b', coords: road(57.71, 11.9, 11.95) };
    const runs = splitByOverlap([a, b]);
    expect(runs.get('a')!.every((r) => r.group.length === 1)).toBe(true);
  });
});
