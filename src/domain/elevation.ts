import { pathLengthM } from './geo';
import { courseStats, legEnd, legLengthM, legStart, orientedCoordinates, type Course, type Leg } from './course';
import type { Line } from './types';

export interface ElevationSample {
  /** Metres along the route in the line's stored coordinate order. */
  distanceM: number;
  /** Null marks terrain ranges that could not be measured or safely estimated. */
  elevationM: number | null;
  estimated: boolean;
}

export interface ElevationProfile {
  schemaVersion: 1;
  routeKey: string;
  geometryHash: string;
  lengthM: number;
  samples: ElevationSample[];
}

export interface ElevationPoint extends ElevationSample {
  /** Metres from the beginning of the course. */
  courseDistanceM: number;
}

export interface ElevationSummary {
  ascentM: number | null;
  descentM: number | null;
  lowestM: number | null;
  highestM: number | null;
  steepest200m: { startM: number; endM: number; changeM: number } | null;
  coveredM: number;
  totalM: number;
  incomplete: boolean;
}

export interface CourseElevation {
  points: ElevationPoint[];
  summary: ElevationSummary;
}

const HASH = /^[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Matches the build pipeline's SHA-256 identity: JSON.stringify(route coordinates). */
export async function routeGeometryHash(coordinates: readonly (readonly [number, number])[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(coordinates));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseElevationProfile(value: unknown, expected?: { routeKey: string; geometryHash: string }): ElevationProfile {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.routeKey !== 'string' || value.routeKey.length === 0 ||
      typeof value.geometryHash !== 'string' || !HASH.test(value.geometryHash) ||
      typeof value.lengthM !== 'number' || !Number.isFinite(value.lengthM) || value.lengthM <= 0 ||
      !Array.isArray(value.samples) || value.samples.length < 2) {
    throw new Error('Invalid elevation profile');
  }
  if (expected && (value.routeKey !== expected.routeKey || value.geometryHash !== expected.geometryHash)) {
    throw new Error('Elevation profile does not match route geometry');
  }
  const lengthM = value.lengthM;
  let previousDistance = -1;
  const samples = value.samples.map((sample): ElevationSample => {
    if (!object(sample) || typeof sample.distanceM !== 'number' || !Number.isFinite(sample.distanceM) ||
        sample.distanceM < 0 || sample.distanceM > lengthM ||
        (sample.elevationM !== null && (typeof sample.elevationM !== 'number' || !Number.isFinite(sample.elevationM))) ||
        typeof sample.estimated !== 'boolean' || sample.distanceM <= previousDistance) {
      throw new Error('Invalid elevation sample');
    }
    previousDistance = sample.distanceM;
    return { distanceM: sample.distanceM, elevationM: sample.elevationM, estimated: sample.estimated };
  });
  if (samples[0].distanceM !== 0 || samples[samples.length - 1].distanceM !== lengthM) {
    throw new Error('Elevation profile must include exact endpoints');
  }
  return {
    schemaVersion: 1,
    routeKey: value.routeKey,
    geometryHash: value.geometryHash,
    lengthM,
    samples,
  };
}

export async function profileMatchesLine(profile: ElevationProfile, line: Pick<Line, 'key' | 'coordinates'>): Promise<boolean> {
  return profile.routeKey === line.key && profile.geometryHash === await routeGeometryHash(line.coordinates);
}

/** Interpolates a coordinate at a distance along a route in stored or running order. */
export function coordinateAtDistance(coordinates: readonly (readonly [number, number])[], distanceM: number): [number, number] | null {
  if (coordinates.length < 2 || !Number.isFinite(distanceM) || distanceM < 0) return null;
  const total = pathLengthM(coordinates);
  if (total <= 0) return null;
  const target = Math.min(distanceM, total);
  let traversed = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const segment = pathLengthM([coordinates[i - 1], coordinates[i]]);
    if (traversed + segment >= target || i === coordinates.length - 1) {
      const ratio = segment === 0 ? 0 : (target - traversed) / segment;
      return [
        coordinates[i - 1][0] + (coordinates[i][0] - coordinates[i - 1][0]) * ratio,
        coordinates[i - 1][1] + (coordinates[i][1] - coordinates[i - 1][1]) * ratio,
      ];
    }
    traversed += segment;
  }
  return [...coordinates[coordinates.length - 1]];
}

