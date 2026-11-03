import { describe, expect, it } from 'vitest';
import aliases from '../../config/route-aliases.json';
import publishedConfig from '../../config/lines.json';
import { parsePublicLines, selectRoute, unclassifiedRoute, type PublicLine, type RouteConfig } from './routes';

const config: RouteConfig = {
  routeIdPrefix: '90110145', agencyIdSuffix: '1418',
  categories: {
    stadsbuss: { numberRange: [22, 99], exclude: [25] },
    stombuss: { numbers: [17, 18, 19, 21, 25] },
    express: { pattern: '^X\\d+$' },
    industri: { numberRange: [114, 258] },
    tram: { numberRange: [1, 13], colors: {} },
  },
};

const row = (id: string, number = '59', type = '700') => ({
  route_id: id, route_short_name: number, route_type: type, agency_id: '141010000000001418', route_long_name: '', route_desc: '',
});
const line = (gid: string, shortName = '59', directionName = 'A - B', isPublicTransport = true): PublicLine =>
  ({ gid, versions: [{ shortName, directionName, isPublicTransport }] });
const select = (r: Record<string, string>, metadata = [line(r.route_id, r.route_short_name)]) =>
  selectRoute(r, config, new Map(metadata.map((l) => [l.gid, l])), aliases);

describe('regional route identity and eligibility', () => {
  it('keeps Gothenburg keys and scopes its category rules', () => {
    expect(select(row('9011014505900000'))).toMatchObject({ key: '59', category: 'stadsbuss' });
    expect(select(row('9011014405900000'))).toMatchObject({ key: 'vt.9011014405900000', category: 'other-bus' });
    expect(select(row('9011014540100000', '1E'))).toMatchObject({ key: 'vt.9011014540100000', category: 'other-bus' });
  });

  it('does not merge duplicate numbers or buses with trams', () => {
    const bus = select(row('9011014200100000', '1'));
    const second = select(row('9011014301100000', '1'));
    const tram = select(row('9011014500100000', '1', '900'));
    expect(new Set([bus?.key, second?.key, tram?.key]).size).toBe(3);
    expect(tram).toMatchObject({ key: '1', category: 'tram' });
    expect(select(row('9011014601400000', '14', '900'))).toBeUndefined();
  });
  it.each(['1000', '4', '1200'])('classifies ferry type %s independently of bus number rules', (type) => {
    expect(select(row('9011014528600000', '286', type))).toMatchObject({
      key: 'vt.9011014528600000', category: 'ferry', callOrdered: false, tram: false,
    });
    expect(select(row('9011014505900000', '59', type))).toMatchObject({ key: 'vt.9011014505900000', category: 'ferry' });
    expect(select(row('9011014484700000', '847', type))).toMatchObject({ key: 'vt.9011014484700000', category: 'ferry' });
  });
  it('requires public registry classification for ferries and excludes other agencies', () => {
    const r = row('9011014528600000', '286', '1000');
    expect(() => select(r, [])).toThrow(/Unclassified ferry route/);
    expect(() => select({ ...r, route_desc: 'Ersätter färja' }, [])).toThrow(/Unclassified ferry route/);
    expect(select(r, [line(r.route_id, '286', 'A - B', false)])).toBeUndefined();
    expect(select({ ...r, agency_id: 'other' })).toBeUndefined();
  });

  it('uses fixed, verified normal/call-ordered aliases even without the ordinary route in the feed', () => {
    const ordinary = line('9011014230200000', '302');
    const ordered = line('9011014280200000', '302');
    expect(select(row(ordered.gid, '302', '1501'), [ordered, ordinary])).toMatchObject({
      key: 'vt.9011014230200000', callOrdered: true,
    });
    expect(select(row(ordinary.gid, '302'), [ordinary])).toMatchObject({ key: 'vt.9011014230200000' });
    expect(() => select(row(ordered.gid, '302', '1501'), [ordered, line(ordinary.gid, '302', 'Other route')])).toThrow(/no longer matches/);
    expect(() => select(row(ordered.gid, '302', '1501'), [ordered])).toThrow(/no official target/);
  });

  it('preserves legacy call-ordered aliases', () => {
    const ordinary = line('9011014503300000', '33');
    const ordered = line('9011014582300000', '33');
    expect(select(row(ordered.gid, '33', '1501'), [ordinary, ordered])).toMatchObject({ key: '33' });
  });

  it('keeps unverified call-ordered identities separate', () => {
    expect(select(row('9011014612700000', '527', '1501'))).toMatchObject({ key: 'vt.9011014612700000' });
  });

  it('excludes restricted services, but keeps public school-day and ordinary school-stop routes', () => {
    const r = row('9011014684200000', '942');
    expect(select(r, [line(r.route_id, '942', 'Public school-day route')])).toBeDefined();
    expect(select(r, [line(r.route_id, '942', 'A - B skola')])).toBeDefined();
    expect(select(r, [line(r.route_id, '942', 'Stängd skoltrafik Alingsås')])).toBeUndefined();
    expect(select(r, [line(r.route_id, '942', 'A - B', false)])).toBeUndefined();
  });

  it('requires classification and excludes described replacement buses even if registered as public', () => {
    const r = row('9011014112000000', '20');
    expect(() => select(r, [])).toThrow(/Unclassified bus route/);
    for (const description of ['20 Ersätter Västtåg', 'Ersätter spårvagn', 'Ersättningsbuss', 'Rail replacement bus']) {
      for (const field of ['route_long_name', 'route_desc']) {
        const replacement = { ...r, [field]: description };
        expect(select(replacement, [])).toBeUndefined();
        expect(select(replacement)).toBeUndefined();
        expect(unclassifiedRoute(replacement, config, new Map())).toBeUndefined();
      }
    }
    expect(select(r, [line(r.route_id, '20', 'Ersätter Västtåg')])).toBeUndefined();
    expect(select(row(r.route_id, '20', '714'))).toBeUndefined();
    expect(select({ ...row(r.route_id, '20', '1501'), route_desc: 'Ersätter spårvagn' })).toBeUndefined();
    expect(select({ ...r, agency_id: 'other' })).toBeUndefined();
    expect(select(row(r.route_id, '20', '100'))).toBeUndefined();
  });

  it.each([
    ['9011014200900000', '9'],
    ['9011014201000000', '10'],
  ])('includes audited public Borås bus %s without inventing a registry entry or merging its key', (id, number) => {
    const r = row(id, number);
    const auditedConfig: RouteConfig = { ...config, auditedPublicBuses: publishedConfig.auditedPublicBuses };
    const registry = new Map<string, PublicLine>();
    expect(selectRoute(r, auditedConfig, registry, aliases)).toMatchObject({
      key: `vt.${id}`, number, category: 'other-bus', callOrdered: false,
    });
    expect(unclassifiedRoute(r, auditedConfig, registry)).toBeUndefined();
    expect(registry.size).toBe(0);
    expect(() => selectRoute(row('9011014400900000', number), auditedConfig, registry, aliases))
      .toThrow(/Unclassified bus route/);
    for (const changed of [
      { ...r, route_short_name: '99' },
      { ...r, route_type: '1501' },
      { ...r, agency_id: 'other1418' },
    ]) expect(() => selectRoute(changed, auditedConfig, registry, aliases)).toThrow(/no longer matches/);
    expect(() => selectRoute({ ...r, route_type: '1000' }, auditedConfig, registry, aliases))
      .toThrow(/Unclassified ferry route/);
  });

  it('always gives official registry restrictions precedence over audited public buses', () => {
    const r = row('9011014200900000', '9');
    const auditedConfig: RouteConfig = { ...config, auditedPublicBuses: publishedConfig.auditedPublicBuses };
    for (const restricted of [
      line(r.route_id, '9', 'A - B', false),
      line(r.route_id, '9', 'Stängd skoltrafik'),
    ]) {
      expect(selectRoute(r, auditedConfig, new Map([[r.route_id, restricted]]), aliases)).toBeUndefined();
    }
    const mixed = line(r.route_id, '9');
    mixed.versions.push(line(r.route_id, '9', 'Stängd skoltrafik').versions[0]);
    expect(() => selectRoute(r, auditedConfig, new Map([[r.route_id, mixed]]), aliases))
      .toThrow(/Mixed public\/restricted/);
    expect(selectRoute(r, auditedConfig, new Map([[r.route_id, line(r.route_id, '9')]]), aliases))
      .toMatchObject({ key: `vt.${r.route_id}` });
  });

  it('cannot use an audited public approval to include a replacement bus', () => {
    const r = { ...row('9011014200900000', '9'), route_desc: 'Ersätter spårvagn' };
    const auditedConfig: RouteConfig = { ...config, auditedPublicBuses: publishedConfig.auditedPublicBuses };
    expect(selectRoute(r, auditedConfig, new Map(), aliases)).toBeUndefined();
  });

  it('reports all identity fields for ordinary bus routes missing from the public registry', () => {
    const r = { ...row('9011014112000000', '20'), route_long_name: 'Line 20', route_desc: 'A - B' };
    expect(unclassifiedRoute(r, config, new Map())).toEqual({
      route_id: r.route_id,
      route_short_name: '20',
      route_type: '700',
      agency_id: r.agency_id,
      route_long_name: 'Line 20',
      route_desc: 'A - B',
    });
    expect(unclassifiedRoute(r, config, new Map([[r.route_id, line(r.route_id)]]))).toBeUndefined();
    expect(unclassifiedRoute({ ...r, route_long_name: 'Ersätter Västtåg' }, config, new Map())).toBeUndefined();
    expect(unclassifiedRoute({ ...r, agency_id: 'other' }, config, new Map())).toBeUndefined();
    expect(unclassifiedRoute({ ...r, route_type: '900' }, config, new Map())).toBeUndefined();
  });

  it('blocks mixed public/restricted versions rather than including restricted service dates', () => {
    const r = row('9011014684200000', '942');
    const metadata = line(r.route_id, '942');
    metadata.versions.push(line(r.route_id, '942', 'Stängd skoltrafik').versions[0]);
    expect(() => select(r, [metadata])).toThrow(/Mixed public\/restricted.*audit/);
  });

  it('validates downloaded registry data instead of silently treating it as public', () => {
    expect(() => parsePublicLines({})).toThrow(/Invalid/);
    expect(() => parsePublicLines([{ gid: 'x', versions: [{}] }])).toThrow(/Invalid/);
    expect(parsePublicLines([line('x')]).get('x')).toEqual(line('x'));
  });
});
