import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../../config/lines.json';
import type { Dataset } from '../../src/domain/types';
import { buildTransitData } from '../build-transit-data';
import { validateSplitAssets } from './validate-split';

let directory: string;
const city = { id: '9011014505900000', number: '59', type: '700' };
const regional = { id: '9011014405900000', number: '59', type: '700' };
const ferry = { id: '9011014528600000', number: '286', type: '1000' };

function csv(file: string, header: string[], rows: string[][]) {
  writeFileSync(`${directory}/.cache/vt/${file}.txt`, [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n') + '\n');
}

function fixture(routes = [city], { shapes = true, timed = true } = {}) {
  writeFileSync(`${directory}/config/lines.json`, JSON.stringify(config));
  writeFileSync(`${directory}/config/route-aliases.json`, '{}');
  writeFileSync(`${directory}/.cache/vt/line-info.json`, JSON.stringify(routes.map((route) => ({
    gid: route.id, versions: [{ shortName: route.number, directionName: 'A - B', isPublicTransport: true }],
  }))));
  csv('feed_info', ['feed_version'], [['fixture']]);
  csv('calendar_dates', ['service_id', 'date', 'exception_type'], [
    ['wed', '20261007', '1'], ['weekend', '20261010', '1'], ['weekend', '20261011', '1'],
  ]);
  csv('routes', ['route_id', 'route_short_name', 'route_type', 'agency_id', 'route_long_name', 'route_desc'],
    routes.map((route) => [route.id, route.number, route.type, '141010000000001418', '', '']));
  csv('trips', ['route_id', 'trip_id', 'direction_id', 'shape_id', 'service_id'],
    routes.flatMap((route) => ['wed', 'weekend'].map((service) => [route.id, `${route.id}.${service}`, '0', service, service])));
  csv('stops', ['stop_id', 'stop_name', 'stop_lon', 'stop_lat', 'parent_station'], [
    ['wa', 'Wednesday A', '11', '57', ''], ['wb', 'Wednesday B', '11.01', '57.01', ''],
    ['sa', 'Weekend A', '12', '58', ''], ['sb', 'Weekend B', '12.01', '58.01', ''],
  ]);
  csv('stop_times', ['trip_id', 'stop_sequence', 'stop_id', 'arrival_time', 'departure_time'],
    routes.flatMap((route) => ['wed', 'weekend'].flatMap((service) => [0, 1].map((index) => [
      `${route.id}.${service}`, String(index + 1), `${service === 'wed' ? 'w' : 's'}${index ? 'b' : 'a'}`,
      timed ? `08:0${index}:00` : '', '',
    ]))));
  csv('shapes', ['shape_id', 'shape_pt_sequence', 'shape_pt_lon', 'shape_pt_lat'], shapes ? [
    ['wed', '2', '11.01', '57.01'], ['wed', '1', '11', '57'],
    ['weekend', '2', '12.01', '58.01'], ['weekend', '1', '12', '58'],
  ] : []);
}

function outputSnapshot(path = `${directory}/public/data`, prefix = ''): Record<string, string> {
  return Object.fromEntries(readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? Object.entries(outputSnapshot(`${path}/${entry.name}`, `${prefix}${entry.name}/`))
      : [[`${prefix}${entry.name}`, readFileSync(`${path}/${entry.name}`, 'utf8')]]));
}

beforeEach(() => {
  mkdirSync('.cache', { recursive: true });
  directory = mkdtempSync('.cache/build-test-');
  for (const path of ['config', '.cache/vt', 'public/data/categories']) mkdirSync(`${directory}/${path}`, { recursive: true });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('Fixture must never download'); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe('GTFS builder publication and service selection', () => {
  it('never publishes temporary replacement buses while retaining unrelated lines with the same number', async () => {
    const replacement = { id: '9011014115900000', number: '59', type: '700' };
    fixture([city, replacement]);
    csv('routes', ['route_id', 'route_short_name', 'route_type', 'agency_id', 'route_long_name', 'route_desc'], [
      [city.id, '59', '700', '141010000000001418', '', ''],
      [replacement.id, '59', '700', '141010000000001418', '59 Ersätter Västtåg', ''],
    ]);
    await buildTransitData(`${directory}/`, ['--date=20261007']);
    const dataset: Dataset = JSON.parse(readFileSync(`${directory}/public/data/lines.json`, 'utf8'));
    expect(dataset.lines.map((line) => line.key)).toEqual(['59']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`Excluded temporary replacement bus ${replacement.id}`));
    await validateSplitAssets(dataset, `${directory}/public/data`);
    const catalog = JSON.parse(readFileSync(`${directory}/public/data/catalog-manifest.json`, 'utf8'));
    expect(catalog.categories['other-bus'].count).toBe(0);
  });

  it('publishes both audited Borås buses with future-only service and preserves existing route keys', async () => {
    const boras = [
      { id: '9011014200900000', number: '9', type: '700' },
      { id: '9011014201000000', number: '10', type: '700' },
    ];
    fixture([city, ...boras]);
    writeFileSync(`${directory}/.cache/vt/line-info.json`, JSON.stringify([
      { gid: city.id, versions: [{ shortName: '59', directionName: 'A - B', isPublicTransport: true }] },
    ]));
    csv('calendar_dates', ['service_id', 'date', 'exception_type'], [
      ['wed', '20261104', '1'], ['future', '20270401', '1'], ['future', '20270403', '1'],
    ]);
    csv('trips', ['route_id', 'trip_id', 'direction_id', 'shape_id', 'service_id'], [
      [city.id, `${city.id}.wed`, '0', 'wed', 'wed'],
      ...boras.map((route) => [route.id, `${route.id}.wed`, '0', 'wed', 'future']),
    ]);
    await buildTransitData(`${directory}/`, ['--date=20261104']);
    const dataset: Dataset = JSON.parse(readFileSync(`${directory}/public/data/lines.json`, 'utf8'));
    expect(dataset.lines.map((route) => route.key)).toEqual(['vt.9011014200900000', 'vt.9011014201000000', '59']);
    for (const route of boras) {
      expect(dataset.lines.find((line) => line.key === `vt.${route.id}`)).toMatchObject({
        number: route.number, category: 'other-bus',
        coordinates: [[11, 57], [11.01, 57.01]],
      });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`Using audited public bus ${route.id}`));
    }
    await validateSplitAssets(dataset, `${directory}/public/data`);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('still fails all unclassified buses before changing published output', async () => {
    fixture();
    await buildTransitData(`${directory}/`, ['--date=20261007']);
    const before = outputSnapshot();
    fixture([city, regional]);
    writeFileSync(`${directory}/.cache/vt/line-info.json`, '[]');
    await expect(buildTransitData(`${directory}/`, ['--date=20261007']))
      .rejects.toThrow(/Unclassified routes.*\(2\)[\s\S]*9011014505900000[\s\S]*9011014405900000/);
    expect(outputSnapshot()).toEqual(before);
    const audit = JSON.parse(readFileSync(`${directory}/.cache/route-audit.json`, 'utf8'));
    expect(audit.feedVersion).toBe('fixture');
    expect(audit.routes).toHaveLength(2);
    for (const route of audit.routes) {
      expect(route).toMatchObject({
        tripTemplates: 2, activeTripTemplates: 2, headsigns: [],
        service: { firstDate: '20261007', lastDate: '20261011', dateCount: 3, dates: ['20261007', '20261010', '20261011'] },
      });
      expect(route.patterns).toEqual([
        expect.objectContaining({
          shapeId: 'weekend', tripTemplates: 1, serviceDayTrips: 2,
          stops: [{ id: 'sa', name: 'Weekend A' }, { id: 'sb', name: 'Weekend B' }],
          geometry: expect.objectContaining({ pointCount: 2, valid: true, lengthM: expect.any(Number), start: [12, 58], end: [12.01, 58.01] }),
        }),
        expect.objectContaining({
          shapeId: 'wed', tripTemplates: 1, serviceDayTrips: 1,
          stops: [{ id: 'wa', name: 'Wednesday A' }, { id: 'wb', name: 'Wednesday B' }],
        }),
      ]);
    }
  });

  it('writes classification evidence to the job summary and explicitly reports missing geometry', async () => {
    fixture([regional], { shapes: false });
    writeFileSync(`${directory}/.cache/vt/line-info.json`, '[]');
    const summaryPath = `${directory}/summary.md`;
    vi.stubEnv('GITHUB_STEP_SUMMARY', summaryPath);
    try {
      await expect(buildTransitData(`${directory}/`, ['--date=20261007']))
        .rejects.toThrow(/Full trip, stop, service and geometry audit/);
      const report = JSON.parse(readFileSync(`${directory}/.cache/route-audit.json`, 'utf8'));
      expect(report.routes[0].patterns.every((p: { geometry: unknown }) => p.geometry === null)).toBe(true);
      const summary = readFileSync(summaryPath, 'utf8');
      expect(summary).toContain('9011014405900000');
      expect(summary).toContain('Weekend A - Weekend B');
      expect(summary).toContain('20261007 - 20261011');
      expect(summary).toContain('transit-refresh-review');
      expect(summary).toContain('Nothing published');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('audits unclassified ferries too, without a replacement-bus exception', async () => {
    fixture([ferry]);
    writeFileSync(`${directory}/.cache/vt/line-info.json`, '[]');
    await expect(buildTransitData(`${directory}/`, ['--date=20261007']))
      .rejects.toThrow(/absent from the public line registry/);
    const audit = JSON.parse(readFileSync(`${directory}/.cache/route-audit.json`, 'utf8'));
    expect(audit.routes).toEqual([expect.objectContaining({
      route_id: ferry.id, route_type: '1000', activeTripTemplates: 2,
    })]);
  });

  it('fails a timed route without geometry before modifying any published output', async () => {
    fixture();
    await buildTransitData(`${directory}/`, ['--date=20261007']);
    const before = outputSnapshot();
    fixture([city], { shapes: false });
    await expect(buildTransitData(`${directory}/`, ['--date=20261007']))
      .rejects.toThrow(/59.*Dataset not written/);
    expect(outputSnapshot()).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('excludes untimetabled routes rather than reporting missing required geometry', async () => {
    fixture([city], { shapes: false, timed: false });
    await buildTransitData(`${directory}/`, ['--date=20261007']);
    const dataset: Dataset = JSON.parse(readFileSync(`${directory}/public/data/lines.json`, 'utf8'));
    expect(dataset.lines).toEqual([]);
    await validateSplitAssets(dataset, `${directory}/public/data`);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No fixed timetable/service'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prefers Wednesday city patterns but weights regional and ferry patterns across the full period', async () => {
    fixture([city, regional, ferry]);
    await buildTransitData(`${directory}/`, ['--date=20261007']);
    const dataset: Dataset = JSON.parse(readFileSync(`${directory}/public/data/lines.json`, 'utf8'));
    expect(dataset.lines).toHaveLength(3);
    const byKey = new Map(dataset.lines.map((line) => [line.key, line]));
    expect(byKey.get('59')).toMatchObject({
      category: 'stadsbuss', from: 'Wednesday A', to: 'Wednesday B',
      coordinates: [[11, 57], [11.01, 57.01]], viaAt: [[11, 57], [11.01, 57.01]],
    });
    for (const route of [regional, ferry]) {
      expect(byKey.get(`vt.${route.id}`)).toMatchObject({
        category: route === ferry ? 'ferry' : 'other-bus', from: 'Weekend A', to: 'Weekend B',
        coordinates: [[12, 58], [12.01, 58.01]], viaAt: [[12, 58], [12.01, 58.01]],
      });
    }
    await validateSplitAssets(dataset, `${directory}/public/data`);
    expect(fetch).not.toHaveBeenCalled();
  });
});
