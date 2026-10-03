import { courseStats, type Course, type Leg } from './course';
import type { Line } from './types';

export interface CourseChange {
  courseId: string;
  name: string;
  oldTotalM: number;
  newTotalM: number;
}

export interface Reconciled {
  courses: Course[];
  changes: CourseChange[];
}

const sameLine = (a: Line, b: Line) => JSON.stringify(a) === JSON.stringify(b);

/** Swaps each line leg for the current dataset's version of the same line. Lines no longer in the dataset keep their old copy. */
export function refreshLegs(legs: Leg[], lines: Line[]): Leg[] {
  const byKey = new Map(lines.map((l) => [l.key, l]));
  return legs.map((leg) => {
    if (leg.kind !== 'line') return leg;
    const cur = byKey.get(leg.line.key);
    return cur && !sameLine(cur, leg.line) ? { ...leg, line: cur } : leg;
  });
}

/** Line keys in a course that the dataset no longer contains. */
export function missingLineKeys(course: Course, lines: Line[]): string[] {
  const keys = new Set(lines.map((l) => l.key));
  return course.legs.flatMap((l) => (l.kind === 'line' && !keys.has(l.line.key) ? [l.line.key] : []));
}

export function previewRefresh(course: Course, lines: Line[]): CourseChange | null {
  const legs = refreshLegs(course.legs, lines);
  if (legs.every((l, i) => l === course.legs[i])) return null;
  return { courseId: course.id, name: course.name, oldTotalM: courseStats(course.legs).totalM, newTotalM: courseStats(legs).totalM };
}

/**
 * Monthly update: courses that are not completed and not pinned adopt the current route data.
 * Completed and pinned courses stay exactly as they are.
 */
export function reconcileCourses(courses: Course[], lines: Line[], now = new Date().toISOString()): Reconciled {
  const changes: CourseChange[] = [];
  const next = courses.map((c) => {
    if (c.status === 'Completed' || c.pinned) return c;
    const change = previewRefresh(c, lines);
    if (!change) return c;
    changes.push(change);
    return { ...c, legs: refreshLegs(c.legs, lines), updatedAt: now };
  });
  return { courses: changes.length ? next : courses, changes };
}
