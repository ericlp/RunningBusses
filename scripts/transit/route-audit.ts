import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { pathLengthM } from '../../src/domain/geo';
import type { ServiceDays } from './calendar';
import { readCsv } from './csv';
import type { UnclassifiedRoute } from './routes';

export async function auditUnclassifiedRoutes(
  feedDir: string, routes: UnclassifiedRoute[], days: ServiceDays,
) {
  const routeIds = new Set(routes.map((r) => r.route_id));
  const trips = new Map<string, Record<string, string>>();
  for await (const trip of readCsv(`${feedDir}/trips.txt`)) {
    if (routeIds.has(trip.route_id)) trips.set(trip.trip_id, trip);
  }
  const stops = new Map<string, Record<string, string>>();
  for await (const stop of readCsv(`${feedDir}/stops.txt`)) stops.set(stop.stop_id, stop);
  const stopTimes = new Map<string, Record<string, string>[]>();
  for await (const row of readCsv(`${feedDir}/stop_times.txt`)) {
    if (!trips.has(row.trip_id)) continue;
    const times = stopTimes.get(row.trip_id) ?? [];
    times.push(row);
    stopTimes.set(row.trip_id, times);
  }
  const shapeIds = new Set([...trips.values()].map((t) => t.shape_id).filter(Boolean));
  const shapes = new Map<string, [number, number, number][]>();
  if (existsSync(`${feedDir}/shapes.txt`)) {
    for await (const row of readCsv(`${feedDir}/shapes.txt`)) {
      if (!shapeIds.has(row.shape_id)) continue;
      const points = shapes.get(row.shape_id) ?? [];
      points.push([Number(row.shape_pt_sequence), Number(row.shape_pt_lon), Number(row.shape_pt_lat)]);
      shapes.set(row.shape_id, points);
    }
  }
  const geometry = new Map([...shapes].map(([id, points]) => {
    const coordinates: [number, number][] = points.sort((a, b) => a[0] - b[0])
      .map(([, lon, lat]) => [lon, lat]);
    const valid = coordinates.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) &&
      Math.abs(lon) <= 180 && Math.abs(lat) <= 90);
    return [id, {
      pointCount: coordinates.length,
      valid,
      lengthM: valid ? Math.round(pathLengthM(coordinates)) : null,
      start: coordinates[0],
      end: coordinates.at(-1),
    }];
  }));
  return routes.map((route) => {
    const templates = [...trips.values()].filter((t) => t.route_id === route.route_id);
    const dates = new Set<string>();
    const patterns = new Map<string, {
      direction: string; shapeId: string; stopIds: string[]; tripTemplates: number; serviceDayTrips: number;
    }>();
    let activeTripTemplates = 0;
    for (const trip of templates) {
      const active = days.get(trip.service_id) ?? new Set<string>();
      for (const date of active) dates.add(date);
      if (active.size) activeTripTemplates++;
      const stopIds = (stopTimes.get(trip.trip_id) ?? [])
        .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence)).map((s) => s.stop_id);
      const key = JSON.stringify([trip.direction_id, trip.shape_id, stopIds]);
      const pattern = patterns.get(key) ?? {
        direction: trip.direction_id, shapeId: trip.shape_id, stopIds, tripTemplates: 0, serviceDayTrips: 0,
      };
      pattern.tripTemplates++;
      pattern.serviceDayTrips += active.size;
      patterns.set(key, pattern);
    }
    const sortedDates = [...dates].sort();
    return {
      ...route,
      tripTemplates: templates.length,
      activeTripTemplates,
      headsigns: [...new Set(templates.map((t) => t.trip_headsign).filter(Boolean))].sort(),
      service: {
        firstDate: sortedDates[0] ?? null, lastDate: sortedDates.at(-1) ?? null, dateCount: dates.size,
        dates: sortedDates,
      },
      patterns: [...patterns.values()].sort((a, b) => b.serviceDayTrips - a.serviceDayTrips)
        .map(({ stopIds, ...pattern }) => ({
          ...pattern,
          stops: stopIds.map((id) => {
            const stop = stops.get(id);
            const parent = stop?.parent_station && stops.get(stop.parent_station);
            return { id, name: (parent && parent.stop_name) || stop?.stop_name || null };
          }),
          geometry: geometry.get(pattern.shapeId) ?? null,
        })),
    };
  });
}

export async function writeRouteAudit(
  feedDir: string, path: string, feedVersion: string, routes: UnclassifiedRoute[], days: ServiceDays,
) {
  const report = { feedVersion, routes: await auditUnclassifiedRoutes(feedDir, routes, days) };
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    const cell = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/[\r\n]/g, ' ');
    const rows = report.routes.map((r) => {
      const pattern = r.patterns[0];
      const endpoints = pattern?.stops.length
        ? `${pattern.stops[0].name ?? pattern.stops[0].id} - ${pattern.stops.at(-1)?.name ?? pattern.stops.at(-1)?.id}`
        : 'No stop pattern';
      return `| ${cell(r.route_id)} | ${cell(r.route_short_name)} | ${cell(endpoints)} | ${r.service.firstDate ?? 'none'} - ${r.service.lastDate ?? 'none'} | ${r.activeTripTemplates} |`;
    });
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '## Public route classification needs review', '',
      `Feed ${cell(feedVersion)}: ${routes.length} route(s) missing from the public line registry. Nothing published.`, '',
      '| Route ID | Number | Representative endpoints | Service dates | Active trip templates |',
      '| --- | --- | --- | --- | --- |', ...rows, '',
      'Download the **transit-refresh-review** artifact for the full audit, stop patterns, geometry and source feed files.',
      'Confirm eligibility using an official source before adding an exact `auditedPublicBuses` approval. Never infer public status from the number.', '',
    ].join('\n'));
  }
  return report;
}
