import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup, type Backup } from './backup';
import type { Course, Leg } from './course';
import type { Line } from './types';

export const SHARE_VERSION = 1;
export const SHARE_PARAM = 'sync';
/** Longer links often break in chat apps and email. */
export const SHARE_WARN_CHARS = 8000;
const MAX_PAYLOAD_CHARS = 500_000;
const MAX_DECODED_BYTES = 2 * 1024 * 1024;

export type ShareError = 'badLink' | 'newerVersion' | 'unsupported' | 'invalid' | 'empty';

export interface Shared {
  backup: Backup;
  /** Names of courses left out because a route is missing from this device's data. */
  skipped: string[];
  /** Feed version of the sender's data. */
  feedVersion: string;
  /** True for a link made from some courses only. */
  partial: boolean;
}

export type ShareResult = { ok: true; shared: Shared } | { ok: false; error: ShareError };

type CompactLeg = ['l', string, 0 | 1] | ['m', string, string, number | null];
type CompactCourse = [string, string, 0 | 1, string, string, string | null, CompactLeg[], string[]?];
interface Compact {
  v: number;
  f: string;
  c: CompactCourse[];
  /** 1 when the link carries a selection of courses rather than everything, so it must not replace local data. */
  p?: 1;
}

const hasCompression = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function toCompact(course: Course): CompactCourse {
  const legs = course.legs.map((l): CompactLeg => (l.kind === 'line' ? ['l', l.line.key, l.reversed ? 1 : 0] : ['m', l.id, l.label, l.lengthM]));
  const base: [string, string, 0 | 1, string, string, string | null, CompactLeg[]] = [course.id, course.name, course.status === 'Completed' ? 1 : 0, course.createdAt, course.updatedAt, course.completedAt, legs];
  return course.participants?.length ? [...base, course.participants] : base;
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
}

async function run(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, maxBytes = Infinity): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      void reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The courses only: line legs are reduced to a route key and direction, so the link stays short. */
export async function encodeShare(courses: Course[], feedVersion: string, partial = false): Promise<string> {
  const json: Compact = { v: SHARE_VERSION, f: feedVersion, c: courses.map(toCompact), ...(partial ? { p: 1 as const } : {}) };
  const raw = new TextEncoder().encode(JSON.stringify(json));
  if (!hasCompression()) return 'p' + toBase64Url(raw);
  return 'z' + toBase64Url(await run(raw, new CompressionStream('deflate-raw')));
}

const isStr = (v: unknown): v is string => typeof v === 'string';

function rebuildLegs(legs: unknown, byKey: Map<string, Line>): Leg[] | 'missing' | 'invalid' {
  if (!Array.isArray(legs)) return 'invalid';
  const out: Leg[] = [];
  for (const l of legs) {
    if (!Array.isArray(l)) return 'invalid';
    if (l[0] === 'l') {
      if (!isStr(l[1]) || (l[2] !== 0 && l[2] !== 1)) return 'invalid';
      const line = byKey.get(l[1]);
      if (!line) return 'missing';
      out.push({ kind: 'line', line, reversed: l[2] === 1 });
    } else if (l[0] === 'm') {
      if (!isStr(l[1]) || !isStr(l[2]) || (l[3] !== null && typeof l[3] !== 'number')) return 'invalid';
      out.push({ kind: 'manual', id: l[1], label: l[2], lengthM: l[3] });
    } else return 'invalid';
  }
  return out;
}

/** Turns a link payload back into courses using this device's route data. Courses with unknown routes are skipped. */
export async function decodeShare(payload: string, lines: Line[], now = new Date()): Promise<ShareResult> {
  if (!payload || payload.length > MAX_PAYLOAD_CHARS || !/^[pz][A-Za-z0-9_-]+$/.test(payload)) return { ok: false, error: 'badLink' };
  let data: unknown;
  try {
    const bytes = fromBase64Url(payload.slice(1));
    let raw = bytes;
    if (payload[0] === 'z') {
      if (!hasCompression()) return { ok: false, error: 'unsupported' };
      raw = await run(bytes, new DecompressionStream('deflate-raw'), MAX_DECODED_BYTES);
    } else if (bytes.length > MAX_DECODED_BYTES) return { ok: false, error: 'badLink' };
    data = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return { ok: false, error: 'badLink' };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'badLink' };
  const d = data as Partial<Compact>;
  if (typeof d.v !== 'number' || d.v < 1 || !Array.isArray(d.c) || !isStr(d.f)) return { ok: false, error: 'badLink' };
  if (d.v > SHARE_VERSION) return { ok: false, error: 'newerVersion' };

  const byKey = new Map(lines.map((l) => [l.key, l]));
  const courses: Course[] = [];
  const skipped: string[] = [];
  for (const c of d.c) {
    if (!Array.isArray(c) || !isStr(c[0]) || !isStr(c[1]) || !isStr(c[3]) || !isStr(c[4]) || !(c[5] === null || isStr(c[5]))) return { ok: false, error: 'invalid' };
    const legs = rebuildLegs(c[6], byKey);
    if (legs === 'invalid') return { ok: false, error: 'invalid' };
    if (legs === 'missing') {
      skipped.push(c[1]);
      continue;
    }
    if (c[7] !== undefined && !(Array.isArray(c[7]) && c[7].every(isStr))) return { ok: false, error: 'invalid' };
    courses.push({ id: c[0], name: c[1], status: c[2] === 1 ? 'Completed' : 'NotCompleted', createdAt: c[3], updatedAt: c[4], completedAt: c[5], legs, ...(c[7]?.length ? { participants: c[7] } : {}) });
  }
  if (!courses.length && !skipped.length) return { ok: false, error: 'empty' };
  const checked = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), radiusM: 500, courses }));
  if (!checked.ok) return { ok: false, error: 'invalid' };
  return { ok: true, shared: { backup: checked.backup, skipped, feedVersion: d.f, partial: d.p === 1 } };
}

export function shareUrl(payload: string, loc: Pick<Location, 'origin' | 'pathname'> = location): string {
  return `${loc.origin}${loc.pathname}#${SHARE_PARAM}=${payload}`;
}

/** The payload of a `#sync=` fragment, or null when the fragment is something else. */
export function payloadFromHash(hash: string): string | null {
  const m = /^#sync=(.*)$/.exec(hash);
  return m ? m[1] : null;
}
