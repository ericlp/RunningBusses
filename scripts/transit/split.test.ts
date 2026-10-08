import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeSplitAssets } from './split';
import { validateSplitAssets } from './validate-split';
import type { CatalogManifest, Dataset } from '../../src/domain/types';

const dataset: Dataset = {
  schemaVersion: 1, feedVersion: 'one', referenceDate: '20261007', generatedAt: '2026-10-08T00:00:00Z',
  lines: [{
    key: '59', number: '59', label: '59', category: 'stadsbuss', tags: [], from: 'A', to: 'B', lengthM: 1000,
    via: ['A', 'B'], viaAt: [[11, 57], [12, 58]], coordinates: [[11, 57], [12, 58]],
  }],
};

describe('split publication', () => {
  it('validates generated assets and cleans only obsolete owned content-addressed files', async () => {
    mkdirSync('.cache', { recursive: true });
    const directory = mkdtempSync('.cache/split-test-');
    try {
      await writeSplitAssets(dataset, directory);
      await validateSplitAssets(dataset, directory);
      const first: CatalogManifest = JSON.parse(readFileSync(`${directory}/catalog-manifest.json`, 'utf8'));
      writeFileSync(`${directory}/lines.json`, 'legacy sentinel');
      writeFileSync(`${directory}/manifest.json`, 'legacy manifest sentinel');
      writeFileSync(`${directory}/catalog.custom.json`, 'unowned catalogue sentinel');
      writeFileSync(`${directory}/categories/custom.json`, 'unowned category sentinel');
      const next = { ...dataset, lines: dataset.lines.map((l) => ({ ...l, lengthM: 2000, coordinates: [[13, 58], [14, 59]] as [number, number][] })) };
      await writeSplitAssets(next, directory);
      await validateSplitAssets(next, directory);
      expect(existsSync(`${directory}/${first.catalog.file}`)).toBe(false);
      expect(existsSync(`${directory}/${first.categories.stadsbuss.file}`)).toBe(false);
      for (const file of ['lines.json', 'manifest.json', 'catalog.custom.json', 'categories/custom.json']) expect(existsSync(`${directory}/${file}`)).toBe(true);
      const current: CatalogManifest = JSON.parse(readFileSync(`${directory}/catalog-manifest.json`, 'utf8'));
      writeFileSync(`${directory}/${current.categories.stadsbuss.file}`, '{}');
      await expect(validateSplitAssets(next, directory)).rejects.toThrow('hash');
    } finally { rmSync(directory, { recursive: true }); }
  });

  it('rejects aggregate metadata or snapshot differences rather than trusting aggregate counts', async () => {
    mkdirSync('.cache', { recursive: true });
    const directory = mkdtempSync('.cache/split-test-');
    try {
      await writeSplitAssets(dataset, directory);
      await expect(validateSplitAssets({ ...dataset, feedVersion: 'wrong' }, directory)).rejects.toThrow('feedVersion');
      await expect(validateSplitAssets({ ...dataset, lines: dataset.lines.map((l) => ({ ...l, lengthM: 999 })) }, directory)).rejects.toThrow('exactly');
    } finally { rmSync(directory, { recursive: true }); }
  });
});
