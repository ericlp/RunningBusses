import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { serveFixture } from './data-fixture.mjs';

const dataset = JSON.parse(readFileSync('public/data/lines.json', 'utf8'));
const fixture = { ...dataset, lines: dataset.lines.filter((line) => line.key === '59') };
const tileCache = 'runningbusses-tiles-v1';
const freshHeader = 'x-rb-tile-fresh-until';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: 'allow' });
  let mode = 'success';
  let workerRequests = 0;
  let allRequests = 0;
  const pageErrors = [];
  await context.route('https://tile.openstreetmap.org/**', async (route) => {
    allRequests++;
    if (route.request().serviceWorker()) workerRequests++;
    if (mode === 'network') {
      await route.abort('failed');
    } else {
      await route.fulfill({
        status: mode === 'success' ? 200 : Number(mode),
        headers: {
          'access-control-allow-origin': '*',
          'content-type': mode === 'success' ? 'image/png' : 'text/plain',
          date: new Date().toUTCString(),
        },
        body: mode === 'success' ? image : 'simulated provider failure',
      });
    }
  });
  await serveFixture(context, fixture);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('http://localhost:4173/');
  await page.waitForSelector('.list button');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
  });
  await page.waitForLoadState('networkidle');
  await page.evaluate((name) => caches.delete(name), tileCache);

  async function renderedTiles() {
    await page.waitForFunction(() => {
      const tiles = [...document.querySelectorAll('.leaflet-tile')];
      return tiles.length > 0 && tiles.every((tile) => tile.complete && tile.naturalWidth === 1);
    });
    await page.waitForLoadState('networkidle');
  }

  async function snapshot() {
    return page.evaluate(async ({ tileCache, freshHeader }) => {
      const cache = await caches.open(tileCache);
      const keys = await cache.keys();
      const result = {};
      for (const key of keys) {
        const response = await cache.match(key);
        result[key.url] = { expiry: response.headers.get(freshHeader), date: response.headers.get('date'), body: [...new Uint8Array(await response.arrayBuffer())] };
      }
      return result;
    }, { tileCache, freshHeader });
  }

  async function expire(legacy = false) {
    await page.evaluate(async ({ tileCache, freshHeader, legacy }) => {
      const cache = await caches.open(tileCache);
      for (const key of await cache.keys()) {
        const response = await cache.match(key);
        const headers = new Headers(response.headers);
        if (legacy) headers.delete(freshHeader);
        else headers.set(freshHeader, String(Date.now() - 1));
        await cache.put(key, new Response(await response.arrayBuffer(), { headers }));
      }
    }, { tileCache, freshHeader, legacy });
  }

  workerRequests = 0;
  await page.reload();
  await renderedTiles();
  await page.waitForFunction(async ({ tileCache, freshHeader }) => {
    const cache = await caches.open(tileCache);
    const tiles = [...document.querySelectorAll('.leaflet-tile')];
    for (const tile of tiles) {
      const response = await cache.match(tile.src);
      if (!response || Number(response.headers.get(freshHeader)) <= Date.now()) return false;
    }
    return tiles.length > 0;
  }, { tileCache, freshHeader });
  assert(workerRequests > 0, 'cold tiles must pass through intercepted service-worker fetches');
  const saved = await snapshot();
  assert(Object.keys(saved).length > 0, 'viewed tiles must be cached');
  assert(Object.values(saved).every((tile) => tile.date === null), 'fixture Date must actually be hidden by cross-origin header filtering');
  assert(Object.values(saved).every((tile) => Number(tile.expiry) > Date.now() + 6 * 24 * 60 * 60 * 1000), 'unexposed Date must not prevent seven-day fallback');

  allRequests = 0;
  workerRequests = 0;
  await page.reload();
  await renderedTiles();
  assert.equal(allRequests, 0, 'warm tiles must be served without any provider requests');
  assert.deepEqual(await snapshot(), saved, 'cache reads must not refresh timestamps');
  console.log('ok  controlled cold load and warm cache reuse without exposed Date');

  for (const failure of ['429', '403', '503', 'network']) {
    await expire();
    const stale = await snapshot();
    mode = failure;
    workerRequests = 0;
    await page.reload();
    await renderedTiles();
    assert(workerRequests > 0, `${failure}: expired tiles must attempt a worker fetch`);
    assert.deepEqual(await snapshot(), stale, `${failure}: fallback must preserve cached bytes and expiry`);
    console.log(`ok  stale viewed tiles render during ${failure} failure`);
  }

  await expire(true);
  const legacy = await snapshot();
  workerRequests = 0;
  await page.reload();
  await renderedTiles();
  assert(workerRequests > 0, 'legacy entries must attempt refresh');
  assert.deepEqual(await snapshot(), legacy, 'legacy fallback must not manufacture freshness');
  mode = 'success';
  await page.reload();
  await renderedTiles();
  await page.waitForFunction(async ({ tileCache, freshHeader }) => {
    const cache = await caches.open(tileCache);
    const keys = await cache.keys();
    return keys.length > 0 && (await Promise.all(keys.map(async (key) => Number((await cache.match(key)).headers.get(freshHeader)) > Date.now()))).every(Boolean);
  }, { tileCache, freshHeader });
  console.log('ok  legacy cache survives failure and migrates after successful refresh');
  assert.deepEqual(pageErrors, [], 'journey must not produce page errors');
  await context.close();
} finally {
  await browser.close();
}
