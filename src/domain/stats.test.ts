import { describe, expect, it } from 'vitest';
import type { Course } from './course';
import { addPerson, cleanName, computeProgress, knownPeople, unusedPeople } from './stats';
import type { Line } from './types';

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
    const p = computeProgress([done, later, open], lines);
    expect(p.total).toMatchObject({ lines: 4, doneLines: 2, plannedLines: 1, lengthM: 14000, doneM: 9000 });
    expect(p.byCategory.map((c) => [c.category, c.doneLines, c.lines])).toEqual([['stadsbuss', 1, 3], ['tram', 1, 1]]);
    expect(p.completedCourses).toBe(2);
    expect(p.runM).toBe(9000);
  });

  it('totals per person, most distance first, including people with no runs', () => {
    const p = computeProgress([done, later, open], lines, ['Anna', 'Bo', 'Cy']);
    expect(p.people).toEqual([
      { name: 'Anna', courses: 2, distanceM: 9000 },
      { name: 'Bo', courses: 1, distanceM: 5000 },
      { name: 'Cy', courses: 0, distanceM: 0 },
    ]);
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
});
