import { readFileSync } from 'node:fs';
import { assembleLine, parseAsset, parseCatalog, parseCategory, parseManifest } from '../../src/domain/catalog';
import { CATEGORIES, type Dataset, type Line } from '../../src/domain/types';

export async function validateSplitAssets(dataset: Dataset, directory: string): Promise<void> {
  const manifest = await parseManifest(JSON.parse(readFileSync(`${directory}/catalog-manifest.json`, 'utf8')));
  for (const key of ['feedVersion', 'referenceDate', 'generatedAt'] as const) {
    if (manifest[key] !== dataset[key]) throw new Error(`Split/aggregate ${key} differs`);
  }
  const catalog = parseCatalog(await parseAsset(readFileSync(`${directory}/${manifest.catalog.file}`, 'utf8'), manifest.catalog), manifest);
  const lines = new Map<string, Line>();
  for (const category of CATEGORIES) {
    const descriptor = manifest.categories[category];
    if (!descriptor) continue;
    const payload = parseCategory(await parseAsset(readFileSync(`${directory}/${descriptor.file}`, 'utf8'), descriptor), category, catalog);
    const byKey = new Map(payload.lines.map((l) => [l.key, l]));
    for (const metadata of catalog.lines.filter((l) => l.category === category)) lines.set(metadata.key, assembleLine(metadata, byKey.get(metadata.key)!));
  }
  const reconstructed = catalog.lines.map((l) => lines.get(l.key));
  if (JSON.stringify(reconstructed) !== JSON.stringify(dataset.lines)) throw new Error('Split reassembly does not exactly match aggregate lines');
}
