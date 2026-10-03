import type { Category } from '../../src/domain/types';

export interface CategoryConfig {
  stadsbuss: { numberRange: [number, number]; exclude: number[] };
  stombuss: { numbers: number[] };
  express: { pattern: string };
  industri: { numberRange: [number, number] };
}

/** Which category a line name (the public line number, e.g. "59" or "X40") belongs to, if any. */
export function categoryOf(name: string, c: CategoryConfig): Category | undefined {
  if (new RegExp(c.express.pattern).test(name)) return 'express';
  if (!/^\d+$/.test(name)) return undefined;
  const n = Number(name);
  if (c.stombuss.numbers.includes(n)) return 'stombuss';
  const inRange = (r: [number, number]) => n >= r[0] && n <= r[1];
  if (inRange(c.stadsbuss.numberRange) && !c.stadsbuss.exclude.includes(n)) return 'stadsbuss';
  if (inRange(c.industri.numberRange)) return 'industri';
  return undefined;
}
