import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { pathLengthM } from '../src/domain/geo';
import type { Dataset, Line, Manifest } from '../src/domain/types';
import { readCsv, readCsvRows } from './transit/csv';
import { type CategoryConfig } from './transit/category';
import { assertRoutableLines, planRoutes, type Pattern } from './transit/select';
import { referenceWednesday, serviceDays, tripWeight } from './transit/calendar';
import { parsePublicLines, selectRoute, type SelectedRoute } from './transit/routes';
import { writeSplitAssets } from './transit/split';

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
const aliases: Record<string, string> = JSON.parse(readFileSync(`${root}config/route-aliases.json`, 'utf8'));
const args = process.argv.slice(2);
const argValue = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

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

async function main(): Promise<void> {
  const downloadFeed = args.includes('--download') || !existsSync(`${feedDir}/routes.txt`);
  if (downloadFeed) {
    console.log('Downloading feed…');
    await download();
  }
  const registryPath = `${feedDir}/line-info.json`;
  if (downloadFeed || !existsSync(registryPath)) {
    const res = await fetch('https://www.vasttrafik.se/api/timetables/lines');
    if (!res.ok) throw new Error(`Public line registry download failed: HTTP ${res.status}`);
    const body: unknown = await res.json();
    parsePublicLines(body);
    writeFileSync(registryPath, JSON.stringify(body));
  }
  if (existsSync(`${feedDir}/frequencies.txt`) && (await readCsvRows(`${feedDir}/frequencies.txt`)).length) {
    throw new Error('Frequency-based services need a fixed-timetable classification audit before publication');
  }
  const registry = parsePublicLines(JSON.parse(readFileSync(registryPath, 'utf8')));
  const feedVersion = (await readCsv(`${feedDir}/feed_info.txt`).next()).value?.feed_version ?? 'unknown';
  const days = serviceDays(
    existsSync(`${feedDir}/calendar.txt`) ? await readCsvRows(`${feedDir}/calendar.txt`) : [],
    existsSync(`${feedDir}/calendar_dates.txt`) ? await readCsvRows(`${feedDir}/calendar_dates.txt`) : [],
  );
  const referenceDate = argValue('date') ?? referenceWednesday(days);
  if (![...days.values()].some((d) => d.has(referenceDate))) throw new Error(`No service on reference date ${referenceDate}`);
  console.log(`Feed ${feedVersion}, reference weekday ${referenceDate}`);

  const routes = new Map<string, SelectedRoute>();
  for await (const r of readCsv(`${feedDir}/routes.txt`)) {
    const route = selectRoute(r, config, registry, aliases);
    if (route) routes.set(r.route_id, route);
  }

  const trips = new Map<string, { route: string; direction: string; shape: string; service: string }>();
  const referenceGroups = new Set<string>();
  for await (const r of readCsv(`${feedDir}/trips.txt`)) {
    const info = routes.get(r.route_id);
    const active = days.get(r.service_id);
    if (info && active?.size) {
      trips.set(r.trip_id, { route: r.route_id, direction: r.direction_id, shape: r.shape_id, service: r.service_id });
      if (info.category !== 'other-bus' && active.has(referenceDate)) referenceGroups.add(info.key);
    }
  }
  for (const [id, trip] of trips) {
    if (!tripWeight(days.get(trip.service)!, referenceDate, referenceGroups.has(routes.get(trip.route)!.key))) trips.delete(id);
  }
  console.log(`${routes.size} eligible routes, ${trips.size} representative trip templates across the feed`);

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
  const timedStops = new Map<string, number>();
  for await (const r of readCsv(`${feedDir}/stop_times.txt`)) {
    if (!trips.has(r.trip_id)) continue;
    let list = stopSeq.get(r.trip_id);
    if (!list) stopSeq.set(r.trip_id, (list = []));
    list.push([Number(r.stop_sequence), r.stop_id]);
    if (r.arrival_time || r.departure_time) timedStops.set(r.trip_id, (timedStops.get(r.trip_id) ?? 0) + 1);
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

  const patternsByLine = new Map<string, Map<string, Pattern>>();
  const activeGroups = new Set<string>();
  for (const [tripId, t] of trips) {
    const ordered = (stopSeq.get(tripId) ?? []).sort((a, b) => a[0] - b[0]).map(([, id]) => id);
    const seq = ordered.map(displayName);
    const shape = shapes.get(t.shape);
    const info = routes.get(t.route)!;
    if ((timedStops.get(tripId) ?? 0) < 2) continue;
    activeGroups.add(info.key);
    if (seq.length < 2 || !shape || shape.coordinates.length < 2) continue;
    const key = `${t.direction}|${t.shape}|${info.callOrdered}`;
    let byKey = patternsByLine.get(info.key);
    if (!byKey) patternsByLine.set(info.key, (byKey = new Map()));
    const weight = tripWeight(days.get(t.service)!, referenceDate, referenceGroups.has(info.key));
    const existing = byKey.get(key);
    if (existing) existing.trips += weight;
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
        trips: weight,
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
  const groups = new Map([...routes.values()].map((r) => [r.key, r]));
  const sortedGroups = [...groups.values()].sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }) || a.key.localeCompare(b.key));
  const unscheduled = sortedGroups.filter((g) => !activeGroups.has(g.key));
  if (unscheduled.length) console.log(`No fixed timetable/service in the feed: ${unscheduled.map((g) => `${g.number} (${g.key})`).join(', ')}`);
  for (const info of sortedGroups) {
    if (!activeGroups.has(info.key)) continue;
    const { number, tram: isTram } = info;
    const patterns = [...(patternsByLine.get(info.key)?.values() ?? [])];
    if (!referenceGroups.has(info.key)) patterns.sort((a, b) => a.shapeId.localeCompare(b.shapeId) || a.direction.localeCompare(b.direction));
    const planned = planRoutes(patterns, config.splitDirections.lengthDifference);
    if (!planned.length) {
      missing.push(`${number} (${info.key})`);
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
        key: `${info.key}${p.suffix}`,
        number,
        label: p.suffix ? `${number} retur` : String(number),
        category: info.category,
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
  assertRoutableLines(missing);

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
  await writeSplitAssets(dataset, outDir);

  const counts = [...new Set(lines.map((l) => l.category))].map((c) => `${c} ${lines.filter((l) => l.category === c).length}`);
  console.log(`Wrote ${lines.length} routes (${counts.join(', ')}), hash ${hash}`);
  for (const l of lines.filter((l) => l.tags.length)) console.log(`  ${l.label.padEnd(8)} ${(l.lengthM / 1000).toFixed(1).padStart(5)} km  [${l.tags.join(', ')}]  ${l.from} → ${l.to}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
