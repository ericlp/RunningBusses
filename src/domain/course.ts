import { haversineM, type LatLon } from './geo';
import { lineLabel, localeTag, t } from '../i18n';
import type { Line } from './types';

export type CourseStatus = 'NotCompleted' | 'Completed';
export type RouteStatus = 'NotPlanned' | 'NotCompleted' | 'Completed';

/** A bus route run in one direction. The route is copied in, so the course survives data updates. */
export interface LineLeg {
  kind: 'line';
  line: Line;
  reversed: boolean;
}

/** A leg without map geometry, with a distance typed in by hand. */
export interface ManualLeg {
  kind: 'manual';
  id: string;
  label: string;
  lengthM: number | null;
}

export type Leg = LineLeg | ManualLeg;

export interface Course {
  id: string;
  name: string;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  legs: Leg[];
}

export interface Option {
  line: Line;
  reversed: boolean;
  /** Straight-line distance from the current end; null when there is no known end to measure from. */
  gapM: number | null;
}

export interface Gap {
  /** The gap lies between legs[afterIndex] and legs[afterIndex + 1]. */
  afterIndex: number;
  m: number;
}

export interface CourseStats {
  totalM: number;
  gaps: Gap[];
  gapM: number;
  /** True when a manual leg has no distance yet, so the total is a lower bound. */
  incomplete: boolean;
  startName: string | null;
  endName: string | null;
}

export const GAP_NOTE_THRESHOLD_M = 100;

const point = ([lon, lat]: [number, number]): LatLon => ({ lat, lon });

export function orientedCoordinates(leg: LineLeg): [number, number][] {
  return leg.reversed ? [...leg.line.coordinates].reverse() : leg.line.coordinates;
}

export function legStart(leg: Leg): LatLon | null {
  if (leg.kind === 'manual') return null;
  const c = leg.line.coordinates;
  return point(leg.reversed ? c[c.length - 1] : c[0]);
}

export function legEnd(leg: Leg): LatLon | null {
  if (leg.kind === 'manual') return null;
  const c = leg.line.coordinates;
  return point(leg.reversed ? c[0] : c[c.length - 1]);
}

export function legStartName(leg: Leg): string {
  return leg.kind === 'manual' ? leg.label : leg.reversed ? leg.line.to : leg.line.from;
}

export function legEndName(leg: Leg): string {
  return leg.kind === 'manual' ? leg.label : leg.reversed ? leg.line.from : leg.line.to;
}

export function legLabel(leg: Leg): string {
  return leg.kind === 'manual' ? leg.label : lineLabel(leg.line);
}

export function legLengthM(leg: Leg): number {
  return leg.kind === 'manual' ? (leg.lengthM ?? 0) : leg.line.lengthM;
}

