import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { assembleLine, parseAsset, parseCatalog, parseCategory, parseManifest, splitDataset } from './catalog';
import { CATEGORIES, type Dataset } from './types';

const dataset: Dataset = JSON.parse(readFileSync('public/data/lines.json', 'utf8'));

describe('split transit contract', () => {
  it('losslessly reconstructs every published route, including field order and optional fields', async () => {
    const split = await splitDataset(dataset);
    const manifest = await parseManifest(split.manifest);
    const catalog = parseCatalog(await parseAsset(split.files.get(manifest.catalog.file)!, manifest.catalog), manifest);
    const geometries = new Map();
    for (const c of CATEGORIES) {
      const payload = parseCategory(await parseAsset(split.files.get(manifest.categories[c].file)!, manifest.categories[c]), c, catalog);
      for (const l of payload.lines) geometries.set(l.key, l);
    }
    expect(JSON.stringify(catalog.lines.map((l) => assembleLine(l, geometries.get(l.key))))).toBe(JSON.stringify(dataset.lines));
    expect(catalog.lines.every((l) => !('coordinates' in l) && !('viaAt' in l))).toBe(true);
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
});
