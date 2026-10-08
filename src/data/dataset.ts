import { assembleLine, parseAsset, parseCatalog, parseCategory, parseManifest, splitDataset } from '../domain/catalog';
import { CATEGORIES, type Catalog, type CatalogManifest, type Category, type CategoryPayload, type Dataset, type Line } from '../domain/types';
import { idbBatch, idbGet, idbKeys, idbUpdate } from './idb';

const PREFIX = 'transit.';
const ACTIVE = `${PREFIX}active`;
const INSTALLED = `${PREFIX}installed`;
const STAGING = `${PREFIX}staging`;
const releaseKey = (release: string) => `${PREFIX}release.${release}`;
const payloadKey = (hash: string) => `${PREFIX}payload.${hash}`;
const base = import.meta.env.BASE_URL;

interface CachedRelease {
  manifest: CatalogManifest;
  catalogText: string;
  available: Category[];
}

function cacheAvailability(cached: CachedRelease | undefined): Category[] {
  if (!cached) return [];
  if (!Array.isArray(cached.available) || !cached.available.every((c) => CATEGORIES.includes(c))) {
    console.warn('Invalid cached transit availability');
    return [];
  }
  return CATEGORIES.filter((c) => cached.available.includes(c));
}

export interface DataState {
  manifest: CatalogManifest;
  catalog: Catalog;
  dataset: Dataset;
  offline: boolean;
  stale: boolean;
  loading: Category[];
  failed: Category[];
  cached: Category[];
  storageError: boolean;
  installed: CatalogManifest | null;
  installing: boolean;
  installProgress: number;
  installError: string | null;
}

class AssetError extends Error {}

/** The loader owns transit caches; the service worker deliberately does not intercept these URLs. */
export class CategoryData {
  private state: DataState;
  private listeners = new Set<() => void>();
  private geometry = new Map<Category, Line[]>();
  private requests = new Map<string, Promise<void>>();
  private downloads = new Map<string, Promise<string>>();
  private cacheWrites: Promise<void> = Promise.resolve();
  private refreshing: Promise<void> | null = null;
  private generation = 0;
  private catalogText: string;

  private constructor(manifest: CatalogManifest, catalog: Catalog, catalogText: string, offline: boolean, cached: Category[], installed: CatalogManifest | null, storageError: boolean) {
    this.catalogText = catalogText;
    this.state = {
      manifest, catalog, dataset: { schemaVersion: 1, feedVersion: manifest.feedVersion, referenceDate: manifest.referenceDate, generatedAt: manifest.generatedAt, lines: [] },
      offline, stale: false, loading: [], failed: [], cached, installed, storageError, installing: false, installProgress: 0, installError: null,
    };
  }

  getSnapshot = (): DataState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<DataState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private storageFailure(error: unknown) {
    console.warn('Transit offline storage failed:', error);
    this.update({ storageError: true });
  }

