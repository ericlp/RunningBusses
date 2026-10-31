import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { checkPageErrors, fixture, prepareContext } from './setup.mjs';

const farColor = '#f12345';
const far = { ...fixture.lines.find((line) => line.key === '62'), category: 'tram', color: farColor };
const dataset = { ...fixture, lines: [fixture.lines[0], far] };
const browser = await chromium.launch();
try {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ locale: 'en-GB', viewport: { width, height: 740 }, serviceWorkers: 'block' });
    await prepareContext(context, dataset);
    await context.addInitScript(() => {
      localStorage.setItem('rb.filters', JSON.stringify({ categories: ['stadsbuss', 'tram'], status: 'all', tags: [], minKm: null, maxKm: null }));
      window.routeStrokes = [];
      const stroke = CanvasRenderingContext2D.prototype.stroke;
      CanvasRenderingContext2D.prototype.stroke = function(...args) {
        window.routeStrokes.push(this.strokeStyle);
        return stroke.apply(this, args);
      };
    });
    const page = await context.newPage();
    const checkErrors = checkPageErrors(page);
    await page.goto('http://localhost:4173/');
    await page.waitForFunction(() => document.querySelectorAll('.sheet .list button').length === 2 && !document.querySelector('.data-status'));
    await page.waitForFunction(() => window.routeStrokes.includes('#7b93a3'));
    assert.equal(await page.evaluate((color) => window.routeStrokes.includes(color), farColor), false, 'offscreen geometry must not be painted at the initial city viewport');
    await page.locator('.sheet .list button').filter({ has: page.locator('.badge:text-is("62")') }).click();
    await page.locator('.line-card').waitFor();
    assert.match(await page.locator('.line-card .name').innerText(), /Distant start/);
    await page.getByRole('button', { name: 'Close route card', exact: true }).click();
    await page.locator('.line-card').waitFor({ state: 'detached' });
    await page.waitForFunction((color) => window.routeStrokes.includes(color), farColor);
    assert.equal(await page.locator('.sheet .list button').count(), 2, 'viewport culling must never remove list entries');
    await page.evaluate(() => { window.routeStrokes = []; });
    const map = await page.locator('.leaflet-container').boundingBox();
    const x = map.x + map.width * (width >= 900 ? 0.75 : 0.5);
    const y = map.y + 180;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 100, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction((color) => window.routeStrokes.includes(color), farColor);
    assert.equal(await page.locator('.line-card').count(), 0, 'panning must not depend on a highlighted selection');
    assert.equal(await page.locator('.sheet .list button').count(), 2);
    checkErrors();
    console.log(`ok  ${width}px: exact distant-route painting after camera move, deselection and manual pan`);
    await context.close();
  }
} finally { await browser.close(); }
