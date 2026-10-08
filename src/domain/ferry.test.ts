import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup } from './backup';
import { routeStatuses, type Course } from './course';
import { applyFilters, defaultFilters } from './filter';
import { reconcileCourses } from './reconcile';
import { decodeShare, encodeShare } from './share';
import { computeProgress } from './stats';
import type { Line } from './types';

const lines: Line[] = ['59', 'vt.9011014505900000', 'vt.9011014505900000r'].map((key) => ({
  key, number: '59', label: key.endsWith('r') ? '59 retur' : '59',
  category: key === '59' ? 'stadsbuss' : 'ferry',
  tags: key.endsWith('r') ? ['retur'] : [], from: 'A', to: 'B', lengthM: 1000, via: [],
  coordinates: [[11.9, 57.7], [11.91, 57.71]],
}));
const courses: Course[] = lines.map((line, i) => ({
  id: String(i), name: line.key, status: 'NotCompleted', createdAt: 'a', updatedAt: 'b', completedAt: null,
  legs: [{ kind: 'line', reversed: false, line }],
}));

describe('ferry courses', () => {
  it('keeps ferry identities separate from buses and out of default filters and progress', () => {
    expect(routeStatuses(courses).size).toBe(3);
    expect(applyFilters(lines, defaultFilters)).toEqual([lines[0]]);
    expect(applyFilters(lines, { ...defaultFilters, categories: ['ferry'] })).toEqual(lines.slice(1));
    expect(computeProgress(courses, lines).total.lines).toBe(1);
    expect(computeProgress(courses, lines, [], 5, ['ferry']).total).toMatchObject({ lines: 2, plannedLines: 2, lengthM: 2000 });
  });
  it('retains ferry snapshots in backups and rebuilds ferry and return keys in shared mixed courses', async () => {
    const parsed = parseBackup(JSON.stringify(makeBackup(courses, 500)));
    expect(parsed.ok && parsed.backup.courses).toEqual(courses);
    const decoded = await decodeShare(await encodeShare(courses, 'feed'), lines);
    expect(decoded.ok && decoded.shared.backup.courses).toEqual(courses);
  });
  it('updates open ferries without changing completed or pinned ferry snapshots', () => {
    const snapshots = [
      { ...courses[1], status: 'Completed' as const },
      { ...courses[2], pinned: true },
    ];
    const fresh = lines.map((l) => ({ ...l, lengthM: 2000 }));
    const result = reconcileCourses([courses[1], snapshots[1]], fresh, 'now');
    expect(result.changes.map((c) => c.courseId)).toEqual(['1']);
    expect(result.courses[1]).toBe(snapshots[1]);
    expect(reconcileCourses(snapshots, fresh, 'now').courses).toEqual(snapshots);
  });
});
