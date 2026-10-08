import { describe, expect, it } from 'vitest';
import type { Course } from './course';
import { addPerson, cleanName, computeProgress, DEFAULT_PROGRESS_CATEGORIES, knownPeople, loadProgressCategories, saveProgressCategories, toggleProgressCategory, unusedPeople } from './stats';
import { CATEGORIES, type Line } from './types';

const line = (key: string, lengthM: number, category: Line['category'] = 'stadsbuss'): Line => ({
  key,
  number: key,
  label: key,
  category,
  tags: [],
  from: 'A',
  to: 'B',
  lengthM,
  via: [],
  coordinates: [[11.9, 57.7], [11.9, 57.7]],
});
const lines = [line('59', 5000), line('69', 3000), line('70', 2000), line('T1', 4000, 'tram')];

const course = (id: string, keys: string[], extra: Partial<Course> = {}): Course => ({
  id,
  name: id,
  status: 'NotCompleted',
  createdAt: 'a',
  updatedAt: 'a',
  completedAt: null,
  legs: keys.map((k) => ({ kind: 'line' as const, reversed: false, line: lines.find((l) => l.key === k)! })),
  ...extra,
});

describe('people', () => {
  it('cleans and de-duplicates names ignoring case', () => {
    expect(cleanName('  Anna   Berg ')).toBe('Anna Berg');
    expect(addPerson(['Anna'], 'anna')).toEqual(['Anna']);
    expect(addPerson(['Anna'], '   ')).toEqual(['Anna']);
    expect(addPerson(['Anna'], 'Bo')).toEqual(['Anna', 'Bo']);
  });

  it('merges stored people with those named on courses', () => {
    const c = course('1', ['59'], { status: 'Completed', completedAt: '2026-01-01', participants: ['Bo', 'cy'] });
    expect(knownPeople(['Anna', 'bo'], [c])).toEqual(['Anna', 'bo', 'cy']);
  });

  it('only lets people without runs be removed', () => {
    const c = course('1', ['59'], { status: 'Completed', completedAt: '2026-01-01', participants: ['Bo'] });
    expect(unusedPeople(['Anna', 'Bo'], [c])).toEqual(['Anna']);
  });
});

describe('computeProgress', () => {
  const done = course('1', ['59'], { status: 'Completed', completedAt: '2026-02-01', participants: ['Anna', 'Bo'] });
  const later = course('2', ['T1'], { status: 'Completed', completedAt: '2026-03-01', participants: ['Anna'] });
  const open = course('3', ['69']);

  it('counts lines and distance by category', () => {
    const p = computeProgress([done, later, open], lines, [], 5, CATEGORIES);
    expect(p.total).toMatchObject({ lines: 4, doneLines: 2, plannedLines: 1, lengthM: 14000, doneM: 9000 });
    expect(p.byCategory.map((c) => [c.category, c.doneLines, c.lines])).toEqual([['stadsbuss', 1, 3], ['tram', 1, 1]]);
    expect(p.completedCourses).toBe(2);
    expect(p.runM).toBe(9000);
  });

  it('totals per person, most distance first, including people with no runs', () => {
    const p = computeProgress([done, later, open], lines, ['Anna', 'Bo', 'Cy'], 5, CATEGORIES);
    expect(p.people).toEqual([
      { name: 'Anna', courses: 2, distanceM: 9000 },
      { name: 'Bo', courses: 1, distanceM: 5000 },
      { name: 'Cy', courses: 0, distanceM: 0 },
    ]);
  });

  it('counts only stadsbuss by default, in totals, rows and per person', () => {
    const p = computeProgress([done, later, open], lines, ['Anna', 'Bo']);
    expect(p.total).toMatchObject({ lines: 3, doneLines: 1, lengthM: 10000, doneM: 5000 });
    expect(p.byCategory.map((c) => c.category)).toEqual(['stadsbuss']);
    expect(p.runM).toBe(5000);
    expect(p.people.map((x) => [x.name, x.distanceM])).toEqual([['Anna', 5000], ['Bo', 5000]]);
  });

  it('counts only the included legs of a mixed course', () => {
    const mixed = course('4', ['59', 'T1'], { status: 'Completed', completedAt: '2026-04-01', participants: ['Cy'] });
    expect(computeProgress([mixed], lines, [], 5, ['stadsbuss']).runM).toBe(5000);
    expect(computeProgress([mixed], lines, [], 5, ['tram']).runM).toBe(4000);
    expect(computeProgress([mixed], lines, [], 5, CATEGORIES).runM).toBe(9000);
  });

  it('lists recent completions newest first and ignores open courses', () => {
    const p = computeProgress([done, later, open], lines, [], 1);
    expect(p.recent.map((r) => r.id)).toEqual(['2']);
  });

  it('copes with no courses and no lines', () => {
    const p = computeProgress([], []);
    expect(p.total.lines).toBe(0);
    expect(p.recent).toEqual([]);
  });
  it.each(['other-bus', 'ferry'] as const)('counts %s only when that category is included', (category) => {
    const regional = line('vt.9011014405900000', 10000, category);
    const all = [...lines, regional];
    expect(computeProgress([], all).total.lines).toBe(3);
    expect(computeProgress([], all, [], 5, [category]).total).toMatchObject({ lines: 1, lengthM: 10000 });
  });
});

describe('progress categories setting', () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }, configurable: true });

  it('defaults to stadsbuss and falls back on bad values', () => {
    store.clear();
    expect(loadProgressCategories()).toEqual(DEFAULT_PROGRESS_CATEGORIES);
    store.set('rb.progressCategories', '{not json');
    expect(loadProgressCategories()).toEqual(['stadsbuss']);
    store.set('rb.progressCategories', JSON.stringify(['bogus']));
    expect(loadProgressCategories()).toEqual(['stadsbuss']);
  });

  it('round-trips a saved choice', () => {
    saveProgressCategories(['tram', 'express']);
    expect(loadProgressCategories()).toEqual(['express', 'tram']);
  });
  it.each(['other-bus', 'ferry'] as const)('round-trips the %s category', (category) => {
    saveProgressCategories([category]);
    expect(loadProgressCategories()).toEqual([category]);
  });

  it('adds categories in canonical order and keeps the last one', () => {
    expect(toggleProgressCategory(['stadsbuss'], 'tram')).toEqual(['stadsbuss', 'tram']);
    expect(toggleProgressCategory(['stadsbuss', 'tram'], 'tram')).toEqual(['stadsbuss']);
    expect(toggleProgressCategory(['stadsbuss'], 'stadsbuss')).toEqual(['stadsbuss']);
  });
});
