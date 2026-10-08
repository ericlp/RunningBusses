import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const manifest = JSON.parse(readFileSync('public/data/catalog-manifest.json', 'utf8'));
const defaultFiles = ['catalog-manifest.json', manifest.catalog.file, manifest.categories.stadsbuss.file];
const size = (file) => {
  const bytes = readFileSync(`public/data/${file}`);
  return { json: bytes.length, gzip: gzipSync(bytes).length };
};
const report = {
  environment: 'Headless Chromium; 360x740; CDP 4x CPU slowdown, 50 ms latency, 10 Mbit/s download. Vite preview serves gzip. Not physical-device evidence.',
  caveat: 'Split usability includes the app and visible route canvas; monolith baseline is the previous loader data-ready path, without UI rendering. Heap is retained browser JS heap after forced GC, not peak or total device memory.',
  sizes: Object.fromEntries([...defaultFiles, 'lines.json'].map((f) => [f, size(f)])),
  runs: [],
};
assert(defaultFiles.reduce((sum, f) => sum + size(f).gzip, 0) <= size('lines.json').gzip * 0.1);
const browser = await chromium.launch();
const url = 'http://localhost:4173/';

async function setup(baseline) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'en-GB', serviceWorkers: 'block' });
  await context.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  if (baseline) await context.route(/^http:\/\/localhost:4173\/$/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Monolith loading baseline</title>' }));
  await context.addInitScript(() => {
    localStorage.setItem('rb.panSpeed', 'off');
    window.routeMeasurements = { parse: [], reads: [] };
    const parse = JSON.parse;
    JSON.parse = function(text, ...args) {
      const start = performance.now();
      const value = parse.call(this, text, ...args);
      if (text.length > 10000 && value?.schemaVersion) window.routeMeasurements.parse.push({ kind: value.category ?? (value.lines?.[0]?.coordinates ? 'monolith' : 'catalogue'), ms: performance.now() - start });
      return value;
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(key) {
      const start = performance.now();
      const request = get.call(this, key);
      if (typeof key === 'string' && (key.startsWith('transit.') || key === 'dataset')) request.addEventListener('success', () => window.routeMeasurements.reads.push({ key, ms: performance.now() - start }));
      return request;
    };
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 50, downloadThroughput: 10_000_000 / 8, uploadThroughput: 1_000_000 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  return { context, page, cdp };
}

try {
  const { context, page, cdp } = await setup(false);
  for (const temperature of ['cold', 'warm-after-download-all']) {
    await page.goto(url);
    await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-pane canvas')].some((c) => {
      const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
      return false;
    }));
    const record = await page.evaluate(() => ({
      usableMs: performance.now(),
      requests: performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).map((r) => ({ file: r.name.split('/data/')[1], transferred: r.transferSize, encoded: r.encodedBodySize })),
      ...window.routeMeasurements,
    }));
    await cdp.send('HeapProfiler.collectGarbage');
    const metrics = await cdp.send('Performance.getMetrics');
    const requested = record.requests.map((r) => r.file);
    assert.deepEqual(requested.sort(), (temperature === 'cold' ? defaultFiles : ['catalog-manifest.json']).slice().sort());
    assert(!record.reads.some((r) => r.key === 'dataset' || Object.entries(manifest.categories).some(([c, d]) => c !== 'stadsbuss' && r.key === `transit.payload.${d.hash}`)));
    report.runs.push({ loader: 'split', temperature, ...record, heapBytes: metrics.metrics.find((m) => m.name === 'JSHeapUsedSize').value });
    if (temperature === 'cold') {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Download all categories', exact: true }).click();
      await page.getByText(`All categories saved: ${manifest.feedVersion}.`, { exact: true }).waitFor({ timeout: 120_000 });
    }
  }
  await context.close();
  const baseline = await setup(true);
  for (const temperature of ['cold', 'warm']) {
    await baseline.page.goto(url);
    const record = await baseline.page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('category-performance', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('kv');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const cached = await new Promise((resolve, reject) => {
        const request = db.transaction('kv').objectStore('kv').get('dataset');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
      const dataset = cached?.hash === manifest.hash ? cached.dataset : JSON.parse(await (await fetch(`data/${manifest.file}?v=${manifest.hash}`)).text());
      const readyMs = performance.now();
      window.baselineDataset = dataset;
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ hash: manifest.hash, dataset }, 'dataset');
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      return { dataReadyMs: readyMs, requests: performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/')).map((r) => ({ file: r.name.split('/data/')[1], transferred: r.transferSize, encoded: r.encodedBodySize })), ...window.routeMeasurements };
    });
    await baseline.cdp.send('HeapProfiler.collectGarbage');
    const metrics = await baseline.cdp.send('Performance.getMetrics');
    report.runs.push({ loader: 'monolith-baseline', temperature, ...record, heapBytes: metrics.metrics.find((m) => m.name === 'JSHeapUsedSize').value });
  }
  await baseline.context.close();
  console.log(JSON.stringify(report, null, 2));
  if (process.env.CATEGORY_PERFORMANCE_OUTPUT) writeFileSync(process.env.CATEGORY_PERFORMANCE_OUTPUT, JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); }
