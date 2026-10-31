import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { assembleLine, contentHash, parseAsset, parseCatalog, parseCategory, parseManifest, splitDataset } from './catalog';
import { CATEGORIES, type Catalog, type CatalogManifest, type CategoryPayload, type Dataset } from './types';

const dataset: Dataset = JSON.parse(readFileSync('public/data/lines.json', 'utf8'));

describe('split transit contract', () => {
  it('losslessly reconstructs every published route, including field order and optional fields', async () => {
    const split = await splitDataset(dataset);
    const manifest = await parseManifest(split.manifest);
    const catalog = parseCatalog(await parseAsset(split.files.get(manifest.catalog.file)!, manifest.catalog), manifest);
    const geometries = new Map();
    for (const c of CATEGORIES) {
      const descriptor = manifest.categories[c];
      expect(descriptor).toBeDefined();
      if (!descriptor) throw new Error(`Missing generated category ${c}`);
      const payload = parseCategory(await parseAsset(split.files.get(descriptor.file)!, descriptor), c, catalog);
      for (const l of payload.lines) geometries.set(l.key, l);
    }
    expect(JSON.stringify(catalog.lines.map((l) => assembleLine(l, geometries.get(l.key))))).toBe(JSON.stringify(dataset.lines));
    expect(catalog.lines.every((l) => !('coordinates' in l) && !('viaAt' in l))).toBe(true);
  });

  describe('independent split-data validation guards', () => {
    let manifest: CatalogManifest;
    let catalog: Catalog;
    let payload: CategoryPayload;
    let text: string;
    beforeAll(async () => {
      const tiny: Dataset = {
        schemaVersion: 1, feedVersion: 'test', referenceDate: '20260101', generatedAt: '2026-01-01T00:00:00Z',
        lines: ['bus-a', 'bus-b', 'tram'].map((key) => ({
          key, number: key, label: key, category: key === 'tram' ? 'tram' : 'stadsbuss',
          tags: [], from: 'A', to: 'B', lengthM: 1000, via: ['A', 'B'],
          viaAt: [[11.9, 57.7], [11.91, 57.71]], coordinates: [[11.9, 57.7], [11.91, 57.71]],
        })),
      };
      const split = await splitDataset(tiny);
      manifest = await parseManifest(split.manifest);
      text = split.files.get(manifest.catalog.file)!;
      catalog = parseCatalog(JSON.parse(text), manifest);
      payload = parseCategory(JSON.parse(split.files.get(manifest.categories.stadsbuss.file)!), 'stadsbuss', catalog);
    });

    it('rejects a different hash even when the asset has exactly the declared byte count', async () => {
      const corrupt = text.replace('"label":"bus-a"', '"label":"bus-z"');
      expect(corrupt).not.toBe(text);
      expect(new TextEncoder().encode(corrupt).length).toBe(manifest.catalog.bytes);
      await expect(parseAsset(corrupt, manifest.catalog)).rejects.toThrow('hash');
    });

    it('rejects a wrong byte count even when the asset hash is correct', async () => {
      expect(await contentHash(text)).toBe(manifest.catalog.hash);
      await expect(parseAsset(text, { ...manifest.catalog, bytes: manifest.catalog.bytes + 1 })).rejects.toThrow('hash');
    });

    it('rejects a wrong release hash with otherwise consistent descriptors and counts', async () => {
      const release = (manifest.release.startsWith('0') ? '1' : '0') + manifest.release.slice(1);
      await expect(parseManifest({ ...manifest, release })).rejects.toThrow('release hash');
    });

    it('rejects duplicate catalogue identities without changing category or total counts', () => {
      const duplicate = structuredClone(catalog);
      duplicate.lines[1].key = duplicate.lines[0].key;
      expect(() => parseCatalog(duplicate, manifest)).toThrow('Duplicate catalogue key');
    });

    it('rejects wrong catalogue membership with the total count unchanged', () => {
      const wrong = structuredClone(catalog);
      wrong.lines[1].category = 'tram';
      expect(wrong.lines).toHaveLength(manifest.lineCount);
      expect(() => parseCatalog(wrong, manifest)).toThrow('category membership');
    });

    it('rejects duplicate and foreign-category geometry keys without changing payload counts', () => {
      const duplicate = { ...payload, lines: [payload.lines[0], payload.lines[0]] };
      expect(() => parseCategory(duplicate, 'stadsbuss', catalog)).toThrow('Duplicate geometry key');
      const foreign = { ...payload, lines: [payload.lines[0], { ...payload.lines[1], key: 'tram' }] };
      expect(() => parseCategory(foreign, 'stadsbuss', catalog)).toThrow('category payload');
    });

    it.each([
      [], [[11.9, 57.7]], [[181, 57.7], [11.9, 57.7]], [[11.9, 91], [11.9, 57.7]],
      [[NaN, 57.7], [11.9, 57.7]], [[11.9, 57.7, 1], [11.9, 57.7]],
    ].map((coordinates) => ({ coordinates })))('rejects invalid route positions: %j', ({ coordinates }) => {
      const bad = { ...payload, lines: [{ ...payload.lines[0], coordinates }, payload.lines[1]] };
      expect(() => parseCategory(bad, 'stadsbuss', catalog)).toThrow('category payload');
    });

    it.each([
      [], [[11.9, 57.7]], [[181, 57.7], [11.9, 57.7]], [[11.9, 91], [11.9, 57.7]],
      [[11.9, Infinity], [11.9, 57.7]],
    ].map((viaAt) => ({ viaAt })))('rejects mismatched or invalid stop positions: %j', ({ viaAt }) => {
      const bad = { ...payload, lines: [{ ...payload.lines[0], viaAt }, payload.lines[1]] };
      expect(() => parseCategory(bad, 'stadsbuss', catalog)).toThrow('category payload');
    });

    it('still accepts old geometry without optional stop positions', () => {
      const old = { ...payload, lines: payload.lines.map(({ viaAt: _viaAt, ...line }) => line) };
      expect(parseCategory(old, 'stadsbuss', catalog)).toEqual(old);
    });
  });

  it('excludes volatile timestamps and reuses unchanged geometry across releases', async () => {
    const first = await splitDataset(dataset);
    const second = await splitDataset({ ...dataset, generatedAt: '2030-01-01T00:00:00Z' });
    expect(second.manifest.release).toBe(first.manifest.release);
    expect(second.files).toEqual(first.files);
    const third = await splitDataset({ ...dataset, feedVersion: 'next' });
    expect(third.manifest.release).not.toBe(first.manifest.release);
    expect(third.manifest.categories).toEqual(first.manifest.categories);
  });

  it('rejects corrupt hashes, byte sizes, counts, membership and invalid geometry', async () => {
    const split = await splitDataset(dataset);
    const { manifest } = split;
    const text = split.files.get(manifest.catalog.file)!;
    await expect(parseAsset(text + ' ', manifest.catalog)).rejects.toThrow('hash');
    await expect(parseManifest({ ...manifest, lineCount: 1 })).rejects.toThrow();
    const catalog = parseCatalog(JSON.parse(text), manifest);
    const c = 'stadsbuss';
    const payload = JSON.parse(split.files.get(manifest.categories[c].file)!);
    expect(() => parseCategory({ ...payload, lines: payload.lines.slice(1) }, c, catalog)).toThrow();
    payload.lines[0].coordinates = [];
    expect(() => parseCategory(payload, c, catalog)).toThrow();
  });

  it('keeps actual default gzipped route data below ten percent of the monolith', async () => {
    const split = await splitDataset(dataset);
    const bytes = gzipSync(JSON.stringify(split.manifest)).length +
      gzipSync(split.files.get(split.manifest.catalog.file)!).length +
      gzipSync(split.files.get(split.manifest.categories.stadsbuss.file)!).length;
    expect(bytes).toBeLessThanOrEqual(gzipSync(JSON.stringify(dataset)).length * 0.1);
  });
  it('preserves pre-ferry release hashes without accepting missing bus or tram descriptors', async () => {
    const legacy = await splitDataset({ ...dataset, lines: dataset.lines.filter((l) => l.category !== 'ferry') });
    const { ferry: _ferry, ...categories } = legacy.manifest.categories;
    const { feedVersion, referenceDate, catalog } = legacy.manifest;
    const release = await contentHash(JSON.stringify({ feedVersion, referenceDate, catalog, categories }));
    const manifest = { ...legacy.manifest, release, categories };
    expect(await parseManifest(manifest)).toEqual(manifest);
    expect(parseCatalog(JSON.parse(legacy.files.get(catalog.file)!), manifest).lines).toHaveLength(manifest.lineCount);
    await expect(parseManifest({ ...manifest, categories: { ...categories, tram: undefined } })).rejects.toThrow('descriptor');
    await expect(parseManifest({ ...manifest, categories: { ...categories, ferry: {} } })).rejects.toThrow('descriptor');
  });
});
