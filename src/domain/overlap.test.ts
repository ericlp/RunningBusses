import { describe, expect, it } from 'vitest';
import { splitByOverlap, type Run } from './overlap';
import { pathLengthM } from './geo';

const road = (lat: number, from: number, to: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let lon = from; lon <= to + 1e-9; lon += 0.0002) out.push([lon, lat]);
  return out;
};

function runAt(runs: Run[], lon: number): Run {
  const run = runs.find((r) => r.coords.some((point, i) => i > 0 &&
    Math.min(r.coords[i - 1][0], point[0]) <= lon && Math.max(r.coords[i - 1][0], point[0]) >= lon));
  if (!run) throw new Error(`No overlap run at longitude ${lon}`);
  return run;
}

function expectContinuous(runs: Run[], original: [number, number][]) {
  expect(runs.length).toBeGreaterThan(0);
  expect(runs[0].coords[0]).toEqual(original[0]);
  expect(runs[runs.length - 1].coords.at(-1)).toEqual(original.at(-1));
  runs.forEach((run, i) => {
    expect(run.coords.length).toBeGreaterThanOrEqual(2);
    if (i > 0) expect(run.coords[0]).toEqual(runs[i - 1].coords.at(-1));
  });
  expect(runs.reduce((m, run) => m + pathLengthM(run.coords), 0)).toBeCloseTo(pathLengthM(original), 2);
}

describe('splitByOverlap', () => {
  it('marks only the shared stretch as shared', () => {
    const a = { key: 'a', coords: road(57.7, 11.9, 11.96) };
    const b = { key: 'b', coords: road(57.7, 11.93, 11.99) };
    const runs = splitByOverlap([a, b]);
    const groups = runs.get('a')!.map((r) => r.group.join('+'));
    expect(groups).toContain('a');
    expect(groups).toContain('a+b');
    expect(runs.get('b')!.some((r) => r.group.join('+') === 'a+b')).toBe(true);
    expect(runAt(runs.get('a')!, 11.91).group).toEqual(['a']);
    expect(runAt(runs.get('a')!, 11.945).group).toEqual(['a', 'b']);
    expect(runAt(runs.get('b')!, 11.945).group).toEqual(['a', 'b']);
    expect(runAt(runs.get('b')!, 11.98).group).toEqual(['b']);
    expectContinuous(runs.get('a')!, a.coords);
    expectContinuous(runs.get('b')!, b.coords);
  });

  it('leaves distant lines alone', () => {
    const a = { key: 'a', coords: road(57.7, 11.9, 11.95) };
    const b = { key: 'b', coords: road(57.71, 11.9, 11.95) };
    const runs = splitByOverlap([a, b]);
    expect(runs.get('a')!.every((r) => r.group.length === 1)).toBe(true);
    expect(runs.get('b')!.every((r) => r.group.join('+') === 'b')).toBe(true);
  });
});

describe('splitByOverlap direction and sparse roads', () => {
  it('flags the line that runs against the first one', () => {
    const a = { key: 'a', coords: road(57.7, 11.9, 11.95) };
    const b = { key: 'b', coords: road(57.7, 11.9, 11.95).reverse() };
    const runs = splitByOverlap([a, b]);
    expect(runs.get('a')!.every((r) => !r.flip)).toBe(true);
    expect(runs.get('b')!.some((r) => r.flip)).toBe(true);
    expect(runAt(runs.get('a')!, 11.925)).toMatchObject({ group: ['a', 'b'], flip: false });
    expect(runAt(runs.get('b')!, 11.925)).toMatchObject({ group: ['a', 'b'], flip: true });
    for (const lon of [11.905, 11.915, 11.935, 11.945]) {
      expect(runAt(runs.get('a')!, lon)).toMatchObject({ group: ['a', 'b'], flip: false });
      expect(runAt(runs.get('b')!, lon)).toMatchObject({ group: ['a', 'b'], flip: true });
    }
    expectContinuous(runs.get('a')!, a.coords);
    expectContinuous(runs.get('b')!, b.coords);
    expect(splitByOverlap([b, a])).toEqual(runs);
  });
  it('does not flip same-direction shared routes', () => {
    const a = { key: 'a', coords: road(57.7, 11.9, 11.95) };
    const b = { key: 'b', coords: road(57.7, 11.9, 11.95) };
    const runs = splitByOverlap([a, b]);
    for (const key of ['a', 'b']) {
      expect(runAt(runs.get(key)!, 11.925)).toMatchObject({ group: ['a', 'b'], flip: false });
      expect(runs.get(key)!.every((run) => !run.flip)).toBe(true);
    }
  });

  it('finds sharing along a long segment with no vertices in between', () => {
    const a = { key: 'a', coords: [[11.9, 57.7], [11.96, 57.7]] as [number, number][] };
    const b = { key: 'b', coords: road(57.7, 11.92, 11.94) };
    const runs = splitByOverlap([a, b]);
    expect(runs.get('a')!.some((r) => r.group.join('+') === 'a+b')).toBe(true);
    expect(runs.get('a')!.some((r) => r.group.length === 1)).toBe(true);
    expect(runAt(runs.get('a')!, 11.91).group).toEqual(['a']);
    expect(runAt(runs.get('a')!, 11.93).group).toEqual(['a', 'b']);
    expect(runAt(runs.get('a')!, 11.95).group).toEqual(['a']);
    expectContinuous(runs.get('a')!, a.coords);
    expectContinuous(runs.get('b')!, b.coords);
  });

  it('uses a wider sharing distance when asked', () => {
    const a = { key: 'a', coords: road(57.7, 11.9, 11.95) };
    const b = { key: 'b', coords: road(57.70025, 11.9, 11.95) }; // ~28 m apart
    expect(splitByOverlap([a, b], 10).get('a')!.every((r) => r.group.length === 1)).toBe(true);
    expect(splitByOverlap([a, b], 30).get('a')!.some((r) => r.group.length === 2)).toBe(true);
  });
});
