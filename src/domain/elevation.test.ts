import { describe, expect, it } from 'vitest';
import type { Course, Leg } from './course';
import {
  buildCourseElevation,
  coordinateAtCourseDistance,
  coordinateAtDistance,
  elevationProfileId,
  orientedProfileSamples,
  parseElevationProfile,
  routeGeometryHash,
  summarizeElevation,
  type ElevationPoint,
  type ElevationProfile,
} from './elevation';
import type { Line } from './types';

const dLat = (m: number) => m / 111195;
const line = (key: string, start: [number, number], lengthM: number, extra: Partial<Line> = {}): Line => ({
  key,
  number: key,
  label: key,
  category: 'stadsbuss',
  tags: [],
  from: `${key}-from`,
  to: `${key}-to`,
  lengthM,
  via: [],
  coordinates: [start, [start[0], start[1] + dLat(lengthM)]],
  ...extra,
});
const leg = (route: Line, reversed = false): Leg => ({ kind: 'line', line: route, reversed });
const course = (legs: Leg[]): Pick<Course, 'legs'> => ({ legs });
const profile = async (route: Line, heights: (number | null)[]): Promise<ElevationProfile> => {
  const lengthM = route.lengthM;
  return {
    schemaVersion: 1,
    routeKey: route.key,
    geometryHash: await routeGeometryHash(route.coordinates),
    lengthM,
    samples: heights.map((elevationM, i) => ({
      distanceM: i === heights.length - 1 ? lengthM : lengthM * i / (heights.length - 1),
      elevationM,
      estimated: false,
    })),
  };
};
const point = (courseDistanceM: number, elevationM: number | null): ElevationPoint => ({
  distanceM: courseDistanceM,
  courseDistanceM,
  elevationM,
  estimated: false,
});

describe('elevation profile validation and identity', () => {
  it('hashes the exact JSON coordinate sequence', async () => {
    expect(await routeGeometryHash([[11, 57], [12, 58]])).toMatch(/^[a-f0-9]{64}$/);
    expect(await routeGeometryHash([[11, 57], [12, 58]])).not.toBe(await routeGeometryHash([[12, 58], [11, 57]]));
  });

  it('accepts exact-endpoint samples and rejects malformed, unordered, or mismatched profiles', () => {
    const valid = {
      schemaVersion: 1,
      routeKey: '59',
      geometryHash: 'a'.repeat(64),
      lengthM: 25,
      samples: [
        { distanceM: 0, elevationM: 2, estimated: false },
        { distanceM: 25, elevationM: null, estimated: true },
      ],
    };
    expect(parseElevationProfile(valid)).toEqual(valid);
    expect(() => parseElevationProfile({ ...valid, samples: [...valid.samples].reverse() })).toThrow('sample');
    expect(() => parseElevationProfile({ ...valid, geometryHash: 'b'.repeat(64) }, { routeKey: '59', geometryHash: 'a'.repeat(64) })).toThrow('match');
    expect(() => parseElevationProfile({ ...valid, samples: [valid.samples[0], { ...valid.samples[1], distanceM: 24 }] })).toThrow('endpoints');
  });

  it('reverses distances and sample order for the actual running direction', () => {
    const source: ElevationProfile = {
      schemaVersion: 1,
      routeKey: '59',
      geometryHash: 'a'.repeat(64),
      lengthM: 100,
      samples: [
        { distanceM: 0, elevationM: 10, estimated: false },
        { distanceM: 40, elevationM: 14, estimated: true },
        { distanceM: 100, elevationM: 8, estimated: false },
      ],
    };
    expect(orientedProfileSamples(source, true)).toEqual([
      { distanceM: 0, elevationM: 8, estimated: false },
      { distanceM: 60, elevationM: 14, estimated: true },
      { distanceM: 100, elevationM: 10, estimated: false },
    ]);
  });
});

describe('elevation summary', () => {
  it('uses 2 m hysteresis to suppress small noise without double-counting climbs', () => {
    const summary = summarizeElevation([point(0, 0), point(100, 1), point(200, 0), point(300, 4), point(400, 3), point(500, 0)], 500, false);
    expect(summary).toMatchObject({ ascentM: 4, descentM: 4, lowestM: 0, highestM: 4, coveredM: 500, incomplete: false });
  });

  it('measures climbs from the first height, not from sea level', () => {
    const summary = summarizeElevation([point(0, 40), point(100, 45), point(200, 41)], 200, false);
    expect(summary).toMatchObject({ ascentM: 5, descentM: 4 });
  });

  it('counts a climb out of a valley from its lowest point', () => {
    const summary = summarizeElevation([point(0, 10), point(100, 0), point(200, 10), point(300, 3)], 300, false);
    expect(summary).toMatchObject({ ascentM: 10, descentM: 17 });
  });

  it('leaves course totals unknown when any elevation span is uncovered', () => {
    const summary = summarizeElevation([point(0, 0), point(100, null), point(200, 10)], 200, false);
    expect(summary).toMatchObject({ ascentM: null, descentM: null, coveredM: 0, incomplete: true });
  });

  it('finds the steepest covered 200 m window and does not bridge unknown samples', () => {
    const known = summarizeElevation([point(0, 0), point(100, 10), point(200, 20), point(300, 0)], 300, false);
    expect(known.steepest200m).toEqual({ startM: 0, endM: 200, changeM: 20 });
    const broken = summarizeElevation([point(0, 0), point(100, null), point(300, 30)], 300, false);
    expect(broken.steepest200m).toBeNull();
  });
});

