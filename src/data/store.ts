import type { Course, Leg } from '../domain/course';
import { isLogEntry, type LogEntry } from '../domain/log';
import { idbGet, idbSet } from './idb';

export interface Draft {
  name: string;
  legs: Leg[];
  /** Set when the draft is an edit of this saved course rather than a new course. */
  editingId?: string;
}

export const DEFAULT_RADIUS_M = 500;

export async function loadCourses(): Promise<Course[]> {
  return (await idbGet<Course[]>('courses')) ?? [];
}

/** Resolves only after the write has completed, so callers can show "saved" honestly. */
export function saveCourses(courses: Course[]): Promise<void> {
  return idbSet('courses', courses);
}

export async function loadPeople(): Promise<string[]> {
  const v = await idbGet<unknown>('people');
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function savePeople(people: string[]): Promise<void> {
  return idbSet('people', people);
}

export async function loadLog(): Promise<LogEntry[]> {
  const v = await idbGet<unknown>('log');
  return Array.isArray(v) ? v.filter(isLogEntry) : [];
}

export function saveLog(log: LogEntry[]): Promise<void> {
  return idbSet('log', log);
}

export async function loadDraft(): Promise<Draft | null> {
  return (await idbGet<Draft>('draft')) ?? null;
}

export function saveDraft(draft: Draft | null): Promise<void> {
  return idbSet('draft', draft);
}

export function loadRadius(): number {
  const v = Number(localStorage.getItem('radiusM'));
  return Number.isFinite(v) && v >= 50 && v <= 5000 ? v : DEFAULT_RADIUS_M;
}

export function saveRadius(m: number): void {
  localStorage.setItem('radiusM', String(m));
}

export interface Recovery {
  savedAt: string;
  courses: Course[];
}

/** The state from just before the last import, so a wrong import can be undone from a file. */
export async function loadRecovery(): Promise<Recovery | null> {
  return (await idbGet<Recovery>('recovery')) ?? null;
}

export function saveRecovery(r: Recovery): Promise<void> {
  return idbSet('recovery', r);
}
