import { describe, expect, it } from 'vitest';
import { applyFilters, defaultFilters, formatKm, searchLines, sortLines } from './filter';
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
  it('shows the union of the selected categories', () => {
    const more = [...lines, line({ key: 'X40', number: 'X40', category: 'express' }), line({ key: '114', number: '114', category: 'industri' })];
    expect(applyFilters(more, { ...defaultFilters, categories: ['express', 'industri'] }).map((l) => l.key)).toEqual(['X40', '114']);
    expect(applyFilters(more, { ...defaultFilters, categories: ['stombuss', 'express'] }).map((l) => l.key)).toEqual(['3', 'X40']);
  });
  it('filters on category, tags and distance together', () => {
    expect(applyFilters(lines, { ...defaultFilters, categories: ['stadsbuss', 'stombuss'] })).toHaveLength(3);
    expect(applyFilters(lines, { ...defaultFilters, tags: ['loop'] }).map((l) => l.key)).toEqual(['2']);
    expect(applyFilters(lines, { ...defaultFilters, categories: ['stadsbuss', 'stombuss'], minKm: 9 }).map((l) => l.key)).toEqual(['2', '3']);
    expect(applyFilters(lines, { ...defaultFilters, maxKm: 3 }).map((l) => l.key)).toEqual(['1']);
  });
  it('includes all selected buses without including trams or conflating duplicate numbers', () => {
    const regional = line({ key: 'vt.9011014405900000', number: '59', label: '59', category: 'other-bus' });
    const city = line({ key: '59', number: '59', label: '59' });
    const tram = line({ key: '1', category: 'tram' });
    expect(applyFilters([city, regional, tram], defaultFilters)).toEqual([city]);
    expect(applyFilters([city, regional, tram], { ...defaultFilters, categories: ['stadsbuss', 'other-bus'] })).toEqual([city, regional]);
    expect(searchLines([city, regional], '59')).toEqual([city, regional]);
  });
});

describe('sortLines by number', () => {
  it('reads numbers naturally, with express names last', () => {
    const keys = ['X40', '114', '9', '17', 'X5', '62r', '62'];
    const sorted = sortLines(keys.map((k) => line({ key: k, number: k.replace('r', '') })));
    expect(sorted.map((l) => l.key)).toEqual(['9', '17', '62', '62r', '114', 'X5', 'X40']);
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

describe('sortLines', () => {
  const a = line({ key: '22', number: '22', lengthM: 9000, from: 'Zeta' });
  const b = line({ key: '3', number: '3', lengthM: 4000, from: 'Alfa' });
  const c = line({ key: '40', number: '40', lengthM: 6000, from: 'Mitt' });
  const keys = (l: Line[]) => l.map((x) => x.key);
  it('sorts by number numerically, distance and name', () => {
    expect(keys(sortLines([a, b, c]))).toEqual(['3', '22', '40']);
    expect(keys(sortLines([a, b, c], 'shortest'))).toEqual(['3', '40', '22']);
    expect(keys(sortLines([a, b, c], 'longest'))).toEqual(['22', '40', '3']);
    expect(keys(sortLines([a, b, c], 'name'))).toEqual(['3', '40', '22']);
  });
  it('puts not-completed first, completed last, ties by number', () => {
    const st = (k: string) => (k === '22' ? 'Completed' : k === '40' ? 'NotCompleted' : 'NotPlanned') as 'Completed';
    expect(keys(sortLines([a, b, c], 'status', st))).toEqual(['40', '3', '22']);
  });
});
