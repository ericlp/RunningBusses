import { describe, expect, it } from 'vitest';
import type { Course } from './course';
import { decodeShare, encodeShare, payloadFromHash, shareUrl } from './share';
import type { Line } from './types';

const line = (key: string): Line => ({
  key,
  number: key,
  label: key,
  category: 'stadsbuss',
  tags: [],
  from: 'A',
  to: 'B',
  lengthM: 1000,
  via: [],
  coordinates: [[11.9, 57.7], [11.91, 57.71]],
});
const lines = ['59', '69', '70'].map(line);

const course = (id: string, keys: string[], extra: Partial<Course> = {}): Course => ({
  id,
  name: `Course ${id}`,
  status: 'NotCompleted',
  createdAt: 'a',
  updatedAt: 'b',
  completedAt: null,
  legs: keys.map((k) => ({ kind: 'line' as const, reversed: k === '69', line: lines.find((l) => l.key === k)! })),
  ...extra,
});

describe('share links', () => {
  it('round-trips courses, directions and manual legs', async () => {
    const c1 = course('1', ['59', '69']);
    c1.legs.push({ kind: 'manual', id: 'm1', label: 'Walk', lengthM: null });
    const c2 = course('2', ['70'], { status: 'Completed', completedAt: '2026-01-01' });
    const r = await decodeShare(await encodeShare([c1, c2], 'f1'), lines);
    expect(r.ok && r.shared.backup.courses).toEqual([c1, c2]);
    expect(r.ok && r.shared.feedVersion).toBe('f1');
  });

  it('keeps participants and the partial flag', async () => {
    const c = course('1', ['59'], { status: 'Completed', completedAt: '2026-01-01', participants: ['Anna', 'Bo'] });
    const r = await decodeShare(await encodeShare([c], 'f', true), lines);
    expect(r.ok && r.shared.backup.courses).toEqual([c]);
    expect(r.ok && r.shared.partial).toBe(true);
    const all = await decodeShare(await encodeShare([c], 'f'), lines);
    expect(all.ok && all.shared.partial).toBe(false);
  });

  it('is much smaller than the full backup', async () => {
    const cs = [course('1', ['59', '69', '70'])];
    expect((await encodeShare(cs, 'f')).length).toBeLessThan(JSON.stringify(cs).length / 4);
  });

  it('skips courses with routes this device does not know', async () => {
    const payload = await encodeShare([course('1', ['59']), course('2', ['70'])], 'f');
    const r = await decodeShare(payload, lines.filter((l) => l.key !== '70'));
    expect(r.ok && r.shared.backup.courses.map((c) => c.id)).toEqual(['1']);
    expect(r.ok && r.shared.skipped).toEqual(['Course 2']);
  });

  it('reports when every course is skipped, and when there are none', async () => {
    const r = await decodeShare(await encodeShare([course('1', ['59'])], 'f'), []);
    expect(r.ok && r.shared.backup.courses).toEqual([]);
    expect(r.ok && r.shared.skipped).toEqual(['Course 1']);
    expect(await decodeShare(await encodeShare([], 'f'), lines)).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects broken, hostile and newer payloads', async () => {
    expect(await decodeShare('', lines)).toMatchObject({ error: 'badLink' });
    expect(await decodeShare('zzzz', lines)).toMatchObject({ error: 'badLink' });
    expect(await decodeShare('x123', lines)).toMatchObject({ error: 'badLink' });
    expect(await decodeShare('p' + btoa('{"v":1,"f":"x","c":[["1",1]]}'), lines)).toMatchObject({ ok: false });
    const good = await encodeShare([course('1', ['59'])], 'f');
    expect(await decodeShare(good.slice(0, 12), lines)).toMatchObject({ error: 'badLink' });
    const newer = 'p' + btoa(JSON.stringify({ v: 99, f: 'x', c: [] })).replace(/=+$/, '');
    expect(await decodeShare(newer, lines)).toMatchObject({ error: 'newerVersion' });
  });

  it('rejects a line used by two courses', async () => {
    const r = await decodeShare(await encodeShare([course('1', ['59']), course('2', ['59'])], 'f'), lines);
    expect(r).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('builds and reads the link fragment', () => {
    const url = shareUrl('zabc', { origin: 'https://x.test', pathname: '/app/' });
    expect(url).toBe('https://x.test/app/#sync=zabc');
    expect(payloadFromHash('#sync=zabc')).toBe('zabc');
    expect(payloadFromHash('#other')).toBeNull();
  });
});
