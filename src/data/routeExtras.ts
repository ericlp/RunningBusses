import { parseAsset } from '../domain/catalog';
import { elevationProfileId, parseElevationProfile, type ElevationProfile } from '../domain/elevation';
import { CATEGORIES, type AssetDescriptor, type Catalog, type CatalogManifest, type Category } from '../domain/types';
import { idbBatch, idbGet } from './idb';

interface RouteExtrasManifest {
  schemaVersion: 1;
  transitRelease: string;
  buildVersion: string;
  source: {
    name: string;
    attribution: string;
    licence: string;
    note: string;
  };
  elevation: Partial<Record<Category, AssetDescriptor>>;
}

interface ElevationPayload {
  schemaVersion: 1;
  category: Category;
  profiles: ElevationProfile[];
}

export interface ElevationLoadResult {
  manifest: RouteExtrasManifest | null;
  profiles: Map<string, ElevationProfile>;
  unavailableKeys: string[];
  storageError: boolean;
}

interface Dependencies {
  fetcher: typeof fetch;
  get: typeof idbGet;
  batch: typeof idbBatch;
  base: string;
}

const defaultDependencies: Dependencies = {
  fetcher: fetch,
  get: idbGet,
  batch: idbBatch,
  base: import.meta.env.BASE_URL,
};

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const manifestKey = (release: string) => `transit.extras.manifest.${release}`;
const payloadKey = (hash: string) => `transit.extras.payload.${hash}`;
const MANIFEST_PATH = 'data/route-extras-manifest.json';

class RouteExtrasNotFound extends Error {}
class ExtrasReleaseMismatch extends Error {}

function parseManifest(value: unknown, transitRelease: string): RouteExtrasManifest {
  if (!object(value) || value.schemaVersion !== 1) throw new Error('Invalid route extras manifest');
  if (value.transitRelease !== transitRelease) throw new ExtrasReleaseMismatch('Elevation manifest transit release mismatch');
  if (!nonempty(value.buildVersion) || !object(value.source) || !nonempty(value.source.name) || !nonempty(value.source.attribution) ||
      !nonempty(value.source.licence) || !nonempty(value.source.note) || !object(value.elevation)) {
    throw new Error('Invalid route extras manifest');
  }
  const elevation: Partial<Record<Category, AssetDescriptor>> = {};
  for (const [category, descriptor] of Object.entries(value.elevation)) {
    const knownCategory = CATEGORIES.find((candidate) => candidate === category);
    if (!knownCategory || !object(descriptor) || !hash(descriptor.hash) ||
        descriptor.file !== `extras/elevation/${knownCategory}.${descriptor.hash}.json` ||
        !integer(descriptor.count) || descriptor.count === 0 || !integer(descriptor.bytes)) {
      throw new Error('Invalid elevation asset descriptor');
    }
    elevation[knownCategory] = {
      file: descriptor.file,
      hash: descriptor.hash,
      count: descriptor.count,
      bytes: descriptor.bytes,
    };
  }
  return {
    schemaVersion: 1,
    transitRelease,
    buildVersion: value.buildVersion,
    source: {
      name: value.source.name,
      attribution: value.source.attribution,
      licence: value.source.licence,
      note: value.source.note,
    },
    elevation,
  };
}

async function parsePayload(text: string, descriptor: AssetDescriptor, category: Category, catalog: Catalog): Promise<ElevationPayload> {
  const value = await parseAsset(text, descriptor);
  const allowed = new Set(catalog.lines.filter((line) => line.category === category).map((line) => line.key));
  if (!object(value) || value.schemaVersion !== 1 || value.category !== category ||
      !Array.isArray(value.profiles) || value.profiles.length !== descriptor.count) {
    throw new Error(`Invalid elevation payload: ${category}`);
  }
  const seen = new Set<string>();
  const profiles = value.profiles.map((profile) => {
    const parsed = parseElevationProfile(profile);
    if (!allowed.has(parsed.routeKey)) throw new Error(`Unknown route in elevation payload: ${parsed.routeKey}`);
    const id = elevationProfileId(parsed.routeKey, parsed.geometryHash);
    if (seen.has(id)) throw new Error(`Duplicate elevation profile: ${parsed.routeKey}`);
    seen.add(id);
    return parsed;
  });
  return { schemaVersion: 1, category, profiles };
}

