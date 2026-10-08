import { CATEGORIES, type AssetDescriptor, type Catalog, type CatalogManifest, type Category, type CategoryPayload, type Dataset, type Line, type LineGeometry, type LineMetadata } from './types';

export async function contentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function assembleLine(metadata: LineMetadata, geometry: CategoryPayload['lines'][number]): Line {
  return { ...metadata, ...(geometry.viaAt !== undefined ? { viaAt: geometry.viaAt } : {}), coordinates: geometry.coordinates };
}

export async function splitDataset(dataset: Dataset): Promise<{ manifest: CatalogManifest & { categories: Record<Category, AssetDescriptor> }; files: Map<string, string> }> {
  const files = new Map<string, string>();
  const metadata = dataset.lines.map(({ coordinates: _coordinates, viaAt: _viaAt, ...rest }) => rest);
  const descriptor = async (prefix: string, value: Catalog | CategoryPayload): Promise<AssetDescriptor> => {
    const text = JSON.stringify(value);
    const hash = await contentHash(text);
    const file = `${prefix}.${hash}.json`;
    files.set(file, text);
    return { file, hash, count: value.lines.length, bytes: new TextEncoder().encode(text).length };
  };
  const catalog = await descriptor('catalog', { schemaVersion: 2, lines: metadata });
  const categories = {} as Record<Category, AssetDescriptor>;
  for (const category of CATEGORIES) {
    const lines = dataset.lines.filter((l) => l.category === category).map((l) => ({
      key: l.key, coordinates: l.coordinates, ...(l.viaAt !== undefined ? { viaAt: l.viaAt } : {}),
    }));
    categories[category] = await descriptor(`categories/${category}`, { schemaVersion: 2, category, lines });
  }
  const { feedVersion, referenceDate, generatedAt } = dataset;
  const release = await contentHash(JSON.stringify({ feedVersion, referenceDate, catalog, categories }));
  return { manifest: { schemaVersion: 2, release, feedVersion, referenceDate, generatedAt, lineCount: metadata.length, catalog, categories }, files };
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const pairs = (v: unknown): v is [number, number][] => Array.isArray(v) && v.every((p) =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);

export async function parseManifest(value: unknown): Promise<CatalogManifest> {
  if (!object(value) || value.schemaVersion !== 2 || !hash(value.release) || !integer(value.lineCount) ||
      typeof value.feedVersion !== 'string' || typeof value.referenceDate !== 'string' || typeof value.generatedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.generatedAt)) || !object(value.categories)) throw new Error('Invalid catalogue manifest');
  const descriptor = (v: unknown, prefix: string): v is AssetDescriptor => object(v) && hash(v.hash) &&
    v.file === `${prefix}.${v.hash}.json` && integer(v.count) && integer(v.bytes);
  if (!descriptor(value.catalog, 'catalog')) throw new Error('Invalid asset descriptor');
  const categories = {} as CatalogManifest['categories'];
  for (const c of CATEGORIES) {
    const entry = value.categories[c];
    if (c === 'ferry' && entry === undefined) continue;
    if (!descriptor(entry, `categories/${c}`)) throw new Error('Invalid asset descriptor');
    categories[c] = entry;
  }
  const manifest: CatalogManifest = {
    schemaVersion: 2, release: value.release, feedVersion: value.feedVersion, referenceDate: value.referenceDate,
    generatedAt: value.generatedAt, lineCount: value.lineCount, catalog: value.catalog, categories,
  };
  if (manifest.catalog.count !== manifest.lineCount || CATEGORIES.reduce((n, c) => n + (manifest.categories[c]?.count ?? 0), 0) !== manifest.lineCount ||
      await contentHash(JSON.stringify({ feedVersion: manifest.feedVersion, referenceDate: manifest.referenceDate, catalog: manifest.catalog, categories: manifest.categories })) !== manifest.release) {
    throw new Error('Invalid release hash or counts');
  }
  return manifest;
}

export async function parseAsset(text: string, descriptor: AssetDescriptor): Promise<unknown> {
  if (new TextEncoder().encode(text).length !== descriptor.bytes || await contentHash(text) !== descriptor.hash) throw new Error(`Invalid asset hash: ${descriptor.file}`);
  return JSON.parse(text);
}

export function parseCatalog(value: unknown, manifest: CatalogManifest): Catalog {
  const metadata = (l: unknown): l is LineMetadata => object(l) &&
    ['key', 'number', 'label', 'from', 'to'].every((k) => typeof l[k] === 'string') &&
    typeof l.lengthM === 'number' && Number.isFinite(l.lengthM) && l.lengthM >= 0 && strings(l.via) &&
    strings(l.tags) && l.tags.every((t) => ['call-ordered', 'loop', 'one-way', 'retur'].includes(t)) &&
    CATEGORIES.some((c) => c === l.category) && (l.color === undefined || (typeof l.color === 'string' && /^#[a-f0-9]{6}$/i.test(l.color))) &&
    !('coordinates' in l) && !('viaAt' in l);
  if (!object(value) || value.schemaVersion !== 2 || !Array.isArray(value.lines) || value.lines.length !== manifest.lineCount || !value.lines.every(metadata)) throw new Error('Invalid catalogue');
  const keys = new Set<string>();
  for (const l of value.lines) {
    if (keys.has(l.key)) throw new Error('Duplicate catalogue key');
    keys.add(l.key);
  }
  const catalog: Catalog = { schemaVersion: 2, lines: value.lines };
  if (!CATEGORIES.every((c) => catalog.lines.filter((l) => l.category === c).length === (manifest.categories[c]?.count ?? 0))) throw new Error('Invalid category membership');
  return catalog;
}

export function parseCategory(value: unknown, category: Category, catalog: Catalog): CategoryPayload {
  const expected = new Map(catalog.lines.filter((l) => l.category === category).map((l) => [l.key, l]));
  const geometry = (l: unknown): l is LineGeometry => object(l) && typeof l.key === 'string' && expected.has(l.key) &&
    pairs(l.coordinates) && l.coordinates.length >= 2 &&
    (l.viaAt === undefined || (pairs(l.viaAt) && l.viaAt.length === expected.get(l.key)!.via.length));
  if (!object(value) || value.schemaVersion !== 2 || value.category !== category || !Array.isArray(value.lines) ||
      value.lines.length !== expected.size || !value.lines.every(geometry)) throw new Error('Invalid category payload');
  const seen = new Set<string>();
  for (const l of value.lines) {
    if (seen.has(l.key)) throw new Error('Duplicate geometry key');
    seen.add(l.key);
  }
  return { schemaVersion: 2, category, lines: value.lines };
}
