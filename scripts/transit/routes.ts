import type { Category } from '../../src/domain/types';
import { categoryOf, type CategoryConfig } from './category';

export interface RouteConfig {
  routeIdPrefix: string;
  agencyIdSuffix: string;
  categories: CategoryConfig;
  auditedPublicBuses?: Record<string, {
    number: string;
    routeType: string;
    agencyId: string;
    source: string;
  }>;
}

export interface PublicLine {
  gid: string;
  versions: { shortName: string; directionName: string; isPublicTransport: boolean }[];
}

export function parsePublicLines(value: unknown): Map<string, PublicLine> {
  if (!Array.isArray(value)) throw new Error('Invalid Västtrafik line registry: expected an array');
  const lines = new Map<string, PublicLine>();
  for (const row of value) {
    if (!row || typeof row.gid !== 'string' || !Array.isArray(row.versions) || !row.versions.length) {
      throw new Error('Invalid Västtrafik line registry: missing identity or versions');
    }
    for (const version of row.versions) {
      if (!version || typeof version.shortName !== 'string' || typeof version.directionName !== 'string' || typeof version.isPublicTransport !== 'boolean') {
        throw new Error(`Invalid Västtrafik line registry: ${row.gid}`);
      }
    }
    lines.set(row.gid, row);
  }
  return lines;
}

const restrictedSchool = (version: PublicLine['versions'][number]) =>
  /(?:stängd|sluten)\s+skoltrafik/i.test(version.directionName);

function publicVersions(line: PublicLine): PublicLine['versions'] {
  const versions = line.versions.filter((v) => v.isPublicTransport && !restrictedSchool(v));
  if (versions.length && versions.length !== line.versions.length) {
    throw new Error(`Mixed public/restricted registry versions for ${line.gid}: timetable classification requires an audit`);
  }
  return versions;
}

export interface SelectedRoute {
  key: string;
  number: string;
  category: Category;
  callOrdered: boolean;
  tram: boolean;
}

export interface UnclassifiedRoute {
  route_id: string;
  route_short_name: string;
  route_type: string;
  agency_id: string;
  route_long_name: string;
  route_desc: string;
}

export function isReplacementBus(row: Record<string, string>, registry: Map<string, PublicLine>): boolean {
  if (!['700', '1501', '714'].includes(row.route_type)) return false;
  const descriptions = [
    row.route_long_name, row.route_desc,
    ...(registry.get(row.route_id)?.versions.map((v) => v.directionName) ?? []),
  ].join(' ');
  return row.route_type === '714' ||
    /ersätter|ersättnings(?:buss|trafik)|(?:rail|tram|train)[ -]?replacement|replacement bus|tågbuss|spårvagnsbuss/i.test(descriptions);
}

export function auditedPublicBus(
  row: Record<string, string>, config: RouteConfig, registry: Map<string, PublicLine>,
) {
  if (registry.has(row.route_id)) return undefined;
  const audit = config.auditedPublicBuses?.[row.route_id];
  if (!audit) return undefined;
  if ((row.route_type !== '700' && row.route_type !== '1501') ||
      row.route_short_name !== audit.number || row.route_type !== audit.routeType ||
      row.agency_id !== audit.agencyId || !audit.source) {
    throw new Error(`Audited public bus ${row.route_id} no longer matches its verified identity; classification requires a new audit`);
  }
  return audit;
}

export function unclassifiedRoute(
  row: Record<string, string>, config: RouteConfig, registry: Map<string, PublicLine>,
): UnclassifiedRoute | undefined {
  const ferry = row.route_type === '1000' || row.route_type === '4' || row.route_type === '1200';
  if (!row.agency_id.endsWith(config.agencyIdSuffix) ||
      (!ferry && row.route_type !== '700' && row.route_type !== '1501') ||
      registry.has(row.route_id) ||
      (!ferry && (isReplacementBus(row, registry) ||
        auditedPublicBus(row, config, registry)))) return undefined;
  return {
    route_id: row.route_id,
    route_short_name: row.route_short_name,
    route_type: row.route_type,
    agency_id: row.agency_id,
    route_long_name: row.route_long_name,
    route_desc: row.route_desc,
  };
}

export function selectRoute(
  row: Record<string, string>, config: RouteConfig, registry: Map<string, PublicLine>, aliases: Record<string, string>,
): SelectedRoute | undefined {
  if (!row.agency_id.endsWith(config.agencyIdSuffix)) return undefined;
  if (isReplacementBus(row, registry)) return undefined;
  const tram = row.route_type === '900';
  const ferry = row.route_type === '1000' || row.route_type === '4' || row.route_type === '1200';
  if (!tram && !ferry && row.route_type !== '700' && row.route_type !== '1501') return undefined;
  const canonical = aliases[row.route_id] ?? row.route_id;
  const scoped = canonical.startsWith(config.routeIdPrefix);
  const oldCategory = scoped && !ferry ? categoryOf(row.route_short_name, config.categories, tram) : undefined;
  if (tram && !oldCategory) return undefined;
  if (!tram) {
    const line = registry.get(row.route_id);
    const versions = line && publicVersions(line);
    if (line) {
      if (!versions?.length) return undefined;
    } else if (ferry || !auditedPublicBus(row, config, registry)) {
      throw new Error(`Unclassified ${ferry ? 'ferry' : 'bus'} route ${row.route_id} (${row.route_short_name}): absent from the public line registry`);
    }
    const target = aliases[row.route_id] && registry.get(canonical);
    if (aliases[row.route_id] && !target) throw new Error(`Route alias ${row.route_id} → ${canonical} has no official target`);
    if (target && !publicVersions(target).some((a) => versions?.some((b) =>
      a.shortName === b.shortName && a.directionName === b.directionName,
    ))) {
      throw new Error(`Route alias ${row.route_id} → ${canonical} no longer matches the official line registry`);
    }
  }
  return {
    key: oldCategory ? row.route_short_name : `vt.${canonical}`,
    number: row.route_short_name,
    category: ferry ? 'ferry' : oldCategory ?? 'other-bus',
    callOrdered: row.route_type === '1501',
    tram,
  };
}
