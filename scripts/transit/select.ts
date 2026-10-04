import { haversineM } from '../../src/domain/geo';
import type { Tag } from '../../src/domain/types';

/** Directions whose end points lie within this distance count as the same termini. */
const SAME_TERMINUS_M = 300;

export interface Pattern {
  direction: string;
  shapeId: string;
  from: string;
  to: string;
  /** [lon, lat] of the first and last point of the path. */
  start: [number, number];
  end: [number, number];
  trips: number;
  lengthM: number;
  callOrdered: boolean;
  via: string[];
  /** [lon, lat] of each stop in `via`. */
  viaAt: [number, number][];
}

export interface PlannedRoute {
  pattern: Pattern;
  suffix: '' | 'r';
  tags: Tag[];
}

/** Most frequent weekday pattern; ordinary service is preferred over call-ordered, ties go to the longer path. */
export function pickMain(patterns: Pattern[]): Pattern | undefined {
  const ordinary = patterns.filter((p) => !p.callOrdered);
  const pool = ordinary.length ? ordinary : patterns;
  return [...pool].sort((a, b) => b.trips - a.trips || b.lengthM - a.lengthM)[0];
}

/**
 * Decides which routes a line yields. Directions that differ clearly (length or termini)
 * become two routes, the second tagged "retur"; otherwise the busier direction is the path.
 */
export function planRoutes(patterns: Pattern[], lengthDifference: number): PlannedRoute[] {
  const dirs = [...new Set(patterns.map((p) => p.direction))].sort();
  const mains = dirs
    .map((d) => pickMain(patterns.filter((p) => p.direction === d)))
    .filter((p): p is Pattern => p !== undefined);
  const callOrdered = patterns.some((p) => p.callOrdered);
  const base = (p: Pattern, extra: Tag[] = []): Tag[] => {
    const tags: Tag[] = [...extra];
    if (callOrdered) tags.push('call-ordered');
    if (p.from === p.to) {
      // a loop is by nature one-way, so it only carries the more specific tag
      tags.push('loop');
      return tags.filter((t) => t !== 'one-way');
    }
    return tags;
  };

  if (mains.length === 0) return [];
  if (mains.length === 1) return [{ pattern: mains[0], suffix: '', tags: base(mains[0], ['one-way']) }];

  const [a, b] = mains;
  const diff = Math.abs(a.lengthM - b.lengthM) / Math.max(a.lengthM, b.lengthM);
  const near = (p: [number, number], q: [number, number]) =>
    haversineM({ lon: p[0], lat: p[1] }, { lon: q[0], lat: q[1] }) <= SAME_TERMINUS_M;
  const mirrored = near(a.start, b.end) && near(a.end, b.start);
  if (diff > lengthDifference || !mirrored) {
    return [
      { pattern: a, suffix: '', tags: base(a) },
      { pattern: b, suffix: 'r', tags: base(b, ['retur']) },
    ];
  }
  const main = b.trips > a.trips ? b : a;
  return [{ pattern: main, suffix: '', tags: base(main) }];
}
