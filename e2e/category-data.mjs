import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { readStored, serveFixture, splitFixture, writeStored } from './data-fixture.mjs';

const original = JSON.parse(readFileSync('public/data/lines.json', 'utf8'));
const city = original.lines.find((l) => l.key === '59');
const regional = original.lines.find((l) => l.category === 'other-bus');
const tram = original.lines.find((l) => l.category === 'tram');
const fixture = { ...original, lines: [city, regional, tram] };
const categories = ['stadsbuss', 'stombuss', 'express', 'industri', 'other-bus', 'tram', 'ferry'];
const browser = await chromium.launch();
const url = 'http://localhost:4173/';
const course = (id, lines, extra = {}) => ({
  id, name: id, status: 'NotCompleted', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', completedAt: null,
  legs: lines.map((line) => ({ kind: 'line', line, reversed: false })), ...extra,
});
const waitGeometry = (page) => page.waitForFunction(() => [...document.querySelectorAll('.leaflet-pane canvas')].some((canvas) => {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
  return false;
}));
const note = (message) => console.log('ok  ', message);

async function setup(options = {}) {
  const context = await browser.newContext({ locale: 'en-GB', viewport: { width: 360, height: 740 }, serviceWorkers: 'block', ...options });
  const split = await serveFixture(context, fixture);
  await context.addInitScript(() => { localStorage.setItem('rb.panSpeed', 'off'); });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (request) => { if (request.url().includes('/data/')) requests.push(request.url().split('/data/')[1]); });
  page.on('pageerror', (error) => { throw error; });
  return { context, page, split, requests };
}

