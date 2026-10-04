import type { Leg } from './course';
import type { Line } from './types';

export interface StopPoint {
  name: string;
  /** [lon, lat] */
  at: [number, number];
}

/** Stops of a line with their positions. Empty for data from before stop positions were published. */
export function lineStops(line: Line): StopPoint[] {
  const at = line.viaAt;
  if (!at || at.length !== line.via.length) return [];
  return line.via.map((name, i) => ({ name, at: at[i] }));
}

/** Stops along the legs of a course or draft; a stop shared by two legs appears once. */
export function legStops(legs: readonly Leg[]): StopPoint[] {
  const seen = new Set<string>();
  const out: StopPoint[] = [];
  for (const leg of legs) {
    if (leg.kind !== 'line') continue;
    for (const s of lineStops(leg.line)) {
      const id = `${s.name}|${s.at[0]}|${s.at[1]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(s);
    }
  }
  return out;
}