describe('course profile assembly', () => {
  it('uses only profiles matching the route snapshot hash and builds course distances in travel order', async () => {
    const first = line('1', [11.97, 57.7], 100);
    const moved = line('1', [11.98, 57.7], 100);
    const firstProfile = await profile(first, [10, 20]);
    const oldId = elevationProfileId(first.key, firstProfile.geometryHash);
    const old = await buildCourseElevation(course([leg(first)]), new Map([[oldId, firstProfile]]));
    const current = await buildCourseElevation(course([leg(moved)]), new Map([[oldId, firstProfile]]));
    expect(old.summary.ascentM).toBeCloseTo(10, 9);
    expect(old.summary.incomplete).toBe(false);
    expect(current.summary).toMatchObject({ ascentM: null, incomplete: true });
  });

  it('reverses a leg profile and leaves connector gaps unmeasured', async () => {
    const first = line('1', [11.97, 57.7], 100);
    const second = line('2', [11.97, 57.7 + dLat(150)], 100);
    const a = await profile(first, [0, 10]);
    const b = await profile(second, [20, 10]);
    const profiles = new Map([
      [elevationProfileId('1', a.geometryHash), a],
      [elevationProfileId('2', b.geometryHash), b],
    ]);
    const assembled = await buildCourseElevation(course([leg(first), leg(second, true)]), profiles);
    expect(assembled.points[0].elevationM).toBeNull();
    expect(assembled.points.find((p) => p.elevationM !== null && Math.abs(p.elevationM - 0) < 1e-9)?.courseDistanceM).toBe(0);
    expect(assembled.points.find((p) => p.elevationM !== null && Math.abs(p.elevationM - 10) < 1e-9)?.courseDistanceM).toBe(100);
    expect(assembled.points.find((p) => p.elevationM !== null && Math.abs(p.elevationM - 20) < 1e-9)?.courseDistanceM).toBeCloseTo(350, 0);
    expect(assembled.summary.incomplete).toBe(true);
    expect(assembled.summary.ascentM).toBeNull();
    expect(assembled.summary.coveredM).toBeCloseTo(200, 0);
  });

  it('includes known manual-leg distance as an uncovered interval and flags unknown lengths', async () => {
    const route = line('1', [11.97, 57.7], 100);
    const data = await profile(route, [0, 10]);
    const profiles = new Map([[elevationProfileId(route.key, data.geometryHash), data]]);
    const withKnownManual = await buildCourseElevation(course([
      leg(route),
      { kind: 'manual', id: 'm', label: 'Walk', lengthM: 50 },
    ]), profiles);
    expect(withKnownManual.summary.totalM).toBe(150);
    expect(withKnownManual.summary.coveredM).toBeCloseTo(100, 0);
    expect(withKnownManual.summary.incomplete).toBe(true);
    const unknownManual = await buildCourseElevation(course([
      leg(route),
      { kind: 'manual', id: 'm', label: 'Walk', lengthM: null },
    ]), profiles);
    expect(unknownManual.summary.incomplete).toBe(true);
  });

  it('interpolates coordinates by path distance and rejects unusable requests', () => {
    const coordinates: [number, number][] = [[11.97, 57.7], [11.97, 57.701], [11.971, 57.701]];
    const halfway = coordinateAtDistance(coordinates, 55);
    expect(halfway?.[0]).toBeCloseTo(11.97, 4);
    expect(halfway?.[1]).toBeCloseTo(57.7005, 4);
    expect(coordinateAtDistance(coordinates, -1)).toBeNull();
  });

  it('does not place a map marker in a straight-line course gap or manual leg', () => {
    const first = line('1', [11.97, 57.7], 100);
    const second = line('2', [11.97, 57.7 + dLat(150)], 100);
    const legs = [leg(first), leg(second)];
    expect(coordinateAtCourseDistance(legs, 100)).not.toBeNull();
    expect(coordinateAtCourseDistance(legs, 125)).toBeNull();
    expect(coordinateAtCourseDistance([leg(first), { kind: 'manual', id: 'm', label: 'Walk', lengthM: 50 }], 125)).toBeNull();
  });
});
