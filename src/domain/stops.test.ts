import { describe, expect, it } from 'vitest';
import type { Leg } from './course';
import { courseStart, directionsUrl } from './navigate';
import { legStops, lineStops } from './stops';
import type { Line } from './types';

const line = (key: string, extra: Partial<Line> = {}): Line => ({
  key,
  number: key,
  label: key,
  category: 'stadsbuss',
  tags: [],
  from: 'A',
  to: 'C',
  lengthM: 1000,
  via: ['A', 'B', 'C'],
  viaAt: [[11.9, 57.7], [11.91, 57.71], [11.92, 57.72]],
  coordinates: [[11.9, 57.7], [11.92, 57.72]],
  ...extra,
});
const leg = (l: Line, reversed = false): Leg => ({ kind: 'line', line: l, reversed });

describe('stops', () => {
  it('pairs names with positions', () => {
    expect(lineStops(line('1'))[1]).toEqual({ name: 'B', at: [11.91, 57.71] });
  });

  it('gives nothing for old data or mismatched lists', () => {
    expect(lineStops(line('1', { viaAt: undefined }))).toEqual([]);
    expect(lineStops(line('1', { viaAt: [[1, 1]] }))).toEqual([]);
  });

  it('lists a stop shared by two legs once and skips manual legs', () => {
    const shared = line('2', { via: ['C', 'D'], viaAt: [[11.92, 57.72], [11.93, 57.73]] });
    const stops = legStops([leg(line('1')), { kind: 'manual', id: 'm', label: 'Walk', lengthM: null }, leg(shared)]);
    expect(stops.map((s) => s.name)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('navigation', () => {
  it('starts at the first leg, in its own direction', () => {
    expect(courseStart([leg(line('1'))])).toEqual({ name: 'A', lat: 57.7, lon: 11.9 });
    expect(courseStart([leg(line('1'), true)])).toMatchObject({ name: 'C', lat: 57.72, lon: 11.92 });
  });

  it('has no start without a positioned first leg', () => {
    expect(courseStart([])).toBeNull();
    expect(courseStart([{ kind: 'manual', id: 'm', label: 'Walk', lengthM: 5 }])).toBeNull();
  });

  it('builds a directions link to the coordinates', () => {
    expect(directionsUrl({ lat: 57.7, lon: 11.9 })).toBe('https://www.google.com/maps/dir/?api=1&destination=57.70000,11.90000&travelmode=walking');
  });
});
