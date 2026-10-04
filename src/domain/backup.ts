import type { Course, Leg } from './course';
import { isLogEntry, type LogEntry } from './log';
import { addPerson, cleanName, MAX_PERSON_NAME } from './stats';

export const BACKUP_FORMAT = 'running-busses-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  radiusM: number;
  /** The people list; older backups have none. */
  people: string[];
  /** Completion history; older backups have none. */
  log: LogEntry[];
  courses: Course[];
}

export type ParseError = 'tooLarge' | 'notJson' | 'notBackup' | 'newerVersion' | 'invalid';
export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: ParseError; detail?: string };

export function makeBackup(courses: Course[], radiusM: number, people: string[] = [], log: LogEntry[] = [], now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), radiusM, people, log, courses };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validLeg(l: unknown): l is Leg {
  if (!isObj(l)) return false;
  if (l.kind === 'manual') return isStr(l.id) && isStr(l.label) && (l.lengthM === null || (isNum(l.lengthM) && l.lengthM >= 0));
  if (l.kind !== 'line' || typeof l.reversed !== 'boolean' || !isObj(l.line)) return false;
  const n = l.line;
  if (!isStr(n.key) || !isStr(n.number) || !isStr(n.label) || !isStr(n.from) || !isStr(n.to)) return false;
  if (!isNum(n.lengthM) || n.lengthM < 0 || !Array.isArray(n.tags) || !Array.isArray(n.via)) return false;
  if (!Array.isArray(n.coordinates) || n.coordinates.length < 2) return false;
  return n.coordinates.every((c) => Array.isArray(c) && c.length === 2 && isNum(c[0]) && isNum(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90);
}

export const lineKeys = (c: Course): string[] => c.legs.flatMap((l) => (l.kind === 'line' ? [l.line.key] : []));

const validName = (v: unknown): v is string => isStr(v) && v === cleanName(v) && v !== '' && v.length <= MAX_PERSON_NAME;

function validCourse(c: unknown): c is Course {
  if (!isObj(c)) return false;
  return (
    isStr(c.id) &&
    c.id !== '' &&
    isStr(c.name) &&
    (c.status === 'Completed' || c.status === 'NotCompleted') &&
    isStr(c.createdAt) &&
    isStr(c.updatedAt) &&
    (c.completedAt === null || isStr(c.completedAt)) &&
    (c.participants === undefined || (Array.isArray(c.participants) && c.participants.length <= 100 && c.participants.every(validName))) &&
    Array.isArray(c.legs) &&
    c.legs.length > 0 &&
    c.legs.every(validLeg)
  );
}

/** Checks the whole file before anything is written. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'tooLarge' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) return { ok: false, error: 'notBackup' };
  if (!isNum(data.version) || data.version < 1) return { ok: false, error: 'invalid' };
  if (data.version > BACKUP_VERSION) return { ok: false, error: 'newerVersion' };
  if (!Array.isArray(data.courses)) return { ok: false, error: 'invalid' };
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const c of data.courses) {
    if (!validCourse(c)) return { ok: false, error: 'invalid', detail: isObj(c) && isStr(c.name) ? c.name : undefined };
    if (ids.has(c.id)) return { ok: false, error: 'invalid', detail: c.name };
    ids.add(c.id);
    for (const k of lineKeys(c)) {
      if (keys.has(k)) return { ok: false, error: 'invalid', detail: c.name };
      keys.add(k);
    }
  }
  const radius = isNum(data.radiusM) && data.radiusM >= 50 && data.radiusM <= 5000 ? data.radiusM : 500;
  if (data.people !== undefined && (!Array.isArray(data.people) || data.people.length > 200 || !data.people.every(validName))) return { ok: false, error: 'invalid' };
  if (data.log !== undefined && (!Array.isArray(data.log) || data.log.length > 2000 || !data.log.every(isLogEntry))) return { ok: false, error: 'invalid' };
  const people = ((data.people as string[] | undefined) ?? []).reduce<string[]>(addPerson, []);
  return {
    ok: true,
    backup: { format: BACKUP_FORMAT, version: data.version, exportedAt: isStr(data.exportedAt) ? data.exportedAt : '', radiusM: radius, people, log: (data.log as LogEntry[] | undefined) ?? [], courses: data.courses as Course[] },
  };
}

export type Choice = 'local' | 'imported';

export interface Conflict {
  kind: 'sameId' | 'ownership';
  imported: Course;
  /** The local courses the imported one clashes with. */
  local: Course[];
}

export const choiceKey = (kind: Conflict['kind'], importedId: string): string => `${kind}:${importedId}`;

export interface MergeResult {
  courses: Course[];
  conflicts: Conflict[];
  added: number;
  skipped: number;
}

/**
 * Merges imported courses into local ones. Identical copies are skipped. A same-id difference or a
 * line claimed by two different courses needs a choice (keyed by `choiceKey`); a choice
 * keeps one whole course and never splits another. Call again with more choices until no conflicts remain.
 */
export function mergeCourses(local: Course[], imported: Course[], choices: Record<string, Choice>): MergeResult {
  let work = [...local];
  const conflicts: Conflict[] = [];
  let added = 0;
  let skipped = 0;
  for (const c of imported) {
    const same = work.find((x) => x.id === c.id);
    if (same) {
      if (JSON.stringify(same) === JSON.stringify(c)) {
        skipped++;
        continue;
      }
      const ch = choices[choiceKey('sameId', c.id)];
      if (!ch) {
        conflicts.push({ kind: 'sameId', imported: c, local: [same] });
        continue;
      }
      if (ch === 'local') {
        skipped++;
        continue;
      }
      work = work.filter((x) => x.id !== c.id);
    }
    const mine = new Set(lineKeys(c));
    const clash = work.filter((x) => lineKeys(x).some((k) => mine.has(k)));
    if (clash.length) {
      const ch = choices[choiceKey('ownership', c.id)];
      if (!ch) {
        conflicts.push({ kind: 'ownership', imported: c, local: clash });
        continue;
      }
      if (ch === 'local') {
        skipped++;
        continue;
      }
      work = work.filter((x) => !clash.includes(x));
    }
    work.push(c);
    added++;
  }
  return { courses: work, conflicts, added, skipped };
}