export function courseStats(legs: Leg[]): CourseStats {
  const gaps: Gap[] = [];
  let lineSum = 0;
  let incomplete = false;
  legs.forEach((leg, i) => {
    lineSum += legLengthM(leg);
    if (leg.kind === 'manual' && leg.lengthM === null) incomplete = true;
    const next = legs[i + 1];
    if (!next) return;
    const a = legEnd(leg);
    const b = legStart(next);
    if (a && b) gaps.push({ afterIndex: i, m: haversineM(a, b) });
  });
  const gapM = gaps.reduce((s, g) => s + g.m, 0);
  return {
    totalM: lineSum + gapM,
    gaps,
    gapM,
    incomplete,
    startName: legs.length ? legStartName(legs[0]) : null,
    endName: legs.length ? legEndName(legs[legs.length - 1]) : null,
  };
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString(localeTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** "9,7 km (200 m)": the bracket shows the summed gaps, only when they exceed 100 m. */
export function formatTotal(s: CourseStats): string {
  const base = formatDistance(s.totalM);
  const text = s.gapM > GAP_NOTE_THRESHOLD_M ? `${base} (${formatDistance(s.gapM)})` : base;
  return s.incomplete ? t('total.atLeast', { text }) : text;
}

/** Legs that can come next. With no legs, or after a manual leg, any unused line qualifies in both directions. */
export function nextOptions(lines: Line[], usedKeys: ReadonlySet<string>, legs: Leg[], radiusM: number): Option[] {
  const end = legs.length ? legEnd(legs[legs.length - 1]) : null;
  const out: Option[] = [];
  for (const line of lines) {
    if (usedKeys.has(line.key)) continue;
    for (const reversed of [false, true]) {
      if (!end) {
        out.push({ line, reversed, gapM: null });
        continue;
      }
      const start = legStart({ kind: 'line', line, reversed })!;
      const gapM = haversineM(end, start);
      if (gapM <= radiusM) out.push({ line, reversed, gapM });
    }
  }
  return out.sort((a, b) => (a.gapM ?? 0) - (b.gapM ?? 0) || Number(a.line.number) - Number(b.line.number));
}

export function usedLineKeys(courses: Course[], extra: Leg[] = []): Set<string> {
  const keys = new Set<string>();
  for (const leg of [...courses.flatMap((c) => c.legs), ...extra]) if (leg.kind === 'line') keys.add(leg.line.key);
  return keys;
}

export interface RouteInfo {
  status: RouteStatus;
  courseId: string | null;
  courseName: string | null;
}

export function routeInfo(key: string, courses: Course[]): RouteInfo {
  for (const c of courses) {
    if (c.legs.some((l) => l.kind === 'line' && l.line.key === key)) {
      return { status: c.status === 'Completed' ? 'Completed' : 'NotCompleted', courseId: c.id, courseName: c.name };
    }
  }
  return { status: 'NotPlanned', courseId: null, courseName: null };
}

export function routeStatuses(courses: Course[]): Map<string, RouteInfo> {
  const m = new Map<string, RouteInfo>();
  for (const c of courses) {
    for (const l of c.legs) {
      if (l.kind === 'line') {
        m.set(l.line.key, { status: c.status === 'Completed' ? 'Completed' : 'NotCompleted', courseId: c.id, courseName: c.name });
      }
    }
  }
  return m;
}

export function sequenceLabel(legs: Leg[]): string {
  return legs.map(legLabel).join(' → ');
}

export const routeStatusLabel = (s: RouteStatus): string => t(`routeStatus.${s}`);

const hasLine = (legs: Leg[]) => legs.some((l) => l.kind === 'line');

/** Drops the first leg. Manual legs left at the front would have no start point, so they go too. */
export function removeFirst(legs: Leg[]): Leg[] {
  const rest = legs.slice(1);
  while (rest[0]?.kind === 'manual') rest.shift();
  return rest;
}

export function removeLast(legs: Leg[]): Leg[] {
  return legs.slice(0, -1);
}

export const canRemoveFirst = (legs: Leg[]) => hasLine(removeFirst(legs));
export const canRemoveLast = (legs: Leg[]) => legs.length > 1;

/** A split sits between legs[i - 1] and legs[i]; both halves must be non-empty and start with a real line. */
export function canSplitAt(legs: Leg[], i: number): boolean {
  return i >= 1 && i < legs.length && legs[i].kind === 'line';
}

export function splitAt(legs: Leg[], i: number): [Leg[], Leg[]] {
  if (!canSplitAt(legs, i)) throw new Error('Cannot split here');
  return [legs.slice(0, i), legs.slice(i)];
}

/** Reverses order and every line's direction. Not possible when a manual leg would end up first. */
export const canReverse = (legs: Leg[]) => legs.length > 0 && legs[legs.length - 1].kind === 'line';

export function reverseLegs(legs: Leg[]): Leg[] {
  if (!canReverse(legs)) throw new Error('Cannot reverse');
  return [...legs].reverse().map((l) => (l.kind === 'line' ? { ...l, reversed: !l.reversed } : l));
}
