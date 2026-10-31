import { describe, expect, it } from 'vitest';
import { applyFilters, defaultFilters, facetAvailability, formatKm, searchLines, sortLines, type StatusFilter } from './filter';
import { haversineM, pathLengthM } from './geo';
import { distanceToLineM, linesNear } from './hit';
import type { RouteStatus } from './course';
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
  it('measures east-west displacement at Gothenburg latitude', () => {
    const distance = haversineM({ lon: 11, lat: 57.7 }, { lon: 12, lat: 57.7 });
    expect(distance).toBeGreaterThan(59000);
    expect(distance).toBeLessThan(60000);
    expect(pathLengthM([[11, 57.7], [12, 57.7]])).toBeCloseTo(distance, 6);
  });
  it('adds every segment of a bent path, rather than measuring the endpoints', () => {
    const east = haversineM({ lon: 11, lat: 57.7 }, { lon: 12, lat: 57.7 });
    const north = haversineM({ lon: 12, lat: 57.7 }, { lon: 12, lat: 58.7 });
    const distance = pathLengthM([[11, 57.7], [12, 57.7], [12, 58.7]]);
    expect(distance).toBeCloseTo(east + north, 6);
    expect(distance).toBeGreaterThan(haversineM({ lon: 11, lat: 57.7 }, { lon: 12, lat: 58.7 }) + 10000);
  });
});

describe('status filters and available facets', () => {
  const lines = [
    line({ key: 'unplanned' }),
    line({ key: 'planned', tags: ['loop'] }),
    line({ key: 'done', tags: ['one-way'] }),
    line({ key: 'tram', category: 'tram', tags: ['retur'] }),
  ];
  const statusOf = (key: string): RouteStatus => key === 'planned' ? 'NotCompleted' : key === 'done' ? 'Completed' : 'NotPlanned';

  it.each([
    ['all', ['unplanned', 'planned', 'done']],
    ['unplanned', ['unplanned']],
    ['incomplete', ['unplanned', 'planned']],
    ['completed', ['done']],
  ] satisfies [StatusFilter, string[]][])('filters %s by course-derived status', (status, keys) => {
    expect(applyFilters(lines, { ...defaultFilters, status }, statusOf).map((l) => l.key)).toEqual(keys);
  });
  it('matches the union of selected tags without bypassing category or status filters', () => {
    const filters = { ...defaultFilters, status: 'all' as const, tags: ['loop', 'one-way'] as const };
    expect(applyFilters(lines, { ...filters, tags: [...filters.tags] }, statusOf).map((l) => l.key)).toEqual(['planned', 'done']);
    expect(applyFilters(lines, { ...filters, tags: [...filters.tags], status: 'incomplete' }, statusOf).map((l) => l.key)).toEqual(['planned']);
  });

  it('evaluates each facet against other active filters and retains selected empty facets', () => {
    const selected = { ...defaultFilters, tags: ['loop' as const] };
    const available = facetAvailability(lines, selected, statusOf);
    expect(available.category('tram')).toBe(false);
    expect(available.status('completed')).toBe(false);
    expect(available.status('all')).toBe(true);
    expect(available.tag('one-way')).toBe(false);
    expect(available.tag('retur')).toBe(false);
    const unrestricted = facetAvailability(lines, { ...defaultFilters, status: 'all' }, statusOf);
    expect(unrestricted.category('tram')).toBe(true);
    expect(unrestricted.tag('one-way')).toBe(true);
    expect(unrestricted.tag('retur')).toBe(false);

    const empty = facetAvailability(lines, { ...selected, maxKm: 1 }, statusOf);
    expect(empty.category('stadsbuss')).toBe(true);
    expect(empty.status('incomplete')).toBe(true);
    expect(empty.tag('loop')).toBe(true);
    expect(empty.category('tram')).toBe(false);
    expect(empty.status('all')).toBe(false);
    expect(empty.tag('one-way')).toBe(false);
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
  it('clamps a diagonal segment at both endpoints instead of using its infinite extension', () => {
    const diagonal = line({ key: 'diagonal', coordinates: [[11.97, 57.7], [11.98, 57.71]] });
    expect(distanceToLineM(diagonal, 57.705, 11.975)).toBeLessThan(0.001);
    for (const [lon, lat] of [[11.9696, 57.6996], [11.9804, 57.7104]]) {
      const distance = distanceToLineM(diagonal, lat, lon);
      expect(distance).toBeGreaterThan(45);
      expect(distance).toBeLessThan(55);
      expect(linesNear([diagonal], lat, lon, 45)).toEqual([]);
      expect(linesNear([diagonal], lat, lon, 60)).toEqual([diagonal]);
    }
  });
  it('handles duplicate vertices without NaN or losing the following segment', () => {
    const repeated = line({ key: 'repeated', coordinates: [[11.97, 57.7], [11.97, 57.7], [11.98, 57.71]] });
    expect(distanceToLineM(repeated, 57.7, 11.97)).toBe(0);
    expect(distanceToLineM(repeated, 57.705, 11.975)).toBeLessThan(0.001);
    expect(linesNear([repeated], 57.705, 11.975, 1)).toEqual([repeated]);
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
