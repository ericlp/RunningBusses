import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { fromUrl } from 'geotiff';
import { haversineM, pathLengthM } from '../../src/domain/geo';
import { parseElevationProfile, routeGeometryHash, type ElevationProfile, type ElevationSample } from '../../src/domain/elevation';
import type { Category, Dataset, Line } from '../../src/domain/types';
import { parseAsset, splitDataset } from '../../src/domain/catalog';

const BASE_URL = 'https://copernicus-dem-30m.s3.amazonaws.com';
const TILE_PREFIX = 'Copernicus_DSM_COG_10_';
const BUILD_VERSION = 'cop-dem-glo30-v1';
const SAMPLE_SPACING_M = 25;
const BLOCK_SIZE = 1024;
const MAX_BLOCK_CONCURRENCY = 4;
const MAX_CACHED_BLOCKS = 16;
const COVERED_CATEGORIES = new Set<Category>(['stadsbuss', 'stombuss', 'express', 'industri', 'tram']);

export interface ElevationSidecarManifest {
  schemaVersion: 1;
  transitRelease: string;
  buildVersion: string;
  source: {
    name: string;
    attribution: string;
    licence: string;
    note: string;
  };
  elevation: Partial<Record<Category, { file: string; hash: string; count: number; bytes: number }>>;
}

interface ElevationPayload {
  schemaVersion: 1;
  category: Category;
  profiles: ElevationProfile[];
}

export interface ElevationSampler {
  sample(lon: number, lat: number): Promise<number | null>;
}

interface SampleLocation {
  distanceM: number;
  lon: number;
  lat: number;
}

interface TileInfo {
  id: string;
  url: string;
}

type RasterImage = Awaited<ReturnType<Awaited<ReturnType<typeof fromUrl>>['getImage']>>;

function tileFor(lon: number, lat: number): TileInfo | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat >= 90 || lon < -180 || lon >= 180) return null;
  const latDeg = Math.floor(lat);
  const lonDeg = Math.floor(lon);
  const northSouth = `${latDeg >= 0 ? 'N' : 'S'}${String(Math.abs(latDeg)).padStart(2, '0')}_00`;
  const eastWest = `${lonDeg >= 0 ? 'E' : 'W'}${String(Math.abs(lonDeg)).padStart(3, '0')}_00`;
  const id = `${TILE_PREFIX}${northSouth}_${eastWest}_DEM`;
  return { id, url: `${BASE_URL}/${id}/${id}.tif` };
}

function distanceSamples(line: Line): SampleLocation[] {
  const actualLength = pathLengthM(line.coordinates);
  if (!Number.isFinite(actualLength) || actualLength <= 0 || !Number.isFinite(line.lengthM) || line.lengthM <= 0) {
    throw new Error(`Cannot sample invalid route length: ${line.key}`);
  }
  const count = Math.ceil(line.lengthM / SAMPLE_SPACING_M);
  const cumulative = [0];
  for (let i = 1; i < line.coordinates.length; i++) {
    const [lon1, lat1] = line.coordinates[i - 1];
    const [lon2, lat2] = line.coordinates[i];
    cumulative.push(cumulative[i - 1] + haversineM({ lon: lon1, lat: lat1 }, { lon: lon2, lat: lat2 }));
  }
  let segment = 1;
  return Array.from({ length: count + 1 }, (_, index) => {
    const distanceM = Math.min(index * SAMPLE_SPACING_M, line.lengthM);
    const target = distanceM / line.lengthM * actualLength;
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment++;
    const before = cumulative[segment - 1];
    const span = cumulative[segment] - before;
    const ratio = span === 0 ? 0 : (target - before) / span;
    const [lon1, lat1] = line.coordinates[segment - 1];
    const [lon2, lat2] = line.coordinates[segment];
    return {
      distanceM,
      lon: lon1 + (lon2 - lon1) * ratio,
      lat: lat1 + (lat2 - lat1) * ratio,
    };
  });
}

