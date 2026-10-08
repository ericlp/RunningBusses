import { describe, expect, it } from 'vitest';
import aliases from '../../config/route-aliases.json';
import { parsePublicLines, selectRoute, type PublicLine, type RouteConfig } from './routes';

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

  it('requires classification, with an explicit exception for described replacement buses', () => {
    const r = row('9011014112000000', '20');
    expect(() => select(r, [])).toThrow(/Unclassified bus route/);
    expect(select({ ...r, route_long_name: '20 Ersätter Västtåg' }, [])).toBeDefined();
    expect(select({ ...r, agency_id: 'other' })).toBeUndefined();
    expect(select(row(r.route_id, '20', '100'))).toBeUndefined();
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
