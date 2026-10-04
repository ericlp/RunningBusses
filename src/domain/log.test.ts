import { describe, expect, it } from 'vitest';
import type { Course } from './course';
import { addEntry, isLogEntry, makeEntry, mergeLog, MAX_LOG, removeEntry } from './log';

const course: Course = {
  id: 'c1',
  name: 'Bana',
  status: 'Completed',
  createdAt: 'a',
  updatedAt: 'a',
  completedAt: '2026-05-01',
  participants: ['Anna'],
  legs: [{ kind: 'manual', id: 'm', label: 'Walk', lengthM: 4200 }],
};

describe('completion log', () => {
  it('records the course as it was, including who ran it', () => {
    const e = makeEntry('completed', course, new Date('2026-05-02T10:00:00Z'), 'e1');
    expect(e).toEqual({ id: 'e1', at: '2026-05-02T10:00:00.000Z', kind: 'completed', courseId: 'c1', name: 'Bana', date: '2026-05-01', participants: ['Anna'], distanceM: 4200 });
    expect(makeEntry('uncompleted', course).date).toBeNull();
    expect(isLogEntry(e)).toBe(true);
  });

  it('keeps newest first, merges by id, removes and caps', () => {
    const a = makeEntry('completed', course, new Date('2026-01-01'), 'a');
    const b = makeEntry('uncompleted', course, new Date('2026-02-01'), 'b');
    expect(addEntry([a], b).map((e) => e.id)).toEqual(['b', 'a']);
    expect(mergeLog([a], [a, b]).map((e) => e.id)).toEqual(['b', 'a']);
    expect(removeEntry([b, a], 'b').map((e) => e.id)).toEqual(['a']);
    const many = Array.from({ length: MAX_LOG + 5 }, (_, i) => makeEntry('completed', course, new Date(2026, 0, 1, 0, 0, i), `e${i}`));
    expect(mergeLog(many, [])).toHaveLength(MAX_LOG);
  });

  it('rejects malformed entries', () => {
    expect(isLogEntry({ id: 'x' })).toBe(false);
    expect(isLogEntry(null)).toBe(false);
    expect(isLogEntry({ ...makeEntry('completed', course), kind: 'other' })).toBe(false);
  });
});
