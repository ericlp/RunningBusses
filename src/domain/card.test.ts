import { afterEach, describe, expect, it } from 'vitest';
import { setLangPref } from '../i18n';
import type { Course } from './course';
import { cardPoint, cardTiles, cardWorldPoint, courseCardModel, fitCardViewport, truncateCardText } from './card';
import type { Line } from './types';

const line: Line = {
  key: '59', number: '59', label: '59', category: 'tram', color: '#ffffff', tags: [], via: [],
  from: 'A', to: 'B', lengthM: 1000, coordinates: [[11.97, 57.7], [11.98, 57.71]],
};
const course: Course = {
  id: 'c', name: 'Hilly course', status: 'Completed', createdAt: '', updatedAt: '', completedAt: '2026-10-31T12:00:00Z',
  participants: ['Alice', 'Eric'], legs: [{ kind: 'line', line, reversed: true }, { kind: 'manual', id: 'm', label: 'Finish cafe', lengthM: null }],
};
afterEach(() => setLangPref('auto'));

describe('course card content', () => {
  it('uses immutable snapshot direction, colours, manual distance and completion data', () => {
    setLangPref('en');
    const before = structuredClone(course);
    const model = courseCardModel(course);
    expect(model.paths).toEqual([{ coordinates: [...line.coordinates].reverse(), color: '#ffffff' }]);
    expect(model.distance).toMatch(/at least 1.0 km/i);
    expect(model.startName).toBe('B');
    expect(model.endName).toBe('Finish cafe');
    expect(model.start).toEqual([11.98, 57.71]);
    expect(model.end).toBeNull();
    expect(model.status).toContain('2026-10-31');
    expect(model.runners).toContain('Alice, Eric');
    expect(model.badges.map((badge) => badge.text)).toEqual(['59', 'Finish cafe']);
    expect(course).toEqual(before);
  });

  it('does not draw gaps or invent geometry for manual legs', () => {
    const second = { ...line, coordinates: [[12, 57.72], [12.01, 57.73]] as [number, number][] };
    const model = courseCardModel({ ...course, legs: [{ kind: 'line', line, reversed: false }, { kind: 'line', line: second, reversed: false }] });
    expect(model.paths).toHaveLength(2);
    expect(model.paths[0].coordinates).toBe(line.coordinates);
    expect(model.paths[1].coordinates).toBe(second.coordinates);
  });

  it('omits completion names/date on an open course and bounds long text', () => {
    const model = courseCardModel({ ...course, status: 'NotCompleted', name: 'x'.repeat(300), participants: ['a'.repeat(500)] });
    expect(model.runners).toBe('');
    expect(model.status).not.toContain('2026-10-31');
    expect(model.name).toHaveLength(160);
    expect(model.name.endsWith('\u2026')).toBe(true);
    expect(truncateCardText('short', 10)).toBe('short');
  });
});

describe('card map projection and viewed tile grid', () => {
  it('matches the Web Mercator origin and clamps the polar latitude', () => {
    expect(cardWorldPoint([0, 0], 0)).toEqual([128, 128]);
    expect(cardWorldPoint([0, 90], 2)[1]).toBeCloseTo(0, 6);
    expect(cardWorldPoint([0, -90], 2)[1]).toBeCloseTo(1024, 6);
  });

  it('fits both endpoints with padding and scales into the exact card map area', () => {
    const viewport = fitCardViewport([{ coordinates: line.coordinates }])!;
    for (const point of line.coordinates) {
      const [x, y] = cardPoint(point, viewport);
      expect(x).toBeGreaterThanOrEqual(48);
      expect(x).toBeLessThanOrEqual(1032);
      expect(y).toBeGreaterThanOrEqual(48);
      expect(y).toBeLessThanOrEqual(752);
    }
    expect(viewport.zoom).toBeLessThanOrEqual(15);
  });

  it('lists only intersecting tiles, excluding an exact right/bottom boundary', () => {
    expect(cardTiles({ width: 256, height: 256, zoom: 3, origin: [256, 512] })).toEqual([{ x: 1, y: 2, z: 3 }]);
    for (const origin of [[0, 0], [255, 255], [150, 150], [-1, -1]] as [number, number][]) {
      expect(cardTiles({ width: 540, height: 400, zoom: 3, origin }).length).toBeLessThanOrEqual(12);
    }
  });

  it('handles a point and very long courses without argument-stack overflow', () => {
    expect(fitCardViewport([])).toBeNull();
    expect(fitCardViewport([{ coordinates: [[11.97, 57.7]] }])!.zoom).toBe(15);
    expect(fitCardViewport([{ coordinates: Array.from({ length: 150000 }, () => [11.97, 57.7] as [number, number]) }])!.zoom).toBe(15);
  });
});
