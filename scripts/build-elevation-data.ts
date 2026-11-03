import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Dataset } from '../src/domain/types';
import { writeElevationSidecar } from './transit/elevation';

export async function buildElevationData(root = new URL('..', import.meta.url).pathname): Promise<void> {
  const datasetPath = `${root}public/data/lines.json`;
  if (!existsSync(datasetPath)) throw new Error('Transit data is missing; run npm run data first.');
  const dataset: Dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
  await writeElevationSidecar(dataset, `${root}public/data`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  buildElevationData().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
