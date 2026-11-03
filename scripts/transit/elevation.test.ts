import { describe, expect, it, vi } from 'vitest';
import { routeGeometryHash } from '../../src/domain/elevation';
import type { Category, Dataset, Line } from '../../src/domain/types';
import { createElevationSidecar, makeElevationProfile, type ElevationSampler } from './elevation';

const line = (key: string, category: Category, lengthM: number): Line => ({
  key,
  number: key,
  label: key,
  category,
  tags: [],
  from: 'A',
  to: 'B',
  lengthM,
  via: [],
  coordinates: [[11.97, 57.7], [11.97, 57.7 + lengthM / 111195]],
});
const dataset = (lines: Line[]): Dataset => ({
  schemaVersion: 1,
  feedVersion: 'one',
  referenceDate: '20261007',
  generatedAt: '2026-10-08T00:00:00Z',
  lines,
});

describe('Copernicus elevation build', () => {
  it('creates exact route endpoints and about 25 m sample intervals', async () => {
    const route = line('59', 'stadsbuss', 61);
    const sampler: ElevationSampler = { sample: vi.fn(async (_lon, lat) => lat * 100) };
    const profile = await makeElevationProfile(route, sampler);
    expect(profile.samples.map((sample) => sample.distanceM)).toEqual([0, 25, 50, 61]);
    expect(profile.samples.at(-1)?.distanceM).toBe(route.lengthM);
    expect(profile.geometryHash).toBe(await routeGeometryHash(route.coordinates));
    expect(sampler.sample).toHaveBeenCalledTimes(4);
  });

  it('rounds samples to half metres and preserves missing raster values', async () => {
    const route = line('59', 'stadsbuss', 25);
    const sampler: ElevationSampler = {
      sample: vi.fn()
        .mockResolvedValueOnce(12.24)
        .mockResolvedValueOnce(null),
    };
    const profile = await makeElevationProfile(route, sampler);
    expect(profile.samples.map((sample) => sample.elevationM)).toEqual([12, null]);
    expect(profile.samples.every((sample) => !sample.estimated)).toBe(true);
  });

  it('publishes only Gothenburg categories with content-addressed assets and explicit DSM attribution', async () => {
    const sourceLines = [
      line('59', 'stadsbuss', 25),
      line('vt.1', 'other-bus', 25),
      line('ferry', 'ferry', 25),
      line('tram', 'tram', 25),
    ];
    const sampler: ElevationSampler = { sample: vi.fn(async () => 10) };
    const { manifest, files } = await createElevationSidecar(dataset(sourceLines), sampler);
    expect(Object.keys(manifest.elevation).sort()).toEqual(['stadsbuss', 'tram']);
    expect(manifest.source.name).toContain('surface model');
    expect(manifest.source.attribution).toContain('registry.opendata.aws/copernicus-dem');
    expect(manifest.source.note).toContain('Buildings and vegetation');
    for (const [file, text] of files) {
      const category = file.split('/').at(-1)!.split('.')[0];
      expect(manifest.elevation[category as Category]?.file).toBe(file);
      expect(JSON.parse(text).profiles.every((profile: { routeKey: string }) =>
        sourceLines.some((route) => route.key === profile.routeKey && route.category === category),
      )).toBe(true);
    }
  });
});