/** Returns null for a course gap or a manual leg, which have no route geometry. */
export function coordinateAtCourseDistance(legs: readonly Leg[], distanceM: number): [number, number] | null {
  if (!Number.isFinite(distanceM) || distanceM < 0) return null;
  const gaps = new Map(courseStats([...legs]).gaps.map((gap) => [gap.afterIndex, gap.m]));
  let offsetM = 0;
  for (const [index, leg] of legs.entries()) {
    const lengthM = legLengthM(leg);
    if (leg.kind === 'line' && distanceM <= offsetM + lengthM) {
      const coordinates = orientedCoordinates(leg);
      const actualLength = pathLengthM(coordinates);
      return coordinateAtDistance(coordinates, (distanceM - offsetM) / lengthM * actualLength);
    }
    offsetM += lengthM;
    const gapM = gaps.get(index) ?? 0;
    if (distanceM <= offsetM + gapM) return null;
    offsetM += gapM;
  }
  return null;
}

function measuredDistance(points: readonly ElevationPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].elevationM !== null && points[i].elevationM !== null) {
      total += points[i].courseDistanceM - points[i - 1].courseDistanceM;
    }
  }
  return total;
}

function climbDescent(points: readonly ElevationPoint[], thresholdM: number): { ascentM: number; descentM: number } {
  let ascentM = 0;
  let descentM = 0;
  let low = NaN;
  let high = NaN;
  let trend: -1 | 0 | 1 = 0;
  const reset = (value: number) => {
    low = value;
    high = value;
    trend = 0;
  };
  for (const point of points) {
    const value = point.elevationM;
    if (value === null) {
      reset(NaN);
      continue;
    }
    if (Number.isNaN(low)) {
      reset(value);
      continue;
    }
    if (trend === 0) {
      if (value < low) low = value;
      if (value > high) high = value;
      if (value - low >= thresholdM) {
        trend = 1;
        high = value;
      } else if (high - value >= thresholdM) {
        trend = -1;
        low = value;
      }
    } else if (trend === 1) {
      if (value > high) high = value;
      else if (high - value >= thresholdM) {
        ascentM += high - low;
        trend = -1;
        low = value;
      }
    } else if (value < low) low = value;
    else if (value - low >= thresholdM) {
      descentM += high - low;
      trend = 1;
      high = value;
    }
  }
  if (trend === 1) ascentM += high - low;
  else if (trend === -1) descentM += high - low;
  return { ascentM, descentM };
}

function elevationAt(points: readonly ElevationPoint[], targetM: number): number | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (targetM < a.courseDistanceM || targetM > b.courseDistanceM ||
        a.elevationM === null || b.elevationM === null) continue;
    const ratio = b.courseDistanceM === a.courseDistanceM ? 0 : (targetM - a.courseDistanceM) / (b.courseDistanceM - a.courseDistanceM);
    return a.elevationM + (b.elevationM - a.elevationM) * ratio;
  }
  return null;
}

function steepest200m(points: readonly ElevationPoint[]): ElevationSummary['steepest200m'] {
  const WINDOW_M = 200;
  let steepest: ElevationSummary['steepest200m'] = null;
  const starts = new Set(points.flatMap((point) => [point.courseDistanceM, point.courseDistanceM - WINDOW_M]).filter((distance) => distance >= 0));
  for (const startM of starts) {
    const start = elevationAt(points, startM);
    const endM = startM + WINDOW_M;
    const end = elevationAt(points, endM);
    if (start === null || end === null) continue;
    const changeM = end - start;
    if (!steepest || Math.abs(changeM) > Math.abs(steepest.changeM)) {
      steepest = { startM, endM, changeM };
    }
  }
  return steepest;
}

export function summarizeElevation(points: readonly ElevationPoint[], totalM: number, incomplete: boolean, hysteresisM = 2): ElevationSummary {
  if (!Number.isFinite(hysteresisM) || hysteresisM <= 0) throw new Error('Elevation hysteresis must be positive');
  const heights = points.flatMap((point) => point.elevationM === null ? [] : [point.elevationM]);
  const coveredM = measuredDistance(points);
  const complete = !incomplete && coveredM >= totalM - 1;
  const climb = climbDescent(points, hysteresisM);
  return {
    ascentM: complete ? climb.ascentM : null,
    descentM: complete ? climb.descentM : null,
    lowestM: heights.length ? Math.min(...heights) : null,
    highestM: heights.length ? Math.max(...heights) : null,
    steepest200m: steepest200m(points),
    coveredM,
    totalM,
    incomplete: !complete,
  };
}

function appendGap(points: ElevationPoint[], distanceM: number) {
  points.push({ courseDistanceM: distanceM, distanceM: 0, elevationM: null, estimated: false });
}

/** Joins snapshot-bound route profiles without inventing elevation for gaps or manual legs. */
export function elevationProfileId(routeKey: string, geometryHash: string): string {
  return `${routeKey}:${geometryHash}`;
}