try {
  {
    const { context, page, split, requests } = await setup({ serviceWorkers: 'allow' });
    await page.goto(url);
    await page.waitForSelector('.list button');
    await waitGeometry(page);
    assert.deepEqual(requests.sort(), ['catalog-manifest.json', split.manifest.catalog.file, split.manifest.categories.stadsbuss.file].sort());
    note('cold default requests only manifest, catalogue and city geometry');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Download all categories', exact: true }).click();
    await page.getByText(`All categories saved: ${fixture.feedVersion}.`, { exact: true }).waitFor();
    assert.equal(await readStored(page, 'transit.installed'), split.manifest.release);
    requests.length = 0;
    await page.reload();
    await waitGeometry(page);
    await page.waitForLoadState('networkidle');
    assert.deepEqual(requests, ['catalog-manifest.json']);
    note('download-all persists a complete release without hydrating categories on warm city startup');
    const cachedData = await page.evaluate(async () => (await (await caches.open('runningbusses-v1')).keys()).filter((r) => /\/data\/(?:catalog|categories)/.test(r.url)).map((r) => r.url));
    assert.deepEqual(cachedData, []);
    await context.route('**/data/**', (route) => route.abort());
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.list button');
    await waitGeometry(page);
    assert.match(await page.locator('body').innerText(), /offline/i);
    note('service worker caches the app shell, not split data; offline startup uses IndexedDB coherently');
    await context.setOffline(false);
    await context.close();
  }
  {
    const { context, page, split, requests } = await setup();
    await context.addInitScript(() => localStorage.setItem('rb.filters', JSON.stringify({ categories: ['other-bus'], status: 'all', tags: [], minKm: null, maxKm: null })));
    await page.goto(url);
    await page.waitForSelector('.list button');
    await page.locator('.sheet .list button').first().click();
    await waitGeometry(page);
    assert(requests.includes(split.manifest.categories['other-bus'].file));
    assert(!requests.includes(split.manifest.categories.stadsbuss.file));
    note('saved non-city filters do not force city geometry');
    await context.close();
  }
  {
    const { context, page, split, requests } = await setup();
    let fail = true;
    await context.route(`**/data/${split.manifest.categories['other-bus'].file}`, (route) => fail ? route.abort() : route.fulfill({ contentType: 'application/json', body: split.files.get(split.manifest.categories['other-bus'].file) }));
    await page.goto(`${url}#line=${encodeURIComponent(regional.key)}`);
    await page.waitForSelector('.data-status');
    assert.equal(new URL(page.url()).hash, `#line=${encodeURIComponent(regional.key)}`);
    assert(!requests.includes(split.manifest.categories.stadsbuss.file));
    assert.equal(await page.locator('.line-card').count(), 0);
    fail = false;
    await page.locator('.data-status button').click();
    await page.waitForSelector('.line-card');
    await waitGeometry(page);
    assert.equal(new URL(page.url()).hash, `#line=${encodeURIComponent(regional.key)}`);
    note('pending deep link keeps its hash and waits for valid geometry, with retry');
    await context.close();
  }
  {
    const { context, page, split, requests } = await setup();
    const compact = { v: 1, f: fixture.feedVersion, p: 1, c: [['shared', 'Shared mixed course', 0, 'a', 'b', null, [['l', regional.key, 0], ['l', tram.key, 1]]]] };
    const payload = 'p' + Buffer.from(JSON.stringify(compact)).toString('base64url');
    let fail = true;
    await context.route(`**/data/${split.manifest.categories.tram.file}`, (route) => fail ? route.abort() : route.fulfill({ contentType: 'application/json', body: split.files.get(split.manifest.categories.tram.file) }));
    await page.goto(`${url}#sync=${payload}`);
    await page.waitForSelector('.data-status');
    assert.equal(await page.locator('.modal').count(), 0);
    assert(!requests.includes(split.manifest.categories.stadsbuss.file));
    fail = false;
    await page.locator('.data-status button').click();
    await page.waitForSelector('.modal');
    assert.match(await page.locator('.modal').innerText(), /1 course/);
    assert.doesNotMatch(await page.locator('.modal').innerText(), /skipped|missing/i);
    assert.equal(await readStored(page, 'courses'), undefined);
    await page.locator('.modal button.primary').click();
    await page.getByText('Shared mixed course', { exact: true }).waitFor();
    const imported = await readStored(page, 'courses');
    assert.deepEqual(imported[0].legs.map((l) => l.line.key), [regional.key, tram.key]);
    note('mixed-category share retains pending intent and never skips network-unavailable known keys');
    await context.close();
  }
  {
    const { context, page, split } = await setup();
    await context.addInitScript((categories) => localStorage.setItem('rb.filters', JSON.stringify({ categories, status: 'all', tags: [], minKm: null, maxKm: null })), categories);
    let fail = true;
    await context.route(`**/data/${split.manifest.categories['other-bus'].file}`, (route) => fail ? route.abort() : route.fulfill({ contentType: 'application/json', body: split.files.get(split.manifest.categories['other-bus'].file) }));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('.sheet .list button').length === 3);
    assert.equal(await page.locator('.sheet .list button').count(), fixture.lines.length);
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Create course', exact: true }).click();
    await page.getByText('All selected categories must load before suggesting nearest routes.', { exact: false }).waitFor();
    assert.equal(await page.locator('.sheet .list button').count(), 0);
    fail = false;
    await page.locator('.data-status button').click();
    await page.waitForFunction(() => document.querySelectorAll('.sheet .list button').length === 6);
    note('complete catalogue lists every category before geometry; planning waits for the entire selected pool and retries');
    await context.close();
  }
  {
    const { context, page, split } = await setup();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await context.route(`**/data/${split.manifest.categories['other-bus'].file}`, async (route) => {
      await gate;
      await route.fulfill({ contentType: 'application/json', body: split.files.get(split.manifest.categories['other-bus'].file) });
    });
    await page.goto(`${url}#line=${encodeURIComponent(regional.key)}`);
    await page.waitForSelector('.data-status');
    await page.evaluate((key) => { location.hash = `line=${encodeURIComponent(key)}`; }, tram.key);
    await page.waitForSelector('.line-card');
    release();
    await page.waitForResponse(`**/data/${split.manifest.categories['other-bus'].file}`);
    assert.equal(new URL(page.url()).hash, `#line=${encodeURIComponent(tram.key)}`);
    assert.match(await page.locator('.line-card').innerText(), new RegExp(tram.from));
    note('late category responses cannot undo a newer route selection');
    await context.close();
  }
  {
    const { context, page, split, requests } = await setup();
    await page.goto(url);
    await waitGeometry(page);
    const pinned = course('Pinned historical regional route', [{ ...regional, lengthM: 1234 }], { pinned: true });
    await writeStored(page, [['courses', [pinned]]]);
    requests.length = 0;
    await page.reload();
    await waitGeometry(page);
    assert(!requests.includes(split.manifest.categories['other-bus'].file));
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.course-main').click();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await context.route(`**/data/${split.manifest.categories['other-bus'].file}`, async (route) => {
      await gate;
      await route.fulfill({ contentType: 'application/json', body: split.files.get(split.manifest.categories['other-bus'].file) });
    });
    const requested = page.waitForRequest(`**/data/${split.manifest.categories['other-bus'].file}`);
    await page.getByRole('button', { name: 'Update to current data', exact: true }).click();
    await requested;
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.course').length === 0);
    release();
    await page.getByText('The course changed during download. Please retry.', { exact: true }).waitFor();
    assert.deepEqual(await readStored(page, 'courses'), []);
    note('pinned snapshots need no historical category fetch; an asynchronous explicit refresh cannot resurrect a deleted course');
    await context.close();
  }
  {
    const { context, page, split } = await setup();
    await page.goto(url);
    await waitGeometry(page);
    const oldCity = { ...city, lengthM: 1234 };
    const oldRegional = { ...regional, lengthM: 2345 };
    const mixed = course('mixed', [oldCity, oldRegional]);
    const done = course('done', [oldCity], { status: 'Completed', completedAt: '2026-10-01T00:00:00Z' });
    const pinned = course('pinned', [oldRegional], { pinned: true });
    const removed = course('removed', [{ ...oldCity, key: 'genuinely-removed' }], { pinned: true });
    await writeStored(page, [['courses', [mixed, done, pinned, removed]]]);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await context.route(`**/data/${split.manifest.categories['other-bus'].file}`, async (route) => {
      await gate;
      await route.fulfill({ contentType: 'application/json', body: split.files.get(split.manifest.categories['other-bus'].file) });
    });
    const requested = page.waitForRequest(`**/data/${split.manifest.categories['other-bus'].file}`);
    await page.reload();
    await requested;
    await page.waitForSelector('.sheet');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    assert.equal((await readStored(page, 'courses'))[0].legs[0].line.lengthM, 1234);
    await page.locator('.course-main').first().click();
    assert.doesNotMatch(await page.locator('.course').first().innerText(), /disappeared|missing/i);
    release();
    await page.waitForFunction(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('running-busses', 1); q.onsuccess = () => r(q.result); });
      const data = await new Promise((r) => { const q = db.transaction('kv').objectStore('kv').get('courses'); q.onsuccess = () => r(q.result); });
      db.close();
      return data[0].legs[0].line.lengthM !== 1234 && data[0].legs[1].line.lengthM !== 2345;
    });
    const stored = await readStored(page, 'courses');
    assert.deepEqual(stored[1], done);
    assert.deepEqual(stored[2], pinned);
    await page.locator('.course-main').nth(3).click();
    assert.match(await page.locator('.course').nth(3).innerText(), /genuinely-removed/);
    note('mixed courses update only when complete; pinned/completed snapshots stay unchanged and real removals use catalogue keys');
    await context.close();
  }
  {
    const { context, page, split } = await setup();
    await page.goto(url);
    await waitGeometry(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Download all categories', exact: true }).click();
    await page.getByText(`All categories saved: ${fixture.feedVersion}.`, { exact: true }).waitFor();
    const next = { ...fixture, feedVersion: 'new-release', generatedAt: '2026-10-09T00:00:00Z', lines: fixture.lines.map((l) => ({ ...l, lengthM: l.lengthM + 10 })) };
    const updated = splitFixture(next);
    // Change geometry too so a regional refresh cannot be satisfied by the installed release.
    next.lines[1] = { ...next.lines[1], coordinates: [...regional.coordinates, regional.coordinates.at(-1)] };
    const current = await serveFixture(context, next);
    let fail = true;
    await context.route(`**/data/${current.manifest.categories['other-bus'].file}`, (route) => fail ? route.abort() : route.fulfill({ contentType: 'application/json', body: current.files.get(current.manifest.categories['other-bus'].file) }));
    await page.reload();
    await waitGeometry(page);
    assert.equal(await readStored(page, 'transit.installed'), split.manifest.release);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh offline release', exact: true }).click();
    await page.getByText('Offline download failed.', { exact: false }).waitFor();
    assert.equal(await readStored(page, 'transit.installed'), split.manifest.release);
    fail = false;
    await page.locator('section[aria-label="Offline route data"]').getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByText('All categories saved: new-release.', { exact: true }).waitFor();
    assert.equal(await readStored(page, 'transit.installed'), current.manifest.release);
    assert.notEqual(current.manifest.release, updated.manifest.release);
    note('explicit refresh preserves old installation on failure, then atomically promotes the complete new release');
    await context.close();
  }
  {
    const { context, page } = await setup();
    await context.addInitScript(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (typeof key === 'string' && key.startsWith('transit.')) throw new DOMException('Simulated quota exceeded', 'QuotaExceededError');
        return original.call(this, value, key);
      };
    });
    await page.goto(url);
    await waitGeometry(page);
    await page.getByText('Data could not be saved offline.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Download all categories', exact: true }).click();
    await page.getByText('Offline download failed.', { exact: false }).waitFor();
    assert.equal(await readStored(page, 'transit.installed'), undefined);
    note('quota failures keep fetched routes usable without claiming offline success');
    await context.close();
  }
} finally { await browser.close(); }
