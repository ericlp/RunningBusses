import { describe, expect, it } from 'vitest';
import { applyFilters, defaultFilters, formatKm, searchLines } from './filter';
import { pathLengthM } from './geo';
import { linesNear } from './hit';
import type { Line } from './types';

const line = (o: Partial<Line>): Line => ({
  key: '1',
  number: '1',
  label: '1',
  category: 'stadsbuss',
  tags: [],
  from: 'A',
  to: 'B',
  lengthM: 5000,
  via: [],
  coordinates: [
    [11.97, 57.7],
    [11.98, 57.7],
  ],
  ...o,
});

describe('pathLengthM', () => {
  it('measures about 111 km for one degree of latitude', () => {
    expect(pathLengthM([[11, 57], [11, 58]])).toBeGreaterThan(111000);
    expect(pathLengthM([[11, 57], [11, 58]])).toBeLessThan(111400);
  });
});

describe('applyFilters', () => {
  const lines = [
    line({ key: '1', lengthM: 3000 }),
    line({ key: '2', lengthM: 9000, tags: ['loop'] }),
    line({ key: '3', category: 'stombuss', lengthM: 12000 }),
  ];
  it('defaults to stadsbuss only', () => {
    expect(applyFilters(lines, defaultFilters).map((l) => l.key)).toEqual(['1', '2']);
  });
  it('filters on category, tags and distance together', () => {
    expect(applyFilters(lines, { ...defaultFilters, category: 'all' })).toHaveLength(3);
    expect(applyFilters(lines, { ...defaultFilters, tags: ['loop'] }).map((l) => l.key)).toEqual(['2']);
    expect(applyFilters(lines, { ...defaultFilters, category: 'all', minKm: 9 }).map((l) => l.key)).toEqual(['2', '3']);
    expect(applyFilters(lines, { ...defaultFilters, maxKm: 3 }).map((l) => l.key)).toEqual(['1']);
  });
});

describe('searchLines', () => {
  it('matches label and stop names case-insensitively', () => {
    const lines = [line({ key: '59', label: '59', from: 'Gamlestads Torg', via: ['Kortedala'] }), line({ key: '60', label: '60' })];
    expect(searchLines(lines, 'gamle').map((l) => l.key)).toEqual(['59']);
    expect(searchLines(lines, 'kortedala').map((l) => l.key)).toEqual(['59']);
    expect(searchLines(lines, '60').map((l) => l.key)).toEqual(['60']);
  });
});

describe('linesNear', () => {
  const a = line({ key: 'a' });
  const b = line({ key: 'b', coordinates: [[11.97, 57.7003], [11.98, 57.7003]] });
  const far = line({ key: 'far', coordinates: [[11.97, 57.71], [11.98, 57.71]] });
  it('returns every overlapping line within tolerance, nearest first', () => {
    expect(linesNear([far, b, a], 57.70005, 11.975, 60).map((l) => l.key)).toEqual(['a', 'b']);
  });
  it('returns nothing when the tap is too far away', () => {
    expect(linesNear([a, b, far], 57.705, 11.975, 60)).toEqual([]);
  });
});

describe('formatKm', () => {
  it('uses a decimal comma', () => {
    expect(formatKm(9700)).toBe('9,7 km');
  });
});