export async function buildCourseElevation(course: Pick<Course, 'legs'>, profiles: ReadonlyMap<string, ElevationProfile>): Promise<CourseElevation> {
  const points: ElevationPoint[] = [];
  let offsetM = 0;
  let incomplete = false;
  for (const [index, leg] of course.legs.entries()) {
    if (leg.kind === 'manual') {
      if (leg.lengthM === null) incomplete = true;
      else offsetM += leg.lengthM;
    } else {
      appendGap(points, offsetM);
      const geometryHash = await routeGeometryHash(leg.line.coordinates);
      const profile = profiles.get(elevationProfileId(leg.line.key, geometryHash));
      if (profile && profile.routeKey === leg.line.key && profile.geometryHash === geometryHash) {
        const samples = smoothProfileSamples(orientedProfileSamples(profile, leg.reversed));
        for (const sample of samples) {
          points.push({
            ...sample,
            courseDistanceM: offsetM + sample.distanceM / profile.lengthM * leg.line.lengthM,
          });
        }
      } else {
        appendGap(points, offsetM);
        appendGap(points, offsetM + leg.line.lengthM);
        incomplete = true;
      }
      offsetM += leg.line.lengthM;
    }
    const next: Leg | undefined = course.legs[index + 1];
    if (next) {
      const end = legEnd(leg);
      const start = legStart(next);
      if (end && start) offsetM += pathLengthM([[end.lon, end.lat], [start.lon, start.lat]]);
      appendGap(points, offsetM);
    }
  }
  return { points, summary: summarizeElevation(points, offsetM, incomplete) };
}

export const SMOOTHING = { medianHalfWindowM: 50, gaussianSigmaM: 50 } as const;

/** Splits samples into runs of consecutive measured heights; smoothing never crosses a gap. */
function measuredRuns(samples: readonly ElevationSample[]): ElevationSample[][] {
  const runs: ElevationSample[][] = [];
  let run: ElevationSample[] = [];
  for (const sample of samples) {
    if (sample.elevationM === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(sample);
  }
  if (run.length) runs.push(run);
  return runs;
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const mid = values.length >> 1;
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/**
 * Removes surface-model noise from a profile that a runner follows along the road.
 * The median drops short buildings and trees beside the route; the Gaussian then
 * evens out raster steps. Both windows are symmetric in distance, so the result is
 * the same whichever direction the route is run.
 */
export function smoothProfileSamples(
  samples: readonly ElevationSample[],
  { medianHalfWindowM, gaussianSigmaM }: { medianHalfWindowM: number; gaussianSigmaM: number } = SMOOTHING,
): ElevationSample[] {
  const smoothed = new Map<ElevationSample, number>();
  for (const run of measuredRuns(samples)) {
    const heights = run.map((sample) => sample.elevationM!);
    const window = (center: number, halfM: number) => {
      // Shrinking the window near the ends keeps it symmetric, so steady climbs are not flattened.
      const d = run[center].distanceM;
      const reach = Math.min(halfM, d - run[0].distanceM, run[run.length - 1].distanceM - d);
      let from = center;
      let to = center;
      while (from > 0 && d - run[from - 1].distanceM <= reach) from--;
      while (to < run.length - 1 && run[to + 1].distanceM - d <= reach) to++;
      return [from, to] as const;
    };
    const medians = run.map((_, i) => {
      if (medianHalfWindowM <= 0) return heights[i];
      const [from, to] = window(i, medianHalfWindowM);
      return median(heights.slice(from, to + 1));
    });
    run.forEach((sample, i) => {
      if (gaussianSigmaM <= 0) {
        smoothed.set(sample, medians[i]);
        return;
      }
      // Gaussian-weighted local linear fit: unlike a plain average it keeps steady grades
      // exact even where the window is cut off at a run end.
      let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0;
      const reach = gaussianSigmaM * 3;
      let from = i;
      let to = i;
      while (from > 0 && sample.distanceM - run[from - 1].distanceM <= reach) from--;
      while (to < run.length - 1 && run[to + 1].distanceM - sample.distanceM <= reach) to++;
      for (let j = from; j <= to; j++) {
        const dx = run[j].distanceM - sample.distanceM;
        const w = Math.exp(-0.5 * (dx / gaussianSigmaM) ** 2);
        s0 += w; s1 += w * dx; s2 += w * dx * dx; t0 += w * medians[j]; t1 += w * dx * medians[j];
      }
      const det = s0 * s2 - s1 * s1;
      smoothed.set(sample, det > 1e-9 * s0 * s2 ? (s2 * t0 - s1 * t1) / det : t0 / s0);
    });
  }
  return samples.map((sample) => ({ ...sample, elevationM: smoothed.get(sample) ?? null }));
}

/** Reverses profile sample order and measures them in the running direction. */
export function orientedProfileSamples(profile: ElevationProfile, reversed: boolean): ElevationSample[] {
  return reversed
    ? [...profile.samples].reverse().map((sample) => ({ ...sample, distanceM: profile.lengthM - sample.distanceM }))
    : profile.samples.map((sample) => ({ ...sample }));
}
