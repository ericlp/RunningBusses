import type { Dataset, Manifest } from '../domain/types';
import { idbGet, idbSet } from './idb';

const KEY = 'dataset';
const base = import.meta.env.BASE_URL;

export interface Loaded {
  dataset: Dataset;
  /** True when the network was unavailable and the cached copy was used. */
  offline: boolean;
}

interface Cached {
  hash: string;
  dataset: Dataset;
}

async function readCache(): Promise<Cached | undefined> {
  try {
    return await idbGet<Cached>(KEY);
  } catch {
    return undefined;
  }
}

/** Checks the small manifest, and downloads the line data only when its hash changed. */
export async function loadDataset(): Promise<Loaded> {
  const cached = await readCache();
  try {
    const res = await fetch(`${base}data/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const manifest: Manifest = await res.json();
    if (cached && cached.hash === manifest.hash) return { dataset: cached.dataset, offline: false };
    const data = await fetch(`${base}data/${manifest.file}?v=${manifest.hash}`);
    if (!data.ok) throw new Error(`${manifest.file} ${data.status}`);
    const dataset: Dataset = await data.json();
    idbSet(KEY, { hash: manifest.hash, dataset } satisfies Cached).catch(() => undefined);
    return { dataset, offline: false };
  } catch (e) {
    if (cached) return { dataset: cached.dataset, offline: true };
    throw e;
  }
}
