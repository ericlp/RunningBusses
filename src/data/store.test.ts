import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idbBatch, idbGet } from './idb';
import { UserStore, WriteConflict } from './store';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function tabs() {
  const first = new UserStore();
  const second = new UserStore();
  await Promise.all([first.load(), second.load()]);
  return [first, second];
}

describe('conservative user-state revisions', () => {
  it('loads legacy records without rewriting or adding a revision', async () => {
    const draft = { name: 'Kept', legs: [] };
    await idbBatch([['courses', []], ['draft', draft], ['people', ['Anna', 4]], ['log', []]]);
    const store = new UserStore();
    expect(await store.load()).toEqual({ courses: [], draft, people: ['Anna'], log: [] });
    expect(await idbGet('user.revision')).toBeUndefined();
    await store.save([['people', ['Bo']]]);
    expect(await idbGet('user.revision')).toEqual({ state: expect.any(String), draft: null });
  });

  it('rejects all subsequent stale writes without replacing any records', async () => {
    const [first, second] = await tabs();
    await first.save([['courses', ['winner']], ['people', ['Anna']], ['log', ['event']]]);
    const revision = await idbGet('user.revision');
    await expect(second.save([['courses', ['loser']], ['recovery', 'bad'], ['people', []], ['log', []]]))
      .rejects.toBeInstanceOf(WriteConflict);
    await expect(second.save([['draft', { name: 'Unsaved', legs: [] }]], 'draft')).rejects.toBeInstanceOf(WriteConflict);
    expect(await idbGet('courses')).toEqual(['winner']);
    expect(await idbGet('people')).toEqual(['Anna']);
    expect(await idbGet('log')).toEqual(['event']);
    expect(await idbGet('recovery')).toBeUndefined();
    expect(await idbGet('draft')).toBeUndefined();
    expect(await idbGet('user.revision')).toEqual(revision);
  });

  it('serializes simultaneous tabs so exactly one succeeds', async () => {
    const [first, second] = await tabs();
    const result = await Promise.allSettled([
      first.save([['courses', ['one']]]), second.save([['courses', ['two']]]),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = result.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(WriteConflict);
    expect(await idbGet('courses')).toEqual(result[0].status === 'fulfilled' ? ['one'] : ['two']);
  });

  it('loads all user records and their revision from a coherent transaction', async () => {
    const writes: Promise<void>[] = [];
    const reads: Promise<Awaited<ReturnType<UserStore['load']>>>[] = [];
    for (let i = 0; i < 12; i++) {
      const generation = String(i);
      writes.push(idbBatch([
        ['courses', [generation]], ['people', [generation]],
        ['draft', { name: generation, legs: [] }],
        ['user.revision', { state: generation, draft: generation }],
      ]));
      reads.push(new UserStore().load());
    }
    await Promise.all(writes);
    for (const snapshot of await Promise.all(reads)) {
      expect(snapshot.people).toEqual(snapshot.courses);
      expect(snapshot.draft?.name).toBe(snapshot.people[0]);
    }
  });

  it('protects a foreign draft from stale edits, clearing and course saving', async () => {
    const [first, second] = await tabs();
    const draft = { name: 'Winner', legs: [] };
    await first.save([['draft', draft]], 'draft');
    await expect(second.save([['draft', null]], 'draft')).rejects.toBeInstanceOf(WriteConflict);
    await expect(second.save([['courses', ['stale draft']]])).rejects.toBeInstanceOf(WriteConflict);
    expect(await idbGet('draft')).toEqual(draft);
    expect(await idbGet('courses')).toBeUndefined();
  });

  it('orders rapid local drafts and allows the ensuing course save and clearing', async () => {
    const [store] = await tabs();
    await Promise.all([
      store.save([['draft', { name: 'A', legs: [] }]], 'draft'),
      store.save([['draft', { name: 'B', legs: [] }]], 'draft'),
      store.save([['courses', ['saved B']]]),
      store.save([['draft', null]], 'draft'),
    ]);
    expect(await idbGet('courses')).toEqual(['saved B']);
    expect(await idbGet('draft')).toBeNull();
  });

  it('rejects overlapping local state writes based on an older state', async () => {
    const [store] = await tabs();
    const result = await Promise.allSettled([
      store.save([['courses', ['one']]]), store.save([['courses', ['two']]]),
    ]);
    expect(result[0].status).toBe('fulfilled');
    expect(result[1]).toMatchObject({ status: 'rejected', reason: expect.any(WriteConflict) });
    expect(await idbGet('courses')).toEqual(['one']);
  });

  it('rolls back revisions and records on failure and permits retry', async () => {
    const [store] = await tabs();
    const put = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (key === 'log') throw new DOMException('Full', 'QuotaExceededError');
      return put.call(this, value, key);
    });
    await expect(store.save([['courses', ['new']], ['log', ['event']]])).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(await idbGet('courses')).toBeUndefined();
    expect(await idbGet('user.revision')).toBeUndefined();
    spy.mockRestore();
    await store.save([['courses', ['new']], ['log', ['event']]]);
    expect(await idbGet('courses')).toEqual(['new']);
    expect(await idbGet('log')).toEqual(['event']);
  });

  it('refuses writes before loading and reports malformed revisions', async () => {
    const store = new UserStore();
    await expect(store.save([['courses', []]])).rejects.toThrow('not been loaded');
    await idbBatch([['user.revision', { state: 4, draft: null }]]);
    await expect(store.load()).rejects.toThrow('Invalid saved user revision');
    expect(await idbGet('courses')).toBeUndefined();
  });
});
