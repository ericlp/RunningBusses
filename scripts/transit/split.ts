import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { splitDataset } from '../../src/domain/catalog';
import type { Dataset } from '../../src/domain/types';

export async function writeSplitAssets(dataset: Dataset, outDir: string): Promise<void> {
  const { manifest, files } = await splitDataset(dataset);
  mkdirSync(`${outDir}/categories`, { recursive: true });
  for (const [file, body] of files) writeFileSync(`${outDir}/${file}`, body);
  writeFileSync(`${outDir}/catalog-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  for (const directory of ['', 'categories/']) {
    for (const file of readdirSync(`${outDir}/${directory}`)) {
      const owned = directory ? /^(stadsbuss|stombuss|express|industri|other-bus|tram|ferry)\.[a-f0-9]{64}\.json$/ : /^catalog\.[a-f0-9]{64}\.json$/;
      if (owned.test(file) && !files.has(directory + file)) unlinkSync(`${outDir}/${directory}${file}`);
    }
  }
}
