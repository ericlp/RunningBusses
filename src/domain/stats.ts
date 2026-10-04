import { courseStats, routeStatuses, type Course } from './course';
import { CATEGORIES, type Category, type Line } from './types';

export const MAX_PERSON_NAME = 40;

/** Trims and collapses spaces; empty when nothing usable is left. */
export const cleanName = (raw: string): string => raw.replace(/\s+/g, ' ').trim().slice(0, MAX_PERSON_NAME);

/** Adds a name unless someone with the same name (ignoring case) exists; the existing spelling wins. */
export function addPerson(people: readonly string[], raw: string): string[] {
  const name = cleanName(raw);
  if (!name || people.some((p) => p.toLowerCase() === name.toLowerCase())) return [...people];
  return [...people, name];
}

/** Stored people plus anyone named on a course, so imported courses never reference an unknown person. */
export function knownPeople(stored: readonly string[], courses: readonly Course[]): string[] {
  let all = stored.reduce<string[]>(addPerson, []);
  for (const c of courses) for (const p of c.participants ?? []) all = addPerson(all, p);
  return all;
}

/** People that no course mentions, which are the only ones that can be removed without rewriting history. */
export const unusedPeople = (people: readonly string[], courses: readonly Course[]): string[] => {
  const used = new Set(courses.flatMap((c) => c.participants ?? []).map((p) => p.toLowerCase()));
  return people.filter((p) => !used.has(p.toLowerCase()));
};

export interface CategoryProgress {
  category: Category;
  lines: number;
  doneLines: number;
  plannedLines: number;
  lengthM: number;
  doneM: number;
}

export interface PersonProgress {
  name: string;
  courses: number;
  distanceM: number;
}

export interface RecentRun {
  id: string;
  name: string;
  date: string;
  distanceM: number;
  participants: string[];
}

export interface Progress {
  total: CategoryProgress;
  byCategory: CategoryProgress[];
  completedCourses: number;
  /** Distance run: whole completed courses, gaps between legs included. */
  runM: number;
  people: PersonProgress[];
  recent: RecentRun[];
}

const empty = (category: Category): CategoryProgress => ({ category, lines: 0, doneLines: 0, plannedLines: 0, lengthM: 0, doneM: 0 });

/** Everything on the dashboard, derived from the courses and the current line data. */
export function computeProgress(courses: readonly Course[], lines: readonly Line[], people: readonly string[] = [], recentCount = 5): Progress {
  const status = routeStatuses([...courses]);
  const rows = new Map<Category, CategoryProgress>();
  const total = empty('stadsbuss');
  for (const l of lines) {
    const row = rows.get(l.category) ?? empty(l.category);
    rows.set(l.category, row);
    const st = status.get(l.key)?.status;
    for (const r of [row, total]) {
      r.lines++;
      r.lengthM += l.lengthM;
      if (st === 'Completed') {
        r.doneLines++;
        r.doneM += l.lengthM;
      } else if (st === 'NotCompleted') r.plannedLines++;
    }
  }

  const done = courses.filter((c) => c.status === 'Completed');
  const distance = new Map(done.map((c) => [c.id, courseStats(c.legs).totalM]));
  const perPerson = new Map<string, PersonProgress>();
  for (const p of people) perPerson.set(p.toLowerCase(), { name: p, courses: 0, distanceM: 0 });
  for (const c of done) {
    for (const p of c.participants ?? []) {
      const row = perPerson.get(p.toLowerCase()) ?? { name: p, courses: 0, distanceM: 0 };
      perPerson.set(p.toLowerCase(), row);
      row.courses++;
      row.distanceM += distance.get(c.id) ?? 0;
    }
  }

  const recent = done
    .filter((c) => c.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, recentCount)
    .map((c) => ({ id: c.id, name: c.name, date: c.completedAt!.slice(0, 10), distanceM: distance.get(c.id) ?? 0, participants: c.participants ?? [] }));

  return {
    total,
    byCategory: CATEGORIES.flatMap((c) => (rows.has(c) ? [rows.get(c)!] : [])),
    completedCourses: done.length,
    runM: [...distance.values()].reduce((s, m) => s + m, 0),
    people: [...perPerson.values()].sort((a, b) => b.distanceM - a.distanceM || a.name.localeCompare(b.name)),
    recent,
  };
}
