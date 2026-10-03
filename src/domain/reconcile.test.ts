import { describe, expect, it } from 'vitest';
import type { Course } from './course';
import { missingLineKeys, previewRefresh, reconcileCourses } from './reconcile';
import type { Line } from './types';

const line = (key: string, lengthM: number): Line => ({ key, number: key, label: key, category: 'stadsbuss', tags: [], from: 'A', to: 'B', lengthM, via: [], coordinates: [[11.9, 57.7], [11.91, 57.71]] });
const course = (id: string, l: Line, extra: Partial<Course> = {}): Course => ({ id, name: id, status: 'NotCompleted', createdAt: 'a', updatedAt: 'a', completedAt: null, legs: [{ kind: 'line', line: l, reversed: false }], ...extra });

describe('reconcileCourses', () => {
  const fresh = [line('59', 5000)];
  it('updates open courses and reports the new total', () => {
    const r = reconcileCourses([course('c', line('59', 4500))], fresh, 'now');
    expect(r.changes).toEqual([{ courseId: 'c', name: 'c', oldTotalM: 4500, newTotalM: 5000 }]);
    expect(r.courses[0].updatedAt).toBe('now');
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
});
