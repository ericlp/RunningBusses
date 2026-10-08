import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup, lineKeys } from './backup';
import { routeStatuses, type Course } from './course';
import { reconcileCourses } from './reconcile';
import { encodeShare, decodeShare } from './share';
import type { Line } from './types';

const lines: Line[] = ['59', 'vt.9011014405900000', 'vt.9011014405900000r'].map((key) => ({
  key, number: '59', label: key.endsWith('r') ? '59 retur' : '59',
  category: key === '59' ? 'stadsbuss' : 'other-bus',
  tags: [], from: key, to: 'B', lengthM: 1000, via: [],
  coordinates: [[11.9, 57.7], [11.91, 57.71]],
}));
const courses: Course[] = lines.map((line, i) => ({
  id: String(i), name: line.from, status: 'NotCompleted',
  createdAt: 'a', updatedAt: 'b', completedAt: null,
  legs: [{ kind: 'line', reversed: false, line }],
}));

describe('duplicate-number regional courses', () => {
  it('keeps ownership and backup snapshots separate by key', () => {
    expect(routeStatuses(courses).size).toBe(3);
    const parsed = parseBackup(JSON.stringify(makeBackup(courses, 500)));
    expect(parsed.ok && parsed.backup.courses).toEqual(courses);
    expect(courses.flatMap(lineKeys)).toEqual(lines.map((l) => l.key));
  });
  it('round-trips namespaced and return identities through share links', async () => {
    const decoded = await decodeShare(await encodeShare(courses, 'feed'), lines);
    expect(decoded.ok && decoded.shared.backup.courses).toEqual(courses);
  });
  it('reconciles only the matching identity and preserves completed and pinned snapshots', () => {
    const snapshots = [courses[0], { ...courses[1], status: 'Completed' as const }, { ...courses[2], pinned: true }];
    const fresh = lines.map((l) => ({ ...l, lengthM: 2000 }));
    const result = reconcileCourses(snapshots, fresh, 'now');
    expect(result.changes.map((c) => c.courseId)).toEqual(['0']);
    expect(result.courses[1]).toBe(snapshots[1]);
    expect(result.courses[2]).toBe(snapshots[2]);
  });
});
