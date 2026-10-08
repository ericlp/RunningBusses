const DB = 'running-busses';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE);
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  return idbBatch([[key, value]]);
}

export async function idbBatch(entries: [string, unknown][], deletes: string[] = []): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
    tx.onerror = () => reject(tx.error);
    try {
      for (const [key, value] of entries) store.put(value, key);
      for (const key of deletes) store.delete(key);
    } catch (e) { tx.abort(); reject(e); }
  });
}

export async function idbUpdate<T>(key: string, update: (previous: T | undefined) => { value: T; entries?: [string, unknown][]; deletes?: string[] }): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
    tx.onerror = () => reject(tx.error);
    const request = store.get(key);
    request.onsuccess = () => {
      try {
        const next = update(request.result as T | undefined);
        store.put(next.value, key);
        for (const [k, value] of next.entries ?? []) store.put(value, k);
        for (const k of next.deletes ?? []) store.delete(k);
      } catch (e) { tx.abort(); reject(e); }
    };
  });
}

export async function idbKeys(): Promise<string[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE);
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result.filter((k): k is string => typeof k === 'string'));
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  });
}
