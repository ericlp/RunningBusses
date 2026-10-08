import { createHash } from 'node:crypto';

const hash = (text) => createHash('sha256').update(text).digest('hex');

export function splitFixture(dataset) {
  const files = new Map();
  const descriptor = (prefix, value) => {
    const text = JSON.stringify(value);
    const digest = hash(text);
    const file = `${prefix}.${digest}.json`;
    files.set(file, text);
    return { file, hash: digest, count: value.lines.length, bytes: Buffer.byteLength(text) };
  };
  const catalog = descriptor('catalog', { schemaVersion: 2, lines: dataset.lines.map(({ coordinates, viaAt, ...metadata }) => metadata) });
  const categories = {};
  for (const category of ['stadsbuss', 'stombuss', 'express', 'industri', 'other-bus', 'tram']) {
    categories[category] = descriptor(`categories/${category}`, {
      schemaVersion: 2, category, lines: dataset.lines.filter((l) => l.category === category).map((l) => ({
        key: l.key, coordinates: l.coordinates, ...(l.viaAt !== undefined ? { viaAt: l.viaAt } : {}),
      })),
    });
  }
  const { feedVersion, referenceDate, generatedAt } = dataset;
  const release = hash(JSON.stringify({ feedVersion, referenceDate, catalog, categories }));
  const manifest = { schemaVersion: 2, release, feedVersion, referenceDate, generatedAt, lineCount: dataset.lines.length, catalog, categories };
  files.set('catalog-manifest.json', JSON.stringify(manifest));
  return { manifest, files };
}

export async function serveFixture(context, dataset) {
  const split = splitFixture(dataset);
  await context.route('**/data/**', (route) => {
    const file = new URL(route.request().url()).pathname.split('/data/')[1];
    return split.files.has(file) ? route.fulfill({ contentType: 'application/json', body: split.files.get(file) }) : route.abort();
  });
  return split;
}

export async function readStored(page, key) {
  return page.evaluate(async (key) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('running-busses', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('kv').objectStore('kv').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, key);
}

export async function writeStored(page, entries) {
  await page.evaluate(async (entries) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('running-busses', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        for (const [key, value] of entries) tx.objectStore('kv').put(value, key);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, entries);
}