async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, work: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await work(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export class CopernicusSampler implements ElevationSampler {
  private readonly images = new Map<string, Promise<RasterImage | null>>();
  private readonly blocks = new Map<string, Promise<{ width: number; values: ArrayLike<number> }>>();
  private readonly warnedMissing = new Set<string>();

  async sample(lon: number, lat: number): Promise<number | null> {
    const tile = tileFor(lon, lat);
    if (!tile) return null;
    const image = await this.image(tile);
    if (!image) return null;
    const geoKeys = image.getGeoKeys();
    if (geoKeys?.GeographicTypeGeoKey !== 4326) {
      throw new Error(`Unexpected Copernicus CRS for ${tile.id}: ${geoKeys?.GeographicTypeGeoKey}`);
    }
    const origin = image.getOrigin();
    const resolution = image.getResolution();
    if (origin.length < 2 || resolution.length < 2 || resolution[0] === 0 || resolution[1] === 0) {
      throw new Error(`Invalid Copernicus raster transform: ${tile.id}`);
    }
    const pixelX = Math.floor((lon - origin[0]) / resolution[0]);
    const pixelY = Math.floor((lat - origin[1]) / resolution[1]);
    if (pixelX < 0 || pixelY < 0 || pixelX >= image.getWidth() || pixelY >= image.getHeight()) return null;
    const blockX = Math.floor(pixelX / BLOCK_SIZE) * BLOCK_SIZE;
    const blockY = Math.floor(pixelY / BLOCK_SIZE) * BLOCK_SIZE;
    const key = `${tile.id}:${blockX}:${blockY}`;
    let block = this.blocks.get(key);
    if (!block) {
      block = image.readRasters({
        window: [blockX, blockY, Math.min(blockX + BLOCK_SIZE, image.getWidth()), Math.min(blockY + BLOCK_SIZE, image.getHeight())],
        samples: [0],
        interleave: true,
      }).then((data) => ({
        width: data.width,
        values: data,
      }));
      this.blocks.set(key, block);
      if (this.blocks.size > MAX_CACHED_BLOCKS) this.blocks.delete(this.blocks.keys().next().value!);
    }
    this.blocks.delete(key);
    this.blocks.set(key, block);
    const raster = await block;
    const value = raster.values[(pixelY - blockY) * raster.width + (pixelX - blockX)];
    const noData = image.getGDALNoData();
    if (!Number.isFinite(value) || (noData !== null && value === noData) || value <= -10000) return null;
    return Math.round(value * 2) / 2;
  }

  private image(tile: TileInfo): Promise<RasterImage | null> {
    const cached = this.images.get(tile.id);
    if (cached) return cached;
    const opening = (async () => {
      const exists = await fetch(tile.url, { method: 'HEAD' });
      if (exists.status === 404) {
        if (!this.warnedMissing.has(tile.id)) {
          console.warn(`Copernicus elevation tile is unavailable: ${tile.id}`);
          this.warnedMissing.add(tile.id);
        }
        return null;
      }
      if (!exists.ok) throw new Error(`Copernicus tile check failed (${exists.status}): ${tile.id}`);
      const tiff = await fromUrl(tile.url, { maxRanges: 4, allowFullFile: false });
      return tiff.getImage();
    })();
    this.images.set(tile.id, opening);
    opening.catch(() => this.images.delete(tile.id));
    return opening;
  }
}

export async function makeElevationProfile(line: Line, sampler: ElevationSampler): Promise<ElevationProfile> {
  const samples = await mapConcurrent(distanceSamples(line), 8, async (sample): Promise<ElevationSample> => {
    const elevationM = await sampler.sample(sample.lon, sample.lat);
    return {
      distanceM: sample.distanceM,
      elevationM: elevationM === null ? null : Math.round(elevationM * 2) / 2,
      estimated: false,
    };
  });
  if (samples.length < 2 || samples[0].distanceM !== 0 || samples.at(-1)?.distanceM !== line.lengthM) {
    throw new Error(`Elevation samples do not cover both route endpoints: ${line.key}`);
  }
  return {
    schemaVersion: 1,
    routeKey: line.key,
    geometryHash: await routeGeometryHash(line.coordinates),
    lengthM: line.lengthM,
    samples,
  };
}

export async function createElevationSidecar(
  dataset: Dataset,
  sampler: ElevationSampler,
): Promise<{ manifest: ElevationSidecarManifest; files: Map<string, string> }> {
  const transit = await splitDataset(dataset);
  const files = new Map<string, string>();
  const elevation: ElevationSidecarManifest['elevation'] = {};
  for (const category of COVERED_CATEGORIES) {
    const lines = dataset.lines.filter((line) => line.category === category);
    if (!lines.length) continue;
    const profiles = await mapConcurrent(lines, MAX_BLOCK_CONCURRENCY, (line) => makeElevationProfile(line, sampler));
    const payload: ElevationPayload = { schemaVersion: 1, category, profiles };
    const text = JSON.stringify(payload);
    const hash = createHash('sha256').update(text).digest('hex');
    const file = `extras/elevation/${category}.${hash}.json`;
    files.set(file, text);
    elevation[category] = { file, hash, count: profiles.length, bytes: Buffer.byteLength(text) };
    const covered = profiles.filter((profile) => profile.samples.some((sample) => sample.elevationM !== null)).length;
    console.log(`Elevation ${category}: ${covered}/${profiles.length} routes have sampled heights`);
  }
  return {
    manifest: {
      schemaVersion: 1,
      transitRelease: transit.manifest.release,
      buildVersion: BUILD_VERSION,
      source: {
        name: 'Copernicus DEM GLO-30 Public (digital surface model)',
        attribution: `Copernicus Digital Elevation Model (DEM) was accessed on ${new Date().toISOString().slice(0, 10)} from https://registry.opendata.aws/copernicus-dem.`,
        licence: 'Copernicus DEM Licence',
        note: 'Approximate surface elevations sampled at about 25 m intervals from the Copernicus DEM 2021 release. Buildings and vegetation may affect heights; bridges and tunnels are not corrected. Heights use the Copernicus vertical reference and are not mixed with other elevation sources.',
      },
      elevation,
    },
    files,
  };
}

export async function writeElevationSidecar(dataset: Dataset, outDir: string, sampler: ElevationSampler = new CopernicusSampler()): Promise<void> {
  const { manifest, files } = await createElevationSidecar(dataset, sampler);
  const extrasDir = `${outDir}/extras/elevation`;
  mkdirSync(extrasDir, { recursive: true });
  for (const [file, text] of files) writeFileSync(`${outDir}/${file}`, text);
  writeFileSync(`${outDir}/route-extras-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  for (const filename of readdirSync(extrasDir)) {
    if (/^(stadsbuss|stombuss|express|industri|tram)\.[a-f0-9]{64}\.json$/.test(filename) &&
        !files.has(`extras/elevation/${filename}`)) unlinkSync(`${extrasDir}/${filename}`);
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function validateElevationSidecar(dataset: Dataset, outDir: string): Promise<void> {
  const transit = await splitDataset(dataset);
  const value: unknown = JSON.parse(readFileSync(`${outDir}/route-extras-manifest.json`, 'utf8'));
  if (!isObject(value) || value.schemaVersion !== 1 || value.transitRelease !== transit.manifest.release ||
      typeof value.buildVersion !== 'string' || value.buildVersion !== BUILD_VERSION || !isObject(value.source) ||
      typeof value.source.name !== 'string' || typeof value.source.attribution !== 'string' ||
      typeof value.source.licence !== 'string' || typeof value.source.note !== 'string' || !isObject(value.elevation)) {
    throw new Error('Invalid elevation sidecar manifest or transit release mismatch');
  }
  const expectedCategories = [...COVERED_CATEGORIES].filter((category) => dataset.lines.some((line) => line.category === category));
  if (Object.keys(value.elevation).length !== expectedCategories.length) throw new Error('Elevation category coverage differs');
  for (const category of expectedCategories) {
    const descriptor = value.elevation[category];
    if (!isObject(descriptor) || typeof descriptor.hash !== 'string' || !/^[a-f0-9]{64}$/.test(descriptor.hash) ||
        descriptor.file !== `extras/elevation/${category}.${descriptor.hash}.json` ||
        typeof descriptor.count !== 'number' || !Number.isSafeInteger(descriptor.count) ||
        descriptor.count !== dataset.lines.filter((line) => line.category === category).length ||
        typeof descriptor.bytes !== 'number' || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 0) {
      throw new Error(`Invalid elevation descriptor: ${category}`);
    }
    const payloadText = readFileSync(`${outDir}/${descriptor.file}`, 'utf8');
    const payload = await parseAsset(payloadText, {
      file: descriptor.file,
      hash: descriptor.hash,
      count: descriptor.count,
      bytes: descriptor.bytes,
    });
    if (!isObject(payload) || payload.schemaVersion !== 1 || payload.category !== category ||
        !Array.isArray(payload.profiles) || payload.profiles.length !== descriptor.count) {
      throw new Error(`Invalid elevation payload: ${category}`);
    }
    const expectedLines = new Map(dataset.lines.filter((line) => line.category === category).map((line) => [line.key, line]));
    const seen = new Set<string>();
    for (const raw of payload.profiles) {
      if (!isObject(raw) || typeof raw.routeKey !== 'string') throw new Error(`Invalid elevation route profile: ${category}`);
      const line = expectedLines.get(raw.routeKey);
      if (!line || seen.has(line.key)) throw new Error(`Unexpected or duplicate elevation route: ${raw.routeKey}`);
      const geometryHash = await routeGeometryHash(line.coordinates);
      const profile = parseElevationProfile(raw, { routeKey: line.key, geometryHash });
      if (profile.lengthM !== line.lengthM) throw new Error(`Elevation length differs from route: ${line.key}`);
      seen.add(line.key);
    }
    if (seen.size !== expectedLines.size) throw new Error(`Missing elevation route profiles: ${category}`);
  }
}
