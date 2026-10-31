import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idbBatch, idbGet, idbUpdate } from './idb';
import { saveImport, type Recovery } from './store';
import type { Course } from '../domain/course';
import type { LogEntry } from '../domain/log';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function onPut(callback: (store: IDBObjectStore, request: IDBRequest, key: IDBValidKey | undefined) => void) {
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
    const request = put.call(this, value, key);
    callback(this, request, key);
    return request;
  });
}

describe('real IndexedDB transactions', () => {
  it('rolls back earlier successful writes and deletes when a later request aborts', async () => {
    await idbBatch([['first', 'old'], ['removed', 'keep']]);
    const succeeded: IDBValidKey[] = [];
    let removedBeforeAbort: unknown = 'not read';
    onPut((store, request, key) => {
      request.addEventListener('success', () => {
        succeeded.push(key!);
        if (key === 'last') {
          const afterDelete = store.get('removed');
          afterDelete.addEventListener('success', () => {
            removedBeforeAbort = afterDelete.result;
            store.transaction.abort();
          });
        }
      });
    });
    await expect(idbBatch([['first', 'new'], ['last', 'new']], ['removed'])).rejects.toBeNull();
    expect(succeeded).toEqual(['first', 'last']);
    expect(removedBeforeAbort).toBeUndefined();
    expect(await idbGet('first')).toBe('old');
    expect(await idbGet('last')).toBeUndefined();
    expect(await idbGet('removed')).toBe('keep');
  });

  it('rejects callback errors without changing the existing value', async () => {
    await idbBatch([['counter', 7]]);
    const error = new Error('update failed');
    await expect(idbUpdate('counter', () => { throw error; })).rejects.toBe(error);
    expect(await idbGet('counter')).toBe(7);
    await idbUpdate<number>('counter', (previous) => ({ value: previous! + 1 }));
    expect(await idbGet('counter')).toBe(8);
  });

  it('rolls back an update when a sibling value cannot be cloned', async () => {
    await idbBatch([['counter', 7], ['sibling', 'old']]);
    await expect(idbUpdate<number>('counter', () => ({
      value: 8, entries: [['sibling', () => {}]],
    }))).rejects.toMatchObject({ name: 'DataCloneError' });
    expect(await idbGet('counter')).toBe(7);
    expect(await idbGet('sibling')).toBe('old');
  });

  it.each(['batch', 'update'] as const)('resolves %s only after transaction completion, not request success', async (operation) => {
    let settled = false;
    let complete = false;
    let atRequestSuccess: boolean | undefined;
    onPut((store, request) => {
      store.transaction.addEventListener('complete', () => { complete = true; });
      request.addEventListener('success', async () => {
        await Promise.resolve();
        await Promise.resolve();
        atRequestSuccess = settled;
      });
    });
    const write = operation === 'batch'
      ? idbBatch([['value', 1]])
      : idbUpdate('value', () => ({ value: 1 }));
    await write.then(() => {
      settled = true;
      expect(complete).toBe(true);
    });
    expect(atRequestSuccess).toBe(false);
  });

  it('serializes simultaneous updates without losing increments or sibling writes', async () => {
    await idbBatch([['counter', 0]]);
    const observed: number[] = [];
    await Promise.all(Array.from({ length: 12 }, (_, index) => idbUpdate<number>('counter', (previous) => {
      observed.push(previous!);
      return { value: previous! + 1, entries: [[`update.${index}`, previous]] };
    })));
    expect([...observed].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(await idbGet('counter')).toBe(12);
    expect((await Promise.all(Array.from({ length: 12 }, (_, i) => idbGet<number>(`update.${i}`)))).sort((a, b) => a! - b!))
      .toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it('rolls back every imported record after the final log write succeeds then aborts', async () => {
    const before = {
      recovery: { savedAt: 'old', courses: [] }, courses: [{ id: 'old-course' }], people: ['Old Person'], log: [{ id: 'old-event' }],
    };
    await idbBatch(Object.entries(before));
    const succeeded: IDBValidKey[] = [];
    onPut((store, request, key) => {
      request.addEventListener('success', () => {
        succeeded.push(key!);
        if (key === 'log') store.transaction.abort();
      });
    });
    const recovery: Recovery = { savedAt: 'new', courses: [] };
    await expect(saveImport(recovery, [{ id: 'new-course' }] as Course[], ['New Person'], [{ id: 'new-event' }] as LogEntry[]))
      .rejects.toBeNull();
    expect(succeeded).toEqual(['recovery', 'courses', 'people', 'log']);
    for (const [key, value] of Object.entries(before)) expect(await idbGet(key)).toEqual(value);
  });
});
