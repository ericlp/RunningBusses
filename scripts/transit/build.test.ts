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
