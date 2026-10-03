import { describe, expect, it } from 'vitest';
import { choiceKey, makeBackup, mergeCourses, parseBackup } from './backup';
import type { Course } from './course';

const course = (id: string, keys: string[], name = id): Course => ({
  id,
  name,
  status: 'NotCompleted',
  createdAt: 'a',
  updatedAt: 'a',
  completedAt: null,
  legs: keys.map((k) => ({
    kind: 'line' as const,
    reversed: false,
    line: { key: k, number: k, label: k, category: 'stadsbuss' as const, tags: [], from: 'A', to: 'B', lengthM: 1000, via: [], coordinates: [[11.9, 57.7], [11.91, 57.71]] as [number, number][] },
  })),
});

describe('parseBackup', () => {
  it('round-trips an export', () => {
    const cs = [course('1', ['59']), course('2', ['69', '70'])];
    const r = parseBackup(JSON.stringify(makeBackup(cs, 700)));
    expect(r.ok && r.backup.courses).toEqual(cs);
    expect(r.ok && r.backup.radiusM).toBe(700);
  });
  it('rejects bad input', () => {
    expect(parseBackup('{')).toMatchObject({ error: 'notJson' });
    expect(parseBackup('{"a":1}')).toMatchObject({ error: 'notBackup' });
    expect(parseBackup(JSON.stringify({ ...makeBackup([], 500), version: 99 }))).toMatchObject({ error: 'newerVersion' });
    expect(parseBackup(JSON.stringify(makeBackup([{ ...course('1', ['59']), status: 'x' } as never], 500)))).toMatchObject({ error: 'invalid' });
    const badCoord = course('1', ['59']);
    (badCoord.legs[0] as { line: { coordinates: number[][] } }).line.coordinates[0] = [999, 0];
    expect(parseBackup(JSON.stringify(makeBackup([badCoord], 500)))).toMatchObject({ error: 'invalid' });
  });
  it('rejects duplicate ids and a line in two courses', () => {
    expect(parseBackup(JSON.stringify(makeBackup([course('1', ['59']), course('1', ['69'])], 500)))).toMatchObject({ error: 'invalid' });
    expect(parseBackup(JSON.stringify(makeBackup([course('1', ['59']), course('2', ['59'])], 500)))).toMatchObject({ error: 'invalid' });
  });
});

describe('mergeCourses', () => {
  it('adds new courses and skips identical copies', () => {
    const r = mergeCourses([course('1', ['59'])], [course('1', ['59']), course('2', ['69'])], {});
    expect(r.conflicts).toEqual([]);
    expect(r.courses.map((c) => c.id)).toEqual(['1', '2']);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
  });
  it('asks when the same id differs, and honours the choice', () => {
    const local = [course('1', ['59'], 'old')];
    const imp = [course('1', ['59'], 'new')];
    expect(mergeCourses(local, imp, {}).conflicts[0].kind).toBe('sameId');
    expect(mergeCourses(local, imp, { [choiceKey('sameId', '1')]: 'imported' }).courses[0].name).toBe('new');
    expect(mergeCourses(local, imp, { [choiceKey('sameId', '1')]: 'local' }).courses[0].name).toBe('old');
  });
  it('asks when different courses claim the same line, keeping whole courses', () => {
    const local = [course('1', ['59', '60']), course('3', ['70'])];
    const imp = [course('2', ['60', '61'])];
    const r = mergeCourses(local, imp, {});
    expect(r.conflicts[0]).toMatchObject({ kind: 'ownership' });
    expect(r.courses).toHaveLength(2);
    expect(mergeCourses(local, imp, { [choiceKey('ownership', '2')]: 'imported' }).courses.map((c) => c.id)).toEqual(['3', '2']);
    expect(mergeCourses(local, imp, { [choiceKey('ownership', '2')]: 'local' }).courses.map((c) => c.id)).toEqual(['1', '3']);
  });
  it('re-checks ownership after replacing a same-id course', () => {
    const local = [course('1', ['59']), course('2', ['60'])];
    const imp = [course('1', ['60'])];
    const r = mergeCourses(local, imp, { [choiceKey('sameId', '1')]: 'imported' });
    expect(r.conflicts[0].kind).toBe('ownership');
  });
});
