import { describe, expect, it } from 'vitest';
import { courseStats, formatTotal, nextOptions, routeInfo, usedLineKeys, type Course, type Leg } from './course';
import type { Line } from './types';

// 1 degree of latitude is ~111.2 km, so metres / 111195 gives the offset in degrees
const dLat = (m: number) => m / 111195;

const mk = (key: string, lengthM: number, start: [number, number], end: [number, number], extra: Partial<Line> = {}): Line => ({
  key,
  number: key,
  label: key,
  category: 'stadsbuss',
  tags: [],
  from: `${key}-från`,
  to: `${key}-till`,
  lengthM,
  via: [],
  coordinates: [start, end],
  ...extra,
});

const lineLeg = (line: Line, reversed = false): Leg => ({ kind: 'line', line, reversed });
const O: [number, number] = [11.97, 57.7];

describe('courseStats', () => {
  it('adds a 200 m gap to two lines: 4,5 + 5 + 0,2 = 9,7 km (200 m)', () => {
    const a = mk('59', 4500, O, [11.97, 57.7 + dLat(4500)]);
    const b = mk('69', 5000, [11.97, 57.7 + dLat(4700)], [11.97, 57.7 + dLat(9700)]);
    const s = courseStats([lineLeg(a), lineLeg(b)]);
    expect(s.gapM).toBeGreaterThan(199);
    expect(s.gapM).toBeLessThan(201);
    expect(Math.round(s.totalM)).toBe(9700);
    expect(formatTotal(s)).toBe('9,7 km (200 m)');
  });

  it('shows no bracket at exactly 100 m, and shows it above', () => {
    const a = mk('1', 1000, O, [11.97, 57.7 + dLat(1000)]);
    const at = mk('2', 1000, [11.97, 57.7 + dLat(1100)], [11.97, 57.7 + dLat(2100)]);
    const over = mk('3', 1000, [11.97, 57.7 + dLat(1101)], [11.97, 57.7 + dLat(2101)]);
    expect(formatTotal({ ...courseStats([lineLeg(a), lineLeg(at)]), gapM: 100 })).toBe('2,1 km');
    expect(formatTotal(courseStats([lineLeg(a), lineLeg(over)]))).toMatch(/\(101 m\)$/);
  });

  it('follows the travel direction for start and end', () => {
    const a = mk('1', 1000, O, [11.98, 57.7]);
    const s = courseStats([lineLeg(a, true)]);
    expect(s.startName).toBe('1-till');
    expect(s.endName).toBe('1-från');
  });

  it('counts a manual leg without distance as 0 and marks the total as a minimum', () => {
    const a = mk('1', 2000, O, [11.98, 57.7]);
    const s = courseStats([lineLeg(a), { kind: 'manual', id: 'm', label: 'Fotled', lengthM: null }]);
    expect(s.totalM).toBe(2000);
    expect(formatTotal(s)).toBe('minst 2,0 km');
    const withLen = courseStats([lineLeg(a), { kind: 'manual', id: 'm', label: 'Fotled', lengthM: 1500 }]);
    expect(formatTotal(withLen)).toBe('3,5 km');
  });
});

describe('nextOptions', () => {
  const cur = mk('1', 1000, O, [11.97, 57.7 + dLat(1000)]);
  const end = 57.7 + dLat(1000);
  const legs = [lineLeg(cur)];
  const candidate = (key: string, gap: number) => mk(key, 3000, [11.97, end + dLat(gap)], [11.99, end + dLat(gap)]);

  it('includes 499 m and 500 m but not 501 m (radius 500)', () => {
    const lines = [candidate('a', 499), candidate('b', 500), candidate('c', 501)];
    // offsets are metres on a sphere, so use the measured distance of 'b' as the exact boundary
    const exact = nextOptions([lines[1]], new Set(['1']), legs, 1000)[0].gapM!;
    const keys = nextOptions(lines, new Set(['1']), legs, exact).map((o) => o.line.key);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).not.toContain('c');
  });

  it('offers the far end when it is the one that is close, with the right orientation', () => {
    const far = mk('f', 3000, [12.1, 57.8], [11.97, end + dLat(100)]);
    const opts = nextOptions([far], new Set(['1']), legs, 500);
    expect(opts).toHaveLength(1);
    expect(opts[0].reversed).toBe(true);
  });

  it('offers both traversals of a loop', () => {
    const loop = mk('l', 3000, [11.97, end + dLat(50)], [11.97, end + dLat(50)]);
    expect(nextOptions([loop], new Set(['1']), legs, 500).map((o) => o.reversed)).toEqual([false, true]);
  });

  it('never offers lines that are already used', () => {
    expect(nextOptions([candidate('a', 10)], new Set(['1', 'a']), legs, 500)).toEqual([]);
  });

  it('offers every unused line in both directions when starting', () => {
    const opts = nextOptions([candidate('a', 10), candidate('b', 10)], new Set(['b']), [], 500);
    expect(opts.map((o) => [o.line.key, o.reversed])).toEqual([['a', false], ['a', true]]);
  });

  it('offers every unused line after a manual leg', () => {
    const manual: Leg = { kind: 'manual', id: 'm', label: 'x', lengthM: 100 };
    const far = mk('far', 1000, [12.5, 58], [12.6, 58]);
    expect(nextOptions([far], new Set(), [lineLeg(cur), manual], 500)).toHaveLength(2);
  });
});

describe('route status', () => {
  const line = mk('59', 1000, O, [11.98, 57.7]);
  const course = (status: Course['status']): Course => ({ id: 'c', name: 'Bana', status, createdAt: '', updatedAt: '', completedAt: null, legs: [lineLeg(line)] });
  it('derives status from the course', () => {
    expect(routeInfo('59', []).status).toBe('NotPlanned');
    expect(routeInfo('59', [course('NotCompleted')]).status).toBe('NotCompleted');
    expect(routeInfo('59', [course('Completed')]).status).toBe('Completed');
    expect(routeInfo('60', [course('Completed')]).status).toBe('NotPlanned');
  });
  it('collects used keys from all courses and extra legs', () => {
    expect([...usedLineKeys([course('Completed')], [lineLeg(mk('7', 1, O, O))])].sort()).toEqual(['59', '7']);
  });
});
