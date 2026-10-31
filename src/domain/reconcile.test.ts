import { describe, expect, it } from 'vitest';
import type { Course } from './course';
import { missingLineKeys, previewRefresh, reconcileCourses, refreshLegs } from './reconcile';
import type { Line } from './types';

const line = (key: string, lengthM: number): Line => ({ key, number: key, label: key, category: 'stadsbuss', tags: [], from: 'A', to: 'B', lengthM, via: [], coordinates: [[11.9, 57.7], [11.91, 57.71]] });
const course = (id: string, l: Line, extra: Partial<Course> = {}): Course => ({ id, name: id, status: 'NotCompleted', createdAt: 'a', updatedAt: 'a', completedAt: null, legs: [{ kind: 'line', line: l, reversed: false }], ...extra });

describe('reconcileCourses', () => {
  const fresh = [line('59', 5000)];
  it('updates open courses and reports the new total', () => {
    const r = reconcileCourses([course('c', line('59', 4500))], fresh, 'now');
    expect(r.changes).toEqual([{ courseId: 'c', name: 'c', oldTotalM: 4500, newTotalM: 5000 }]);
    expect(r.courses[0].updatedAt).toBe('now');
    expect(r.courses[0].legs).toEqual([{ kind: 'line', line: fresh[0], reversed: false }]);
  });
  it('leaves completed and pinned courses alone', () => {
    const old = line('59', 4500);
    const cs = [course('done', old, { status: 'Completed' }), course('pin', old, { pinned: true })];
    const r = reconcileCourses(cs, fresh);
    expect(r.changes).toEqual([]);
    expect(r.courses).toBe(cs);
  });
  it('keeps lines that disappeared and reports them', () => {
    const c = course('c', line('77', 3000));
    expect(reconcileCourses([c], fresh).changes).toEqual([]);
    expect(missingLineKeys(c, fresh)).toEqual(['77']);
  });
  it('previews a pinned course', () => {
    expect(previewRefresh(course('p', line('59', 4500), { pinned: true }), fresh)?.newTotalM).toBe(5000);
    expect(previewRefresh(course('p', line('59', 5000)), fresh)).toBeNull();
  });
  it('adopts same-length geometry and stop changes without mutating snapshots or other legs', () => {
    const old = line('59', 4500);
    const missing = line('77', 3000);
    const c = course('c', old);
    c.legs = [
      { kind: 'line', line: old, reversed: true },
      { kind: 'manual', id: 'm', label: 'Walk', lengthM: 100 },
      { kind: 'line', line: missing, reversed: false },
    ];
    const current: Line = { ...old, from: 'New A', to: 'New B', via: ['New A'], viaAt: [[12, 58]], coordinates: [[12, 58], [12.01, 58.01]] };
    const currentBefore = structuredClone(current);
    const courses = [c];
    const before = structuredClone(courses);
    const result = reconcileCourses(courses, [current], 'now');
    expect(result.changes).toEqual([{ courseId: 'c', name: 'c', oldTotalM: 7600, newTotalM: 7600 }]);
    expect(result.courses[0].legs).toEqual([{ kind: 'line', line: current, reversed: true }, ...c.legs.slice(1)]);
    expect(result.courses[0].legs[1]).toBe(c.legs[1]);
    expect(result.courses[0].legs[2]).toBe(c.legs[2]);
    expect(courses).toEqual(before);
    expect(current).toEqual(currentBefore);
    expect(refreshLegs(c.legs, [structuredClone(old)])[0]).toBe(c.legs[0]);
  });
});
