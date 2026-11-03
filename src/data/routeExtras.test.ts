import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHash, splitDataset } from '../domain/catalog';
import { elevationProfileId, routeGeometryHash, type ElevationProfile } from '../domain/elevation';
import type { Category, Dataset, Line } from '../domain/types';
import { loadElevationProfiles } from './routeExtras';
import { idbBatch, idbGet } from './idb';

const storage = new Map<string, unknown>();
let failWrites = false;
let dataset: Dataset;
let assets: Awaited<ReturnType<typeof splitDataset>>;
let extrasManifest: Record<string, unknown>;
let payloadText: string;
let fetcher: typeof fetch;

vi.mock('./idb', () => ({
  idbGet: vi.fn(async <T,>(key: string) => storage.get(key) as T | undefined),
  idbBatch: vi.fn(async (entries: [string, unknown][]) => {
    if (failWrites) throw new Error('Quota exceeded');
    for (const [key, value] of entries) storage.set(key, structuredClone(value));
  }),
}));

const line = (key: string, category: Category): Line => ({
  key, number: key, label: key, category, tags: [], from: 'A', to: 'B', lengthM: 100,
  via: [], coordinates: [[11.97, 57.7], [11.97, 57.7009]],
});

beforeEach(async () => {
  storage.clear();
  failWrites = false;
  const first = line('59', 'stadsbuss');
  dataset = {
    schemaVersion: 1,
    feedVersion: 'one',
    referenceDate: '20261007',
    generatedAt: '2026-10-08T00:00:00Z',
    lines: [first, line('vt.1', 'other-bus')],
  };
  assets = await splitDataset(dataset);
  const profile: ElevationProfile = {
    schemaVersion: 1,
    routeKey: first.key,
    geometryHash: await routeGeometryHash(first.coordinates),
    lengthM: 100,
    samples: [
      { distanceM: 0, elevationM: 12, estimated: false },
      { distanceM: 100, elevationM: 15, estimated: true },
    ],
  };
  payloadText = JSON.stringify({ schemaVersion: 1, category: 'stadsbuss', profiles: [profile] });
  const hash = await contentHash(payloadText);
  extrasManifest = {
    schemaVersion: 1,
    transitRelease: assets.manifest.release,
    buildVersion: 'test',
    source: {
      name: 'Example terrain data',
      attribution: '© Example',
      licence: 'CC BY 4.0',
      note: 'Processed estimates.',
    },
    elevation: {
      stadsbuss: { file: `extras/elevation/stadsbuss.${hash}.json`, hash, count: 1, bytes: new TextEncoder().encode(payloadText).length },
    },
  };
  fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('route-extras-manifest.json')) return Response.json(extrasManifest);
    if (url.endsWith(`stadsbuss.${hash}.json`)) return new Response(payloadText);
    return new Response('', { status: 404 });
  });
});

describe('optional elevation sidecar loader', () => {
  it('fetches and stores only requested categories and validates payload hashes and membership', async () => {
    const result = await loadElevationProfiles(
      assets.manifest,
      { schemaVersion: 2, lines: dataset.lines.map(({ coordinates: _coordinates, ...metadata }) => metadata) },
      ['59'],
      { fetcher, get: idbGet, batch: idbBatch, base: '/RunningBusses/' },
    );
    const profile = result.profiles.get(elevationProfileId('59', await routeGeometryHash(dataset.lines[0].coordinates)));
    expect(profile?.samples[1].estimated).toBe(true);
    expect(result.unavailableKeys).toEqual([]);
    expect(result.storageError).toBe(false);
    expect(vi.mocked(fetcher).mock.calls.map(([url]) => String(url))).toHaveLength(2);
    expect(storage.has(`transit.extras.manifest.${assets.manifest.release}`)).toBe(true);
    expect([...storage.keys()].filter((key) => key.startsWith('transit.extras.payload.'))).toHaveLength(1);
  });

  it('uses matching cached extras when offline and rejects a different transit release', async () => {
    const catalog = { schemaVersion: 2 as const, lines: dataset.lines.map(({ coordinates: _coordinates, ...metadata }) => metadata) };
    const deps = { fetcher, get: idbGet, batch: idbBatch, base: '/' };
    await loadElevationProfiles(assets.manifest, catalog, ['59'], deps);
    fetcher = vi.fn(async () => { throw new Error('offline'); });
    const offline = await loadElevationProfiles(assets.manifest, catalog, ['59'], { ...deps, fetcher });
    expect(offline.profiles.size).toBe(1);
    const mismatched = vi.fn(async () => Response.json(extrasManifest));
    await expect(loadElevationProfiles({ ...assets.manifest, release: 'f'.repeat(64) }, catalog, ['59'], { ...deps, fetcher: mismatched }))
      .rejects.toThrow('release mismatch');
  });

  it('reports an absent optional sidecar as unavailable rather than breaking transit data', async () => {
    const missing = vi.fn(async () => new Response('', { status: 404 }));
    const result = await loadElevationProfiles(
      assets.manifest,
      { schemaVersion: 2, lines: dataset.lines.map(({ coordinates: _coordinates, ...metadata }) => metadata) },
      ['59'],
      { fetcher: missing, get: idbGet, batch: idbBatch, base: '/' },
    );
    expect(result.manifest).toBeNull();
    expect(result.profiles.size).toBe(0);
    expect(result.unavailableKeys).toEqual(['59']);
  });

  it('reports persistence failure while keeping validated downloaded profiles usable', async () => {
    failWrites = true;
    const result = await loadElevationProfiles(
      assets.manifest,
      { schemaVersion: 2, lines: dataset.lines.map(({ coordinates: _coordinates, ...metadata }) => metadata) },
      ['59'],
      { fetcher, get: idbGet, batch: idbBatch, base: '/' },
    );
    expect(result.profiles.size).toBe(1);
    expect(result.storageError).toBe(true);
  });

  it('rejects altered payload bytes instead of accepting an invalid profile', async () => {
    const tampered = JSON.stringify({ schemaVersion: 1, category: 'stadsbuss', profiles: [] });
    fetcher = vi.fn(async (input) => String(input).endsWith('route-extras-manifest.json')
      ? Response.json(extrasManifest)
      : new Response(tampered));
    await expect(loadElevationProfiles(
      assets.manifest,
      { schemaVersion: 2, lines: dataset.lines.map(({ coordinates: _coordinates, ...metadata }) => metadata) },
      ['59'],
      { fetcher, get: idbGet, batch: idbBatch, base: '/' },
    )).rejects.toThrow('Invalid asset hash');
  });
});
