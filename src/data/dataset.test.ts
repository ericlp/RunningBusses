import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { contentHash, splitDataset } from '../domain/catalog';
import { CATEGORIES, type Category, type Dataset, type Line } from '../domain/types';
import { CategoryData } from './dataset';
import { idbBatch, idbGet, idbUpdate } from './idb';

vi.mock('./idb', () => ({
  idbGet: vi.fn(), idbBatch: vi.fn(), idbUpdate: vi.fn(), idbKeys: vi.fn(async () => [...storage.keys()]),
}));
const storage = new Map<string, unknown>();
const line = (key: string, category: Category): Line => ({
  key, number: key, label: key, category, tags: [], from: 'A', to: 'B', lengthM: 1000, via: ['A', 'B'],
  coordinates: [[11, 57], [12, 58]],
});
const dataset: Dataset = { schemaVersion: 1, feedVersion: 'one', referenceDate: '20261007', generatedAt: '2026-10-08T00:00:00Z', lines: [line('59', 'stadsbuss'), line('vt.1', 'other-bus')] };
let assets: Awaited<ReturnType<typeof splitDataset>>;
let fetchMock: Mock<(url: string) => Promise<Response>>;
let blocked: Set<string>;
let failWrites = false;

beforeEach(async () => {
  storage.clear();
  failWrites = false;
  blocked = new Set();
  assets = await splitDataset(dataset);
  vi.mocked(idbGet).mockImplementation(async <T,>(key: string) => storage.get(key) as T | undefined);
  vi.mocked(idbBatch).mockImplementation(async (entries, deletes = []) => {
    if (failWrites) throw new Error('Quota exceeded');
    for (const [key, value] of entries) storage.set(key, structuredClone(value));
    for (const key of deletes) storage.delete(key);
  });
  vi.mocked(idbUpdate).mockImplementation(async (key, update) => {
    const next = update(storage.get(key));
    await idbBatch([[key, next.value], ...next.entries ?? []], next.deletes);
  });
  fetchMock = vi.fn(async (url: string) => {
    if (blocked.has('*') || [...blocked].some((s) => url.includes(s))) throw new Error('Network unavailable');
    if (url.endsWith('catalog-manifest.json')) return Response.json(assets.manifest);
    const file = [...assets.files.keys()].find((f) => url.endsWith(f));
    return file ? new Response(assets.files.get(file)) : new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('category release loader', () => {
  it('loads ferries on demand and includes their payload in durable offline installation', async () => {
    const ferry = line('vt.9011014528600000', 'ferry');
    assets = await splitDataset({ ...dataset, lines: [...dataset.lines, ferry] });
    const loader = await CategoryData.open();
    await loader.ensure(['stadsbuss']);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('ferry.'))).toBe(false);
    expect(loader.categoriesForKeys([ferry.key])).toEqual(['ferry']);
    await loader.ensureKeys([ferry.key]);
    expect(loader.getSnapshot().dataset.lines).toEqual([dataset.lines[0], ferry]);
    await loader.installAll();
    expect(loader.getSnapshot().cached).toContain('ferry');
    blocked.add('*');
    const offline = await CategoryData.open();
    await offline.ensure(['ferry']);
    expect(offline.getSnapshot().dataset.lines).toEqual([ferry]);
    expect(offline.getSnapshot().offline).toBe(true);
  });

  it('retains pre-ferry offline installations and protects their payloads during upgrade', async () => {
    const { ferry: _ferry, ...categories } = assets.manifest.categories;
    const { feedVersion, referenceDate, catalog } = assets.manifest;
    const release = await contentHash(JSON.stringify({ feedVersion, referenceDate, catalog, categories }));
    const manifest = { ...assets.manifest, release, categories };
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url) => url.endsWith('catalog-manifest.json') ? Response.json(manifest) : originalFetch(url));
    const old = await CategoryData.open();
    await old.installAll();
    expect(old.getSnapshot().installed?.release).toBe(release);
    expect(old.getSnapshot().installProgress).toBe(6);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('ferry.'))).toBe(false);
    blocked.add('*');
    fetchMock.mockImplementation(originalFetch);
    const offline = await CategoryData.open();
    await offline.ensure(['stadsbuss', 'other-bus']);
    expect(offline.getSnapshot().dataset.lines).toEqual(dataset.lines);
    await expect(offline.ensure(['ferry'])).rejects.toThrow('unavailable');
    expect(offline.getSnapshot().installed?.release).toBe(release);
    blocked.clear();
    assets = await splitDataset({ ...dataset, feedVersion: 'two', lines: dataset.lines.map((l) => ({ ...l, coordinates: [[13, 58], [14, 59]] })) });
    const upgraded = await CategoryData.open();
    expect(upgraded.getSnapshot().installed?.release).toBe(release);
    expect(upgraded.getSnapshot().storageError).toBe(false);
    expect(storage.has(`transit.payload.${manifest.categories.stadsbuss.hash}`)).toBe(true);
    blocked.add('*');
    const fallback = await CategoryData.open();
    await fallback.ensure(['stadsbuss']);
    expect(fallback.getSnapshot().dataset.lines).toEqual([dataset.lines[0]]);
  });

  it('fetches only requested geometry, deduplicates requests and reads no unrelated cached values', async () => {
    const loader = await CategoryData.open();
    await Promise.all([loader.ensure(['stadsbuss']), loader.ensure(['stadsbuss'])]);
    expect(loader.getSnapshot().dataset.lines).toEqual([dataset.lines[0]]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toHaveLength(3);
    await loader.installAll();
    expect(loader.getSnapshot().installed?.release).toBe(assets.manifest.release);
    expect(loader.getSnapshot().dataset.lines).toHaveLength(1);
    vi.mocked(idbGet).mockClear();
    fetchMock.mockClear();
    const warm = await CategoryData.open();
    await warm.ensure(['stadsbuss']);
    expect(fetchMock.mock.calls).toHaveLength(1);
    const regionalHash = assets.manifest.categories['other-bus'].hash;
    expect(vi.mocked(idbGet).mock.calls.some(([key]) => key.includes(regionalHash))).toBe(false);
  });

  it('reports storage failure but keeps valid fetched geometry usable', async () => {
    failWrites = true;
    const loader = await CategoryData.open();
    await loader.ensure(['stadsbuss']);
    expect(loader.getSnapshot().dataset.lines).toEqual([dataset.lines[0]]);
    expect(loader.getSnapshot().storageError).toBe(true);
    await loader.installAll();
    expect(loader.getSnapshot().installed).toBeNull();
    expect(loader.getSnapshot().installError).toBeTruthy();
  });

  it('preserves an installed release through failed and interrupted refreshes, reusing staged work', async () => {
    const old = await CategoryData.open();
    await old.installAll();
    const oldRelease = assets.manifest.release;
    assets = await splitDataset({ ...dataset, feedVersion: 'two', lines: dataset.lines.map((l) => ({ ...l, coordinates: [[13, 58], [14, 59]] })) });
    const next = await CategoryData.open();
    blocked.add('other-bus.');
    await next.installAll();
    expect(storage.get('transit.installed')).toBe(oldRelease);
    expect(next.getSnapshot().installError).toBeTruthy();
    expect(next.getSnapshot().installProgress).toBe(4);
    blocked.clear();
    fetchMock.mockClear();
    const restarted = await CategoryData.open();
    await restarted.installAll();
    expect(storage.get('transit.installed')).toBe(assets.manifest.release);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('stadsbuss.'))).toHaveLength(0);
    expect(restarted.getSnapshot().dataset.lines).toHaveLength(0);
  });

  it('falls back to one coherent installed release rather than mixing newer cached data', async () => {
    const old = await CategoryData.open();
    await old.installAll();
    const oldManifest = assets.manifest;
    assets = await splitDataset({ ...dataset, feedVersion: 'two', generatedAt: '2026-10-09T00:00:00Z' });
    const online = await CategoryData.open();
    await online.ensure(['stadsbuss']);
    blocked.add('*');
    const offline = await CategoryData.open();
    await offline.ensure(['stadsbuss', 'other-bus']);
    expect(offline.getSnapshot().offline).toBe(true);
    expect(offline.getSnapshot().stale).toBe(true);
    expect(offline.getSnapshot().manifest.release).toBe(oldManifest.release);
    expect(offline.getSnapshot().dataset.lines).toEqual(dataset.lines);
  });

  it('does not turn a missing known chunk into a removed route, and supports retry', async () => {
    const loader = await CategoryData.open();
    blocked.add('other-bus.');
    await expect(loader.ensure(['other-bus'])).rejects.toThrow();
    expect(loader.getSnapshot().catalog.lines).toHaveLength(2);
    expect(loader.getSnapshot().failed).toEqual(['other-bus']);
    blocked.clear();
    await loader.ensure(['other-bus']);
    expect(loader.getSnapshot().failed).toEqual([]);
  });

  it('validates corrupted cached chunks before reuse', async () => {
    const loader = await CategoryData.open();
    await loader.ensure(['stadsbuss']);
    storage.set(`transit.payload.${assets.manifest.categories.stadsbuss.hash}`, '{}');
    fetchMock.mockClear();
    const again = await CategoryData.open();
    await again.ensure(['stadsbuss']);
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(again.getSnapshot().dataset.lines).toEqual([dataset.lines[0]]);
  });

  it('migrates legacy cached data offline without touching courses or drafts', async () => {
    storage.set('dataset', { hash: 'legacy', dataset });
    storage.set('courses', ['untouched']);
    storage.set('draft', { name: 'untouched' });
    blocked.add('*');
    const loader = await CategoryData.open();
    expect(loader.getSnapshot().dataset.lines).toHaveLength(0);
    await loader.ensure(['stadsbuss']);
    expect(loader.getSnapshot().dataset.lines).toEqual([dataset.lines[0]]);
    expect(storage.get('courses')).toEqual(['untouched']);
    expect(storage.get('draft')).toEqual({ name: 'untouched' });
    expect(loader.getSnapshot().cached).toEqual(CATEGORIES);
  });

  it('restarts once on a stale content-addressed URL and never mixes releases', async () => {
    const loader = await CategoryData.open();
    assets = await splitDataset({ ...dataset, feedVersion: 'two', lines: [line('60', 'stadsbuss'), dataset.lines[1]] });
    await loader.ensure(['stadsbuss']);
    expect(loader.getSnapshot().manifest.release).toBe(assets.manifest.release);
    expect(loader.getSnapshot().dataset.lines.map((l) => l.key)).toEqual(['60']);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('catalog-manifest.json'))).toHaveLength(2);
  });

  it('resolves route categories again when deployment changes their membership', async () => {
    const loader = await CategoryData.open();
    assets = await splitDataset({ ...dataset, feedVersion: 'two', lines: [{ ...dataset.lines[0], category: 'tram' }, dataset.lines[1]] });
    const resolved = await loader.ensureKeys(['59']);
    expect(resolved.dataset.lines[0].category).toBe('tram');
    expect(loader.hasCategories(['tram'])).toBe(true);
  });

  it('rejects mismatched downloads after only one manifest restart', async () => {
    const loader = await CategoryData.open();
    const previous = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string) => url.includes('stadsbuss.') ? new Response('{}') : previous(url));
    await expect(loader.ensure(['stadsbuss'])).rejects.toThrow('Invalid downloaded category');
    expect(loader.getSnapshot().dataset.lines).toEqual([]);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('catalog-manifest.json'))).toHaveLength(2);
  });

  it('deduplicates overlapping browsing and download-all requests', async () => {
    const loader = await CategoryData.open();
    await Promise.all([loader.ensure(['stadsbuss']), loader.installAll()]);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('stadsbuss.'))).toHaveLength(1);
    expect(loader.getSnapshot().dataset.lines).toEqual([dataset.lines[0]]);
  });

  it('detects evicted installed chunks without claiming that offline data remain saved', async () => {
    const loader = await CategoryData.open();
    await loader.installAll();
    storage.delete(`transit.payload.${assets.manifest.categories['other-bus'].hash}`);
    blocked.add('*');
    const offline = await CategoryData.open();
    await expect(offline.ensure(['other-bus'])).rejects.toThrow();
    expect(offline.getSnapshot().cached).not.toContain('other-bus');
    expect(offline.getSnapshot().installed).toBeNull();
    expect(storage.get('transit.installed')).toBeUndefined();
    expect(offline.getSnapshot().catalog.lines.map((l) => l.key)).toContain('vt.1');
  });

  it('preserves validated catalogue bytes rather than reserializing an installed release', async () => {
    const text = JSON.stringify(JSON.parse(assets.files.get(assets.manifest.catalog.file)!), null, 2);
    const hash = await contentHash(text);
    assets.files.delete(assets.manifest.catalog.file);
    assets.manifest.catalog = { ...assets.manifest.catalog, file: `catalog.${hash}.json`, hash, bytes: Buffer.byteLength(text) };
    assets.files.set(assets.manifest.catalog.file, text);
    const { feedVersion, referenceDate, catalog, categories } = assets.manifest;
    assets.manifest.release = await contentHash(JSON.stringify({ feedVersion, referenceDate, catalog, categories }));
    const loader = await CategoryData.open();
    await loader.installAll();
    blocked.add('*');
    const offline = await CategoryData.open();
    expect(offline.getSnapshot().catalog.lines).toHaveLength(2);
    expect(offline.getSnapshot().installed?.release).toBe(assets.manifest.release);
  });

  it('repairs corrupt availability metadata without hydrating unrelated chunks', async () => {
    const loader = await CategoryData.open();
    await loader.ensure(['stadsbuss']);
    storage.set(`transit.release.${assets.manifest.release}`, { manifest: assets.manifest, catalogText: assets.files.get(assets.manifest.catalog.file), available: 'corrupt' });
    const again = await CategoryData.open();
    expect(again.getSnapshot().cached).toEqual([]);
    await again.ensure(['stadsbuss']);
    expect(again.getSnapshot().cached).toEqual(['stadsbuss']);
  });
});
