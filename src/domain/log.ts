import { courseStats, type Course } from './course';

export const MAX_LOG = 500;

/** One completion event. The log outlives courses: un-completing or deleting a course does not erase its history. */
export interface LogEntry {
  id: string;
  /** When it happened (ISO timestamp). */
  at: string;
  kind: 'completed' | 'uncompleted';
  courseId: string;
  name: string;
  /** The date the course was run (completed entries only). */
  date: string | null;
  participants: string[];
  distanceM: number;
}

export function makeEntry(kind: LogEntry['kind'], course: Course, now = new Date(), id: string = crypto.randomUUID()): LogEntry {
  return {
    id,
    at: now.toISOString(),
    kind,
    courseId: course.id,
    name: course.name,
    date: kind === 'completed' ? (course.completedAt?.slice(0, 10) ?? null) : null,
    participants: course.participants ?? [],
    distanceM: Math.round(courseStats(course.legs).totalM),
  };
}

const byNewest = (a: LogEntry, b: LogEntry) => b.at.localeCompare(a.at);

/** Newest first, capped. */
export const addEntry = (log: readonly LogEntry[], entry: LogEntry): LogEntry[] => [entry, ...log].sort(byNewest).slice(0, MAX_LOG);

export const removeEntry = (log: readonly LogEntry[], id: string): LogEntry[] => log.filter((e) => e.id !== id);

/** Union by id; the same event on two devices appears once. */
export function mergeLog(a: readonly LogEntry[], b: readonly LogEntry[]): LogEntry[] {
  const byId = new Map<string, LogEntry>();
  for (const e of [...a, ...b]) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort(byNewest).slice(0, MAX_LOG);
}

const isStr = (v: unknown): v is string => typeof v === 'string';

export function isLogEntry(v: unknown): v is LogEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    isStr(e.id) &&
    e.id !== '' &&
    isStr(e.at) &&
    (e.kind === 'completed' || e.kind === 'uncompleted') &&
    isStr(e.courseId) &&
    isStr(e.name) &&
    (e.date === null || isStr(e.date)) &&
    Array.isArray(e.participants) &&
    e.participants.every(isStr) &&
    typeof e.distanceM === 'number' &&
    Number.isFinite(e.distanceM)
  );
}