async function readCached<T>(key: string, get: Dependencies['get']): Promise<T | undefined> {
  return get<T>(key);
}

async function fetchText(url: string, fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(url, { cache: 'no-cache' });
  if (response.status === 404) throw new RouteExtrasNotFound(url);
  if (!response.ok) throw new Error(`Route extras request failed (${response.status}): ${url}`);
  return response.text();
}

/** Loads only requested route categories. Call this on profile demand, never during app startup. */
export async function loadElevationProfiles(
  transitManifest: CatalogManifest,
  catalog: Catalog,
  routeKeys: readonly string[],
  dependencies: Dependencies = defaultDependencies,
): Promise<ElevationLoadResult> {
  const wanted = new Set(routeKeys);
  const requested = catalog.lines.filter((line) => wanted.has(line.key));
  const requestedCategories = [...new Set(requested.map((line) => line.category))];
  if (requestedCategories.length === 0) {
    return { manifest: null, profiles: new Map(), unavailableKeys: [...wanted], storageError: false };
  }

  let storageError = false;
  let manifestText: string | undefined;
  let fetchedManifest = false;
  try {
    manifestText = await fetchText(`${dependencies.base}${MANIFEST_PATH}`, dependencies.fetcher);
    fetchedManifest = true;
  } catch (networkError) {
    if (networkError instanceof RouteExtrasNotFound) {
      return { manifest: null, profiles: new Map(), unavailableKeys: requested.map((line) => line.key), storageError: false };
    }
    try { manifestText = await readCached<string>(manifestKey(transitManifest.release), dependencies.get); }
    catch (storageReadError) {
      console.warn('Route extras manifest cache read failed:', storageReadError);
      storageError = true;
    }
    if (manifestText === undefined) throw new Error('Elevation profiles could not be loaded from the network or offline cache', { cause: networkError });
  }

  let manifest: RouteExtrasManifest;
  try { manifest = parseManifest(JSON.parse(manifestText), transitManifest.release); }
  catch (error) {
    if (error instanceof ExtrasReleaseMismatch) throw error;
    throw new Error('The elevation manifest is invalid.', { cause: error });
  }

  const profiles = new Map<string, ElevationProfile>();
  const payloadWrites: [string, unknown][] = [];
  for (const category of requestedCategories) {
    const descriptor = manifest.elevation[category];
    if (!descriptor) continue;
    let text: string | undefined;
    try { text = await readCached<string>(payloadKey(descriptor.hash), dependencies.get); }
    catch (error) {
      console.warn('Elevation payload cache read failed:', category, error);
      storageError = true;
    }
    let payload: ElevationPayload | undefined;
    if (text !== undefined) {
      try { payload = await parsePayload(text, descriptor, category, catalog); }
      catch (error) { console.warn('Invalid cached elevation payload:', category, error); }
    }
    if (!payload) {
      text = await fetchText(`${dependencies.base}data/${descriptor.file}`, dependencies.fetcher);
      payload = await parsePayload(text, descriptor, category, catalog);
      payloadWrites.push([payloadKey(descriptor.hash), text]);
    }
    for (const profile of payload.profiles) {
      profiles.set(elevationProfileId(profile.routeKey, profile.geometryHash), profile);
    }
  }

  if (fetchedManifest) payloadWrites.push([manifestKey(transitManifest.release), manifestText]);
  if (payloadWrites.length) {
    try { await dependencies.batch(payloadWrites); }
    catch (error) {
      console.warn('Elevation profile offline storage failed:', error);
      storageError = true;
    }
  }
  const availableKeys = new Set([...profiles.values()].map((profile) => profile.routeKey));
  return {
    manifest,
    profiles,
    unavailableKeys: requested.filter((line) => !availableKeys.has(line.key)).map((line) => line.key),
    storageError,
  };
}
