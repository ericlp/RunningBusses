import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { serveFixture, writeStored } from './data-fixture.mjs';

const original = JSON.parse(readFileSync('public/data/lines.json', 'utf8'));
const city = original.lines.find((line) => line.key === '59');
const oldLine = { ...city, from: 'Historical start', to: 'Historical stop', lengthM: 1000, via: [], viaAt: undefined, coordinates: [[11.97, 57.7], [11.98, 57.71]] };
const course = {
  id: 'card', name: 'Weekend hills', status: 'Completed', completedAt: '2026-10-31',
  createdAt: '2026-10-01', updatedAt: '2026-10-01', participants: ['Alice', 'Eric'],
  legs: [{ kind: 'line', line: oldLine, reversed: true }, { kind: 'manual', id: 'm', label: 'Cafe finish', lengthM: null }],
};
const browser = await chromium.launch();
try {
  for (const scenario of [
    { width: 360, theme: 'light', mode: 'map' },
    { width: 1280, theme: 'dark', mode: 'map' },
    { width: 360, theme: 'light', mode: 'missing' },
    { width: 360, theme: 'dark', mode: 'taint' },
    { width: 360, theme: 'light', mode: 'encode-failure' },
    { width: 360, theme: 'light', mode: 'unsupported' },
    { width: 360, theme: 'light', mode: 'stalled' },
  ]) {
    const context = await browser.newContext({ locale: 'en-GB', viewport: { width: scenario.width, height: 800 }, serviceWorkers: 'block' });
    await serveFixture(context, { ...original, lines: [city] });
    await context.addInitScript(({ theme, mode }) => {
      localStorage.setItem('rb.theme', theme);
      localStorage.setItem('rb.panSpeed', 'off');
      window.cardTexts = [];
      window.cardCanvases = [];
      window.cardShareMode = 'success';
      window.cardShares = [];
      window.cardEncodeFailure = mode === 'encode-failure';
      const text = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(...args) {
        if (this.canvas.width === 1080 && this.canvas.height === 1350) window.cardTexts.push(args[0]);
        return text.apply(this, args);
      };
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(...args) {
        if (this.width === 1080 && this.height === 1350) {
          window.cardCanvases.push(this);
          if (window.cardEncodeFailure) throw new Error('Mock encoder failure');
          if (mode === 'taint' && window.cardCanvases.length === 1) throw new DOMException('Mock tile taint', 'SecurityError');
        }
        return toBlob.apply(this, args);
      };
      Object.defineProperty(navigator, 'canShare', { value: ({ files }) => mode !== 'unsupported' && files.length === 1 && files[0] instanceof File && files[0].type === 'image/png' });
      Object.defineProperty(navigator, 'share', { value: ({ files }) => {
        window.cardShares.push({ name: files[0].name, type: files[0].type, active: navigator.userActivation.isActive });
        if (window.cardShareMode === 'cancel') return Promise.reject(new DOMException('Cancelled', 'AbortError'));
        if (window.cardShareMode === 'fail') return Promise.reject(new Error('Mock share failure'));
        return Promise.resolve();
      } });
    }, scenario);
    const page = await context.newPage();
    const errors = [];
    const tiles = [];
    const data = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes('tile.openstreetmap.org')) tiles.push(request.url());
      if (request.url().includes('/data/')) data.push(request.url());
    });
    const tile = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#b4dbac';
      ctx.fillRect(0, 0, 256, 256);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    let stallPreview = false;
    const heldRoutes = [];
    await context.route('**/tile.openstreetmap.org/**', (route) => {
      if (stallPreview) { heldRoutes.push(route); return; }
      return scenario.mode === 'missing' ? route.abort() : route.fulfill({ contentType: 'image/png', body: tile });
    });
    await page.goto('http://localhost:4173/');
    await page.waitForSelector('.list button');
    await writeStored(page, [['courses', [course]]]);
    await page.reload();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.course-main').click();
    await page.waitForLoadState('networkidle');
    const previousTiles = tiles.length;
    const previousData = data.length;
    if (scenario.mode === 'missing') await context.setOffline(true);
    stallPreview = scenario.mode === 'stalled';
    const openedAt = Date.now();
    await page.getByRole('button', { name: 'Share image', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Course image', exact: true });
    await dialog.waitFor();
    const previewA11y = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(previewA11y.violations.map((violation) => violation.id), []);
    await page.waitForFunction(() => [...document.querySelectorAll('dialog button')].some((button) => button.textContent === 'Prepare image' && !button.disabled), null, { timeout: 25000 });
    if (stallPreview) {
      assert(Date.now() - openedAt >= 14000 && Date.now() - openedAt < 25000, 'stalled viewed tiles stop blocking preparation at the bounded 15-second deadline');
      stallPreview = false;
      await Promise.all(heldRoutes.map((route) => route.abort()));
    }
    await page.waitForLoadState('networkidle');
    assert(tiles.length - previousTiles <= 12, 'only the bounded visible preview tiles are requested');
    let beforeExport = tiles.length;
    if (scenario.mode === 'map' && scenario.width === 360) {
      await page.evaluate(() => {
        const held = new Promise((resolve) => { window.releaseCardFonts = resolve; });
        Object.defineProperty(document.fonts, 'ready', { configurable: true, get: () => held });
      });
      await dialog.getByRole('button', { name: 'Prepare image', exact: true }).click();
      await dialog.locator('.course-card-map').focus();
      await page.keyboard.press('ArrowRight');
      await page.evaluate(() => { window.releaseCardFonts(); delete document.fonts.ready; });
      await dialog.getByText('The preview changed.', { exact: false }).waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Download PNG', exact: true }).count(), 0);
      await page.waitForFunction(() => [...document.querySelectorAll('dialog button')].some((button) => button.textContent === 'Prepare image' && !button.disabled));
      await page.waitForLoadState('networkidle');
      beforeExport = tiles.length;
    }
    await dialog.getByRole('button', { name: 'Prepare image', exact: true }).click();
    if (scenario.mode === 'encode-failure') {
      await dialog.getByText('Could not prepare the image.', { exact: false }).waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Download PNG', exact: true }).count(), 0);
      await page.evaluate(() => { window.cardEncodeFailure = false; });
      await dialog.getByRole('button', { name: 'Prepare image', exact: true }).click();
    }
    await dialog.locator('.course-card-image').waitFor();
    await page.waitForFunction(() => document.querySelector('dialog .course-card-image')?.complete);
    assert.equal(tiles.length, beforeExport, 'PNG export does not fetch extra map tiles');
    assert.equal(data.length, previousData, 'historical course image does not need current category geometry');
    const drawn = await page.evaluate(() => window.cardTexts);
    assert(drawn.includes('Weekend hills'));
    assert(drawn.some((text) => text.includes('Alice, Eric')));
    assert(drawn.some((text) => text.includes('at least 1.0 km')));
    assert(drawn.some((text) => text.includes('Historical stop')));
    assert(drawn.some((text) => text.includes('Cafe finish')));
    assert(drawn.includes('© OpenStreetMap contributors'));
    const pixels = await page.evaluate(async () => {
      const image = document.querySelector('dialog .course-card-image');
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, header: [...ctx.getImageData(20, 20, 1, 1).data], map: [...ctx.getImageData(20, 850, 1, 1).data] };
    });
    assert.equal(pixels.width, 1080); assert.equal(pixels.height, 1350);
    assert.equal(pixels.header[0] < 100, scenario.theme === 'dark');
    const fallback = ['missing', 'taint', 'stalled'].includes(scenario.mode);
    assert.equal(await dialog.getByText('Map unavailable', { exact: false }).count(), fallback ? 1 : 0);
    if (fallback) assert.deepEqual(pixels.map, pixels.header);
    else assert.notDeepEqual(pixels.map, pixels.header);
    if (scenario.mode === 'taint') {
      assert.equal(await page.evaluate(() => window.cardCanvases.length), 2);
      assert.equal(await page.evaluate(() => window.cardCanvases[0] !== window.cardCanvases[1]), true);
    }
    const imageA11y = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(imageA11y.violations.map((violation) => violation.id), []);
    if (scenario.mode !== 'unsupported') {
      await dialog.getByRole('button', { name: 'Share PNG', exact: true }).click();
      await dialog.getByText('The file was handed to the share sheet.', { exact: false }).waitFor();
      const [shared] = await page.evaluate(() => window.cardShares);
      assert.deepEqual(shared, { name: 'weekend-hills.png', type: 'image/png', active: true });
      await page.evaluate(() => { window.cardShareMode = 'cancel'; });
      await dialog.getByRole('button', { name: 'Share PNG', exact: true }).click();
      await page.waitForFunction(() => ![...document.querySelectorAll('dialog button')].find((button) => button.textContent === 'Share PNG').disabled);
      await page.evaluate(() => { window.cardShareMode = 'fail'; });
      await dialog.getByRole('button', { name: 'Share PNG', exact: true }).click();
      await dialog.getByText('Could not share the file.', { exact: false }).waitFor();
    } else {
      assert.equal(await dialog.getByRole('button', { name: 'Share PNG', exact: true }).count(), 0);
    }
    const downloading = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download PNG', exact: true }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'weekend-hills.png');
    const png = readFileSync(await download.path());
    assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
    const previousImage = await dialog.locator('.course-card-image').getAttribute('src');
    await dialog.getByRole('button', { name: 'Change preview', exact: true }).click();
    assert.equal(await dialog.locator('.course-card-image').count(), 0);
    assert.equal(await dialog.getByRole('button', { name: 'Share PNG', exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('button', { name: 'Download PNG', exact: true }).count(), 0);
    if (scenario.mode === 'map' && scenario.width === 360) {
      await page.waitForFunction(() => [...document.querySelectorAll('dialog button')].some((button) => button.textContent === 'Prepare image' && !button.disabled));
      await dialog.getByRole('button', { name: 'Prepare image', exact: true }).click();
      await dialog.locator('.course-card-image').waitFor();
      assert.notEqual(await dialog.locator('.course-card-image').getAttribute('src'), previousImage);
    }
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Share image', exact: true }).evaluate((button) => button === document.activeElement), true);
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await page.getByRole('button', { name: 'Hide completed', exact: true }).click();
    await page.locator('.sheet .list button').first().click();
    await page.locator('.line-card').getByRole('button', { name: 'Share image', exact: true }).click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`ok  ${scenario.width}px ${scenario.theme}: ${scenario.mode} card, exact PNG, snapshot content, prepared sharing and fresh fallback`);
  }
} finally {
  await browser.close();
}
