import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { serveFixture } from './data-fixture.mjs';

const dataset = JSON.parse(readFileSync('public/data/lines.json', 'utf8'));
const city = dataset.lines.find((l) => l.key === '59');
const regional = dataset.lines.filter((l) => l.category === 'other-bus' && l.number === '1' && !l.tags.includes('retur')).slice(0, 2);
const tram = dataset.lines.find((l) => l.category === 'tram');
if (!city || !tram || regional.length !== 2) throw new Error('Regional journey needs a city line, tram and two distinct regional lines numbered 1');
const fixture = { ...dataset, lines: [city, ...regional, tram] };
const browser = await chromium.launch();
let failures = 0;
const ok = (condition, message) => { console.log(condition ? 'ok  ' : 'FAIL', message); if (!condition) failures++; };

try {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ locale: 'sv-SE', viewport: { width, height: 740 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', (error) => { console.log('FAIL', error.message); failures++; });
    await serveFixture(context, fixture);
    await page.addInitScript(() => localStorage.setItem('rb.panSpeed', 'off'));
    await page.goto('http://localhost:4173/');
    await page.waitForSelector('.list button');
    ok(await page.locator('.list button').count() === 1, `${width}px: default remains city buses`);
    await page.click('button.tool:has-text("Filter")');
    const categories = page.locator('.filter-panel [aria-label="Kategori"]');
    ok(await categories.locator('button:text-is("Alla")').count() === 0, `${width}px: no all-buses shortcut`);
    await categories.locator('button:text-is("Övriga Västtrafikbussar")').click();
    await categories.locator('button:text-is("Stadsbuss")').click();
    await page.waitForFunction(() => document.querySelectorAll('.sheet .list button').length === 2);
    ok(await page.locator('.list button').count() === 2, `${width}px: regional category excludes city buses and trams`);
    await page.click('button.tool:has-text("Filter")');
    for (let i = 0; i < regional.length; i++) {
      await page.locator('.sheet .list button').nth(i).click();
      await page.waitForFunction((key) => new URLSearchParams(location.hash.slice(1)).get('line') === key, regional[i].key);
      const key = new URL(page.url()).hash.slice('#line='.length);
      ok(regional.some((l) => l.key === decodeURIComponent(key)), `${width}px: duplicate number selects its own namespaced identity`);
      await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-pane canvas')].some((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
        return false;
      }));
    }
    await page.reload();
    await page.waitForSelector('.list button');
    ok(await page.locator('.list button').count() === 2, `${width}px: regional filter survives reload`);
    await page.click('text=Planera');
    for (let i = 0; i < regional.length; i++) {
      await page.click('text=Skapa bana');
      await page.waitForSelector('.strip');
      await page.waitForSelector('.sheet .list button');
      await page.locator('.list button').first().click();
      await page.click('.strip >> text=Spara');
      await page.fill('.modal input', `Regional ${i + 1}`);
      await page.click('.modal .primary');
      await page.waitForFunction((count) => document.querySelectorAll('.course').length === count, i + 1);
    }
    await page.reload();
    await page.waitForSelector('.course');
    ok(await page.locator('.course').count() === 2, `${width}px: both duplicate-number courses persist separately`);
    const keys = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('running-busses', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction('kv').objectStore('kv').get('courses');
          request.onsuccess = () => resolve(request.result.flatMap((c) => c.legs.filter((l) => l.kind === 'line').map((l) => l.line.key)));
          request.onerror = () => reject(request.error);
        });
      } finally { db.close(); }
    });
    ok(new Set(keys).size === 2 && regional.every((l) => keys.includes(l.key)), `${width}px: ownership uses distinct route keys`);
    const progressGroup = '.modal [role=group][aria-label="Räknas i framsteg"]';
    await page.click('[aria-label="Inställningar"]');
    await page.waitForSelector(progressGroup);
    ok(await page.locator(`${progressGroup} [aria-pressed=true]`).count() === 1, `${width}px: progress still defaults to city buses`);
    await page.locator(`${progressGroup} button:text-is("Övriga Västtrafikbussar")`).click();
    await page.click('.modal [aria-label="Stäng"]');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('rb.progressCategories')).includes('other-bus')), `${width}px: progress can include regional buses`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: no horizontal overflow`);
    await context.close();
  }
} finally { await browser.close(); }
process.exitCode = failures ? 1 : 0;
