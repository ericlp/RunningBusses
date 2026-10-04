import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { pathLengthM } from '../src/domain/geo';
import type { Category, Dataset, Line, Manifest } from '../src/domain/types';
import { readCsv } from './transit/csv';
import { categoryOf as categorize, type CategoryConfig } from './transit/category';
import { planRoutes, type Pattern } from './transit/select';

interface Config {
  routeIdPrefix: string;
  agencyIdSuffix: string;
  categories: CategoryConfig;
  splitDirections: { lengthDifference: number };
}

const root = new URL('..', import.meta.url).pathname;
const cacheDir = `${root}.cache`;
const feedDir = `${cacheDir}/vt`;
const outDir = `${root}public/data`;
const config: Config = JSON.parse(readFileSync(`${root}config/lines.json`, 'utf8'));
const args = process.argv.slice(2);
const argValue = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const categoryOf = (name: string, isTram = false): Category | undefined => categorize(name, config.categories, isTram);

async function download(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const key = process.env.TRAFIKLAB_API_KEY;
  if (!key) throw new Error('TRAFIKLAB_API_KEY is not set (see .env.example)');
  mkdirSync(feedDir, { recursive: true });
  const res = await fetch(`https://opendata.samtrafiken.se/gtfs/vt/vt.zip?key=${key}`, {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  if (!res.ok) throw new Error(`Feed download failed: HTTP ${res.status}`);
  await writeFile(`${cacheDir}/vt.zip`, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-oq', `${cacheDir}/vt.zip`, '-d', feedDir]);
}

/** First Wednesday on or after today that has service in calendar_dates.txt. */
async function pickReferenceDate(): Promise<string> {
  const withService = new Set<string>();
  for await (const r of readCsv(`${feedDir}/calendar_dates.txt`)) {
    if (r.exception_type === '1') withService.add(r.date);
  }
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  for (let i = 0; i < 120; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 3) continue;
    const ymd = d.toISOString().slice(0, 10).replaceAll('-', '');
    if (withService.has(ymd)) return ymd;
  }
  throw new Error('No Wednesday with service found in the feed');
}

async function main(): Promise<void> {
  if (args.includes('--download') || !existsSync(`${feedDir}/routes.txt`)) {
    console.log('Downloading feed…');
    await download();
  }
  const feedVersion = (await readCsv(`${feedDir}/feed_info.txt`).next()).value?.feed_version ?? 'unknown';
  const referenceDate = argValue('date') ?? (await pickReferenceDate());
  console.log(`Feed ${feedVersion}, reference weekday ${referenceDate}`);

  const routes = new Map<string, { number: string; callOrdered: boolean; tram: boolean }>();
  for await (const r of readCsv(`${feedDir}/routes.txt`)) {
    if (!r.route_id.startsWith(config.routeIdPrefix) || !r.agency_id.endsWith(config.agencyIdSuffix)) continue;
    if (r.route_type !== '700' && r.route_type !== '1501' && r.route_type !== '900') continue;
    if (!categoryOf(r.route_short_name, r.route_type === '900')) continue;
    routes.set(r.route_id, { number: r.route_short_name, callOrdered: r.route_type === '1501', tram: r.route_type === '900' });
  }

  const activeServices = new Set<string>();
  for await (const r of readCsv(`${feedDir}/calendar_dates.txt`)) {
    if (r.date === referenceDate && r.exception_type === '1') activeServices.add(r.service_id);
  }

  const trips = new Map<string, { route: string; direction: string; shape: string }>();
  for await (const r of readCsv(`${feedDir}/trips.txt`)) {
    if (routes.has(r.route_id) && activeServices.has(r.service_id)) {
      trips.set(r.trip_id, { route: r.route_id, direction: r.direction_id, shape: r.shape_id });
    }
  }
  console.log(`${routes.size} routes, ${trips.size} trips on the reference day`);

  const stopRows = new Map<string, { name: string; parent: string; at: [number, number] }>();
  const stopNames = new Map<string, string>();
  for await (const r of readCsv(`${feedDir}/stops.txt`)) {
    stopRows.set(r.stop_id, { name: r.stop_name, parent: r.parent_station, at: [Number(r.stop_lon), Number(r.stop_lat)] });
    stopNames.set(r.stop_id, r.stop_name);
  }
  const displayName = (id: string) => {
    const s = stopRows.get(id);
    return (s?.parent && stopNames.get(s.parent)) || s?.name || id;
  };

  // the parent station's position when there is one, so a station is a single marker
  const displayAt = (id: string): [number, number] => {
    const s = stopRows.get(id);
    return (s?.parent && stopRows.get(s.parent)?.at) || s?.at || [NaN, NaN];
  };

  const stopSeq = new Map<string, [number, string][]>();
  for await (const r of readCsv(`${feedDir}/stop_times.txt`)) {
    if (!trips.has(r.trip_id)) continue;
    let list = stopSeq.get(r.trip_id);
    if (!list) stopSeq.set(r.trip_id, (list = []));
    list.push([Number(r.stop_sequence), r.stop_id]);
  }

  const shapeIds = new Set([...trips.values()].map((t) => t.shape));
  const shapePts = new Map<string, [number, number, number][]>();
  for await (const r of readCsv(`${feedDir}/shapes.txt`)) {
    if (!shapeIds.has(r.shape_id)) continue;
    let list = shapePts.get(r.shape_id);
    if (!list) shapePts.set(r.shape_id, (list = []));
    list.push([Number(r.shape_pt_sequence), Number(r.shape_pt_lon), Number(r.shape_pt_lat)]);
  }
  const shapes = new Map<string, { coordinates: [number, number][]; lengthM: number }>();
  for (const [id, pts] of shapePts) {
    const full = pts.sort((a, b) => a[0] - b[0]).map(([, lon, lat]) => [lon, lat] as [number, number]);
    shapes.set(id, { coordinates: full, lengthM: pathLengthM(full) });
  }

  // Patterns per line number, from the reference-day trips.
  const patternsByNumber = new Map<string, Map<string, Pattern>>();
  for (const [tripId, t] of trips) {
    const ordered = (stopSeq.get(tripId) ?? []).sort((a, b) => a[0] - b[0]).map(([, id]) => id);
    const seq = ordered.map(displayName);
    const shape = shapes.get(t.shape);
    if (!seq.length || !shape) continue;
    const info = routes.get(t.route)!;
    const key = `${t.direction}|${t.shape}|${info.callOrdered}`;
    let byKey = patternsByNumber.get(info.number);
    if (!byKey) patternsByNumber.set(info.number, (byKey = new Map()));
    const existing = byKey.get(key);
    if (existing) existing.trips++;
    else {
      const keep = seq.map((n, i) => n !== seq[i - 1]);
      const via = seq.filter((_, i) => keep[i]);
      const viaAt = ordered.filter((_, i) => keep[i]).map(displayAt);
      byKey.set(key, {
        direction: t.direction,
        shapeId: t.shape,
        from: seq[0],
        to: seq[seq.length - 1],
        start: shape.coordinates[0],
        end: shape.coordinates[shape.coordinates.length - 1],
        trips: 1,
        lengthM: shape.lengthM,
        callOrdered: info.callOrdered,
        via,
        viaAt,
      });
    }
  }

  const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
  const lines: Line[] = [];
  const missing: string[] = [];
  const allNumbers = [...new Set([...routes.values()].map((r) => r.number))];
  for (const number of allNumbers.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const isTram = [...routes.values()].some((r) => r.number === number && r.tram);
    const patterns = [...(patternsByNumber.get(number)?.values() ?? [])];
    const planned = planRoutes(patterns, config.splitDirections.lengthDifference);
    if (!planned.length) {
      missing.push(number);
      continue;
    }
    for (const p of planned) {
      const shape = shapes.get(p.pattern.shapeId)!;
      const coordinates: [number, number][] = [];
      for (const [lon, lat] of shape.coordinates) {
        const c: [number, number] = [round5(lon), round5(lat)];
        const prev = coordinates[coordinates.length - 1];
        if (!prev || prev[0] !== c[0] || prev[1] !== c[1]) coordinates.push(c);
      }
      lines.push({
        key: `${number}${p.suffix}`,
        number,
        label: p.suffix ? `${number} retur` : String(number),
        category: categoryOf(number, isTram)!,
        ...(isTram && config.categories.tram.colors[number] ? { color: config.categories.tram.colors[number] } : {}),
        tags: p.tags,
        from: p.pattern.from,
        to: p.pattern.to,
        lengthM: Math.round(shape.lengthM),
        via: p.pattern.via,
        ...(p.pattern.viaAt.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat)) ? { viaAt: p.pattern.viaAt.map(([lon, lat]) => [round5(lon), round5(lat)] as [number, number]) } : {}),
        coordinates,
      });
    }
  }

  const body = JSON.stringify(lines);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const generatedAt = new Date().toISOString();
  const dataset: Dataset = { schemaVersion: 1, feedVersion, referenceDate, generatedAt, lines };
  const manifest: Manifest = {
    schemaVersion: 1,
    feedVersion,
    referenceDate,
    generatedAt,
    lineCount: lines.length,
    file: 'lines.json',
    hash,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/lines.json`, JSON.stringify(dataset));
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

  const counts = [...new Set(lines.map((l) => l.category))].map((c) => `${c} ${lines.filter((l) => l.category === c).length}`);
  console.log(`Wrote ${lines.length} routes (${counts.join(', ')}), hash ${hash}`);
  if (missing.length) console.warn(`WARNING: no weekday service or shape for lines: ${missing.join(', ')}`);
  for (const l of lines.filter((l) => l.tags.length)) console.log(`  ${l.label.padEnd(8)} ${(l.lengthM / 1000).toFixed(1).padStart(5)} km  [${l.tags.join(', ')}]  ${l.from} → ${l.to}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