  static async open(): Promise<CategoryData> {
    let storageError = false;
    const safeRead = async <T,>(key: string): Promise<T | undefined> => {
      try { return await idbGet<T>(key); }
      catch (e) { console.warn('Transit cache read failed:', e); storageError = true; return undefined; }
    };
    const installedId = await safeRead<string>(INSTALLED);
    const installed = installedId ? await safeRead<CachedRelease>(releaseKey(installedId)) : undefined;
    let installedManifest: CatalogManifest | null = null;
    if (installed) {
      try { installedManifest = await parseManifest(installed.manifest); }
      catch (e) { console.warn('Invalid installed transit manifest:', e); }
    }
    let networkError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const manifest = await fetchManifest();
        const cached = await safeRead<CachedRelease>(releaseKey(manifest.release));
        let catalog: Catalog;
        let catalogText: string;
        try {
          if (!cached) throw new Error('Catalogue not cached');
          catalog = parseCatalog(await parseAsset(cached.catalogText, manifest.catalog), manifest);
          catalogText = cached.catalogText;
        } catch {
          ({ catalogText, catalog } = await fetchCatalog(manifest));
        }
        const loader = new CategoryData(manifest, catalog, catalogText, false, cacheAvailability(cached), installedManifest, storageError);
        try {
          await idbUpdate<CachedRelease>(releaseKey(manifest.release), (previous) => ({
            value: { manifest, catalogText, available: cacheAvailability(previous) }, entries: [[ACTIVE, manifest.release]],
          }));
        } catch (e) { loader.storageFailure(e); }
        await loader.garbageCollect();
        return loader;
      } catch (e) {
        networkError = e;
        if (!(e instanceof AssetError) || attempt === 1) break;
      }
    }
    const active = await safeRead<string>(ACTIVE);
    const activeCached = active ? active === installedId ? installed : await safeRead<CachedRelease>(releaseKey(active)) : undefined;
    for (const id of new Set([installedId, active])) {
      if (!id) continue;
      const cached = id === installedId ? installed : activeCached;
      if (!cached) continue;
      try {
        const manifest = await parseManifest(cached.manifest);
        const catalog = parseCatalog(await parseAsset(cached.catalogText, manifest.catalog), manifest);
        const loader = new CategoryData(manifest, catalog, cached.catalogText, true, cacheAvailability(cached), installedManifest, storageError);
        const activeDate = activeCached?.manifest?.generatedAt;
        loader.update({ stale: typeof activeDate === 'string' && Date.parse(activeDate) > Date.parse(manifest.generatedAt) });
        return loader;
      } catch (e) { console.warn('Invalid cached transit release:', e); }
    }
    // Only an offline migration reads the legacy monolith. User records are never touched.
    const legacy = await safeRead<{ dataset: Dataset }>('dataset');
    if (legacy?.dataset) {
      const split = await splitDataset(legacy.dataset);
      const catalogText = split.files.get(split.manifest.catalog.file)!;
      const catalog = parseCatalog(JSON.parse(catalogText), split.manifest);
      const loader = new CategoryData(split.manifest, catalog, catalogText, true, [], null, storageError);
      try {
        const entries: [string, unknown][] = [];
        for (const c of CATEGORIES) {
          const descriptor = split.manifest.categories[c];
          const text = split.files.get(descriptor.file)!;
          parseCategory(await parseAsset(text, descriptor), c, catalog);
          entries.push([payloadKey(descriptor.hash), text]);
        }
        await idbBatch([...entries,
          [releaseKey(split.manifest.release), { manifest: split.manifest, catalogText, available: [...CATEGORIES] } satisfies CachedRelease],
          [ACTIVE, split.manifest.release], [INSTALLED, split.manifest.release]]);
        loader.update({ cached: [...CATEGORIES], installed: split.manifest });
      } catch (e) { loader.storageFailure(e); }
      // Retain legacy geometry only if persistence failed; normally startup hydrates requested categories.
      if (loader.state.storageError) for (const c of CATEGORIES) loader.geometry.set(c, legacy.dataset.lines.filter((l) => l.category === c));
      return loader;
    }
    throw networkError ?? new Error('No transit data available');
  }

  categoriesForKeys(keys: readonly string[]): Category[] {
    const wanted = new Set(keys);
    return CATEGORIES.filter((c) => this.state.catalog.lines.some((l) => l.category === c && wanted.has(l.key)));
  }
  hasCategories(categories: readonly Category[]): boolean {
    return categories.every((c) => this.geometry.has(c));
  }
  async ensureKeys(keys: readonly string[]): Promise<DataState> {
    await this.ensure(this.categoriesForKeys(keys));
    const current = this.categoriesForKeys(keys);
    if (!this.hasCategories(current)) await this.ensure(current, false);
    return this.state;
  }

  async ensure(categories: readonly Category[], restart = true): Promise<void> {
    const generation = this.generation;
    try {
      await Promise.all(categories.map((c) => this.ensureCategory(c)));
    } catch (e) {
      if (restart && e instanceof AssetError && !this.state.offline) {
        await this.refreshManifest();
        return this.ensure(categories, false);
      }
      throw e;
    }
    if (generation !== this.generation) return this.ensure(categories, false);
  }

  private ensureCategory(category: Category): Promise<void> {
    if (this.geometry.has(category)) {
      if (!this.state.dataset.lines.length) this.publishGeometry();
      return Promise.resolve();
    }
    const { manifest, catalog } = this.state;
    const id = `${manifest.release}:${category}`;
    const pending = this.requests.get(id);
    if (pending) return pending;
    this.update({ loading: [...new Set([...this.state.loading, category])], failed: this.state.failed.filter((c) => c !== category) });
    const request = this.resolvePayload(manifest, catalog, category).then((payload) => {
      if (this.state.manifest.release !== manifest.release) return;
      const byKey = new Map(payload.lines.map((l) => [l.key, l]));
      this.geometry.set(category, catalog.lines.filter((l) => l.category === category).map((l) => assembleLine(l, byKey.get(l.key)!)));
      this.publishGeometry();
    }).catch((e: unknown) => {
      if (this.state.manifest.release === manifest.release) this.update({ failed: [...new Set([...this.state.failed, category])] });
      throw e;
    }).finally(() => {
      this.requests.delete(id);
      if (this.state.manifest.release === manifest.release) this.update({ loading: this.state.loading.filter((c) => c !== category) });
    });
    this.requests.set(id, request);
    return request;
  }

  private publishGeometry() {
    const keys = new Map([...this.geometry.values()].flat().map((l) => [l.key, l]));
    this.update({ dataset: { ...this.state.dataset, lines: this.state.catalog.lines.flatMap((l) => keys.has(l.key) ? [keys.get(l.key)!] : []) } });
  }

  private async resolvePayload(manifest: CatalogManifest, catalog: Catalog, category: Category, durable = false): Promise<CategoryPayload> {
    const descriptor = manifest.categories[category];
    let text: string | undefined;
    try { text = await idbGet<string>(payloadKey(descriptor.hash)); }
    catch (e) { this.storageFailure(e); if (durable) throw e; }
    if (text !== undefined) {
      let payload: CategoryPayload | undefined;
      try {
        payload = parseCategory(await parseAsset(text, descriptor), category, catalog);
      }
      catch (e) { console.warn('Invalid cached category:', category, e); }
      if (payload) {
        if (durable || (manifest.release === this.state.manifest.release && !this.state.cached.includes(category))) {
          try { await this.persistCategory(manifest, category, text); }
          catch (e) { this.storageFailure(e); if (durable) throw e; }
        }
        return payload;
      }
    }
    let download = this.downloads.get(descriptor.hash);
    if (!download) {
      download = fetchAsset(descriptor.file);
      this.downloads.set(descriptor.hash, download);
    }
    try {
      text = await download;
      let payload: CategoryPayload;
      try { payload = parseCategory(await parseAsset(text, descriptor), category, catalog); }
      catch (e) { throw new AssetError(`Invalid downloaded category: ${category}`, { cause: e }); }
      try { await this.persistCategory(manifest, category, text); }
      catch (e) {
        this.storageFailure(e);
        await this.invalidateCategory(manifest, category);
        if (durable) throw e;
      }
      return payload;
    } catch (e) {
      await this.invalidateCategory(manifest, category);
      throw e;
    } finally {
      if (this.downloads.get(descriptor.hash) === download) this.downloads.delete(descriptor.hash);
    }
  }

  private async invalidateCategory(manifest: CatalogManifest, category: Category): Promise<void> {
    if (manifest.release === this.state.manifest.release) {
      this.update({ cached: this.state.cached.filter((c) => c !== category) });
    }
    if (this.state.installed?.release === manifest.release) this.update({ installed: null });
    try {
      const installed = await idbGet<string>(INSTALLED);
      await idbUpdate<CachedRelease>(releaseKey(manifest.release), (cached) => {
        if (!cached) throw new Error('Catalogue was not saved');
        return { value: { ...cached, available: cacheAvailability(cached).filter((c) => c !== category) }, deletes: installed === manifest.release ? [INSTALLED] : [] };
      });
    } catch (e) { this.storageFailure(e); }
  }

  private persistCategory(manifest: CatalogManifest, category: Category, text: string): Promise<void> {
    const write = this.cacheWrites.catch(() => undefined).then(async () => {
      let available: Category[] = [];
      await idbUpdate<CachedRelease>(releaseKey(manifest.release), (cached) => {
        if (!cached) throw new Error('Catalogue was not saved');
        const before = cacheAvailability(cached);
        available = CATEGORIES.filter((c) => c === category || before.includes(c));
        return { value: { ...cached, available }, entries: [[payloadKey(manifest.categories[category].hash), text]] };
      });
      if (manifest.release === this.state.manifest.release) this.update({ cached: available });
    });
    this.cacheWrites = write;
    return write;
  }

  private refreshManifest(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const manifest = await fetchManifest();
      if (manifest.release === this.state.manifest.release) return;
      const { catalogText, catalog } = await fetchCatalog(manifest);
      this.generation++;
      this.geometry.clear();
      this.catalogText = catalogText;
      this.update({ manifest, catalog, dataset: { schemaVersion: 1, feedVersion: manifest.feedVersion, referenceDate: manifest.referenceDate, generatedAt: manifest.generatedAt, lines: [] }, cached: [], loading: [], failed: [] });
      try {
        await idbUpdate<CachedRelease>(releaseKey(manifest.release), (previous) => ({
          value: { manifest, catalogText, available: cacheAvailability(previous) }, entries: [[ACTIVE, manifest.release]],
        }));
      }
      catch (e) { this.storageFailure(e); }
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async installAll(restart = true): Promise<void> {
    if (this.state.installing) return;
    const { manifest, catalog } = this.state;
    const catalogText = this.catalogText;
    this.update({ installing: true, installProgress: 0, installError: null });
    let retryRelease = false;
    try {
      await idbUpdate<CachedRelease>(releaseKey(manifest.release), (previous) => ({
        value: { manifest, catalogText, available: cacheAvailability(previous) },
        entries: [[STAGING, manifest.release]],
      }));
      for (const category of CATEGORIES) {
        await this.resolvePayload(manifest, catalog, category, true);
        this.update({ installProgress: this.state.installProgress + 1 });
      }
      await idbUpdate<CachedRelease>(releaseKey(manifest.release), (saved) => {
        if (!saved || !CATEGORIES.every((c) => cacheAvailability(saved).includes(c))) throw new Error('Installation is incomplete');
        return { value: saved, entries: [[INSTALLED, manifest.release]], deletes: [STAGING] };
      });
      this.update({ installed: manifest, storageError: false });
      await this.garbageCollect();
    } catch (e) {
      console.warn('Transit installation failed:', e);
      this.update({ installError: String(e instanceof Error ? e.message : e) });
      if (restart && e instanceof AssetError) {
        try {
          await this.refreshManifest();
          retryRelease = this.state.manifest.release !== manifest.release;
        } catch (refreshError) { console.warn('Installation manifest refresh failed:', refreshError); }
      }
    } finally { this.update({ installing: false }); }
    if (retryRelease) await this.installAll(false);
  }

  private async garbageCollect() {
    try {
      const ids = await Promise.all([idbGet<string>(ACTIVE), idbGet<string>(INSTALLED), idbGet<string>(STAGING)]);
      const protect = new Set<string>([ACTIVE, INSTALLED, STAGING]);
      for (const id of new Set([this.state.manifest.release, ...ids])) {
        if (!id) continue;
        protect.add(releaseKey(id));
        const cached = await idbGet<CachedRelease>(releaseKey(id));
        if (cached) for (const c of CATEGORIES) protect.add(payloadKey(cached.manifest.categories[c].hash));
      }
      const owned = /^transit\.(?:release|payload)\.[a-f0-9]{64}$/;
      const remove = (await idbKeys()).filter((key) => owned.test(key) && !protect.has(key));
      if (remove.length) await idbBatch([], remove);
    } catch (e) { this.storageFailure(e); }
  }
}

async function fetchManifest(): Promise<CatalogManifest> {
  const response = await fetch(`${base}data/catalog-manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Catalogue manifest HTTP ${response.status}`);
  return parseManifest(await response.json());
}
async function fetchAsset(file: string): Promise<string> {
  const response = await fetch(`${base}data/${file}`, { cache: 'no-cache' });
  if (!response.ok) throw new AssetError(`${file} HTTP ${response.status}`);
  return response.text();
}

async function fetchCatalog(manifest: CatalogManifest): Promise<{ catalogText: string; catalog: Catalog }> {
  const catalogText = await fetchAsset(manifest.catalog.file);
  try { return { catalogText, catalog: parseCatalog(await parseAsset(catalogText, manifest.catalog), manifest) }; }
  catch (e) { throw new AssetError('Invalid downloaded catalogue', { cause: e }); }
}

export const loadDataset = () => CategoryData.open();
