import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { readStored, serveFixture } from './data-fixture.mjs';

const dataset = JSON.parse(readFileSync('public/data/lines.json', 'utf8'));
const city = dataset.lines.find((l) => l.key === '59');
const ferries = ['285', '287', '362'].map((number) => dataset.lines.find((l) =>
  l.category === 'ferry' && l.number === number && (number !== '287' || l.tags.includes('retur'))));
assert(city && ferries.every(Boolean), 'Ferry journey requires city 59, ferries 285/362 and ferry 287 retur');
const fixture = { ...dataset, lines: [city, ...ferries] };
const browser = await chromium.launch();

try {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({
      locale: 'sv-SE', viewport: { width, height: 740 }, serviceWorkers: 'block',
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const split = await serveFixture(context, fixture);
    await context.route('**/tile.openstreetmap.org/**', (route) => route.abort());
    await context.addInitScript(() => localStorage.setItem('rb.panSpeed', 'off'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests = [];
    page.on('request', (request) => { if (request.url().includes('/data/')) requests.push(request.url()); });
    await page.goto('http://localhost:4173/');
    await page.waitForSelector('.list button');
    assert.equal(await page.locator('.list button').count(), 1);
    assert(!requests.some((url) => url.includes('categories/ferry.')), 'Default visit must not load ferries');

    await page.click('button.tool:has-text("Filter")');
    const categories = page.locator('.filter-panel [aria-label="Kategori"]');
    const ferryResponse = page.waitForResponse(`**/data/${split.manifest.categories.ferry.file}`);
    await categories.locator('button:text-is("Färja")').click();
    await categories.locator('button:text-is("Stadsbuss")').click();
    await page.waitForFunction(() => document.querySelectorAll('.sheet .list button').length === 3);
    await ferryResponse;
    await page.click('button.tool:has-text("Filter")');
    for (let i = 0; i < ferries.length; i++) {
      await page.locator('.sheet .list button').nth(i).click();
      await page.waitForFunction((key) => new URLSearchParams(location.hash.slice(1)).get('line') === key, ferries[i].key);
      await page.waitForFunction(() => [...document.querySelectorAll('.leaflet-pane canvas')].some((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
        return false;
      }));
    }
    await page.reload();
    await page.waitForSelector('.list button');
    assert.equal(await page.locator('.list button').count(), ferries.length, 'Ferry filter survives reload');
    await page.click('text=Planera');
    await page.click('text=Skapa bana');
    await page.waitForSelector('.strip');
    await page.waitForSelector('.sheet .list button');
    await page.locator('.sheet .list button').first().click();
    await page.click('.strip >> text=Spara');
    await page.fill('.modal input', 'Ferry course');
    await page.click('.modal .primary');
    await page.waitForSelector('.course');
    const courses = await readStored(page, 'courses');
    assert.equal(courses.length, 1);
    assert(courses[0].legs.every((leg) => leg.kind === 'line' && leg.line.category === 'ferry'));

    await page.click('[aria-label="Inställningar"]');
    const progress = page.locator('.modal [role=group][aria-label="Räknas i framsteg"]');
    assert.equal(await progress.locator('[aria-pressed=true]').count(), 1);
    await progress.locator('button:text-is("Färja")').click();
    await progress.locator('button:text-is("Stadsbuss")').click();
    await page.click('button:text-is("Kopiera länk")');
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes('#sync='));
    const link = await page.evaluate(() => navigator.clipboard.readText());
    await page.click('.modal [aria-label="Stäng"]');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('rb.progressCategories'))), ['ferry']);
    assert.match(await page.locator('.stats-panel summary').innerText(), /av 3/);
    await page.reload();
    await page.waitForSelector('.course');
    assert.deepEqual(await readStored(page, 'courses'), courses);
    assert.match(await page.locator('.stats-panel summary').innerText(), /av 3/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    const recipient = await browser.newContext({ locale: 'sv-SE', viewport: { width, height: 740 }, serviceWorkers: 'block' });
    await serveFixture(recipient, fixture);
    await recipient.route('**/tile.openstreetmap.org/**', (route) => route.abort());
    const receivingPage = await recipient.newPage();
    receivingPage.on('pageerror', (error) => errors.push(error.message));
    await receivingPage.goto(link);
    await receivingPage.waitForSelector('.import-preview');
    await receivingPage.click('.import-preview .primary');
    await receivingPage.waitForSelector('text=Importen är klar.');
    const imported = await readStored(receivingPage, 'courses');
    assert.deepEqual(imported[0].legs, courses[0].legs, 'Shared ferry course resolves its original identity and geometry');
    assert.deepEqual(errors, []);
    console.log(`ok  ${width}px: ferry filtering, short/return geometry, persistence, progress and sharing`);
    await recipient.close();
    await context.close();
  }
} finally { await browser.close(); }
