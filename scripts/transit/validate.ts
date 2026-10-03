import { haversineM, pathLengthM } from '../../src/domain/geo';
import type { Dataset } from '../../src/domain/types';

export interface Report {
  errors: string[];
  warnings: string[];
}

export interface Options {
  minLines: number;
  /** Removing lines is an error unless explicitly allowed. */
  allowRemoval: boolean;
}

export const defaultOptions: Options = { minLines: 30, allowRemoval: false };

/** Checks a freshly built dataset on its own and against the one that is currently published. */
export function validateDataset(next: Dataset, previous: Dataset | null, opts: Options = defaultOptions): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (next.schemaVersion !== 1) errors.push(`Unsupported schemaVersion ${next.schemaVersion}`);
  if (next.lines.length < opts.minLines) errors.push(`Only ${next.lines.length} lines (expected at least ${opts.minLines})`);

  const seen = new Set<string>();
  for (const l of next.lines) {
    const id = `line ${l.label} (${l.key})`;
    if (seen.has(l.key)) errors.push(`${id}: duplicate key`);
    seen.add(l.key);
    if (!l.from || !l.to) errors.push(`${id}: missing end stop name`);
    if (l.coordinates.length < 2) {
      errors.push(`${id}: fewer than two coordinates`);
      continue;
    }
    if (l.coordinates.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)) {
      errors.push(`${id}: invalid coordinates`);
      continue;
    }
    if (l.lengthM < 300 || l.lengthM > 60000) errors.push(`${id}: implausible length ${l.lengthM} m`);
    const calc = pathLengthM(l.coordinates);
    if (Math.abs(calc - l.lengthM) > Math.max(50, l.lengthM * 0.02)) errors.push(`${id}: stored length ${l.lengthM} m does not match geometry (${Math.round(calc)} m)`);
  }

  if (previous) {
    const before = new Map(previous.lines.map((l) => [l.key, l]));
    const after = new Map(next.lines.map((l) => [l.key, l]));
    const removed = [...before.keys()].filter((k) => !after.has(k));
    if (removed.length) (opts.allowRemoval ? warnings : errors).push(`Lines removed: ${removed.join(', ')}${opts.allowRemoval ? '' : ' (set ALLOW_REMOVAL=1 to accept)'}`);
    const added = [...after.keys()].filter((k) => !before.has(k));
    if (added.length) warnings.push(`Lines added: ${added.join(', ')}`);
    for (const [k, n] of after) {
      const o = before.get(k);
      if (!o) continue;
      const pct = Math.abs(n.lengthM - o.lengthM) / o.lengthM;
      if (pct > 0.2) warnings.push(`Line ${n.label}: length changed ${(o.lengthM / 1000).toFixed(1)} → ${(n.lengthM / 1000).toFixed(1)} km`);
      const start = (l: typeof n) => ({ lon: l.coordinates[0][0], lat: l.coordinates[0][1] });
      const end = (l: typeof n) => ({ lon: l.coordinates[l.coordinates.length - 1][0], lat: l.coordinates[l.coordinates.length - 1][1] });
      if (haversineM(start(n), start(o)) > 300 || haversineM(end(n), end(o)) > 300) warnings.push(`Line ${n.label}: an end point moved more than 300 m`);
    }
  }
  return { errors, warnings };
}

export function formatReport(r: Report, next: Dataset): string {
  const out = [`## Transit data check`, '', `Feed ${next.feedVersion}, ${next.lines.length} lines, reference date ${next.referenceDate}.`, ''];
  out.push(r.errors.length ? `**${r.errors.length} error(s) – data NOT published**` : '**OK – no errors**', '');
  for (const e of r.errors) out.push(`- ❌ ${e}`);
  for (const w of r.warnings) out.push(`- ⚠️ ${w}`);
  return out.join('\n') + '\n';
}
