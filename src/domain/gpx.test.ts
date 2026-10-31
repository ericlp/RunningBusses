import { describe, expect, it } from 'vitest';
import type { Course, Leg } from './course';
import { courseToGpx, gpxFileName } from './gpx';
import type { Line } from './types';

const mk = (key: string, coordinates: [number, number][], from: string, to: string): Line => ({
  key, number: key, label: key, category: 'stadsbuss', tags: [], from, to, lengthM: 1000, via: [], coordinates,
});
const course = (legs: Leg[], name = 'Bana & "Ö"'): Course => ({ id: 'c', name, status: 'NotCompleted', createdAt: '', updatedAt: '', completedAt: null, legs });

describe('gpx', () => {
  const a = mk('59', [[11.97, 57.7], [11.98, 57.71]], 'A', 'B');
  const b = mk('69', [[11.99, 57.72], [12.0, 57.73]], 'C', 'D');
  const gpx = courseToGpx(course([{ kind: 'line', line: a, reversed: false }, { kind: 'line', line: b, reversed: true }]));

  it('writes one segment per line, in running direction (lon/lat order fixed)', () => {
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    const segments = [...gpx.matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)].map((match) =>
      [...match[1].matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"\/>/g)].map((point) => [Number(point[2]), Number(point[1])]));
    expect(segments).toEqual([a.coordinates, [...b.coordinates].reverse()]);
  });
  it('adds start and end waypoints and escapes XML', () => {
    expect(gpx.match(/<wpt /g)).toHaveLength(3);
    expect(gpx).toContain('Bana &amp; &quot;Ö&quot;');
    const waypoints = [...gpx.matchAll(/<wpt lat="([^"]+)" lon="([^"]+)"><name>(.*?)<\/name><desc>(.*?)<\/desc><\/wpt>/g)]
      .map((match) => ({ at: [Number(match[2]), Number(match[1])], name: match[3], desc: match[4] }));
    expect(waypoints).toEqual([
      { at: a.coordinates[0], name: 'A', desc: 'Start, 59' },
      { at: a.coordinates[1], name: 'B', desc: '59' },
      { at: b.coordinates[0], name: 'C', desc: '69' },
    ]);
  });
  it('skips manual legs and makes a safe file name', () => {
    expect(courseToGpx(course([{ kind: 'manual', id: 'm', label: 'Bro', lengthM: 100 }, { kind: 'line', line: a, reversed: false }])).match(/<trkseg>/g)).toHaveLength(1);
    expect(gpxFileName(course([], 'Bana 1/2: Ö'))).toBe('bana-12-o.gpx');
  });
});
