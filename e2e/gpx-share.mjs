import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { serveFixture, writeStored } from './data-fixture.mjs';

const original = JSON.parse(readFileSync('public/data/lines.json', 'utf8'));
const line = original.lines.find((l) => l.key === '59');
const a = { ...line, from: 'Historical A', to: 'Historical B', coordinates: [[11.97, 57.7], [11.98, 57.71]], lengthM: 1000, via: [], viaAt: undefined };
const b = { ...a, key: 'snapshot-b', coordinates: [[12, 57.72], [12.01, 57.73]] };
const course = {
  id: 'gpx', name: 'GPX snapshot', status: 'Completed', createdAt: '2026-10-01', updatedAt: '2026-10-01', completedAt: '2026-10-01',
  legs: [{ kind: 'line', line: a, reversed: false }, { kind: 'manual', id: 'm', label: 'Unknown transfer', lengthM: null }, { kind: 'line', line: b, reversed: true }],
};
const browser = await chromium.launch();
try {
  for (const supported of [true, false]) {
    const context = await browser.newContext({ locale: 'en-GB', viewport: { width: 360, height: 740 }, serviceWorkers: 'block' });
    await serveFixture(context, { ...original, lines: [line] });
    await context.route('**/tile.openstreetmap.org/**', (route) => route.abort());
    await context.addInitScript((supported) => {
      window.testShareMode = 'success';
      window.testShared = [];
      Object.defineProperty(navigator, 'canShare', { value: ({ files }) => supported && files.length === 1 && files[0] instanceof File && files[0].type === 'application/gpx+xml' && files[0].name.endsWith('.gpx') });
      Object.defineProperty(navigator, 'share', { value: (data) => {
        const active = navigator.userActivation.isActive;
        if (window.testShareMode === 'cancel') return Promise.reject(new DOMException('Cancelled', 'AbortError'));
        if (window.testShareMode === 'fail') return Promise.reject(new Error('Mock handoff failure'));
        return data.files[0].text().then((text) => { window.testShared.push({ text, name: data.files[0].name, type: data.files[0].type, active }); });
      } });
    }, supported);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:4173/');
    await page.waitForSelector('.list button');
    await writeStored(page, [['courses', [course]]]);
    await page.reload();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.course-main').click();
    await page.getByText('Choose Garmin Connect', { exact: false }).waitFor();
    const share = page.getByRole('button', { name: 'Share GPX', exact: true });
    const download = page.getByRole('button', { name: 'Export GPX', exact: true });
    assert.equal(await share.count(), supported ? 1 : 0);
    if (supported) {
      await share.click();
      await page.getByText('The file was handed to the share sheet.', { exact: false }).waitFor();
      const [sent] = await page.evaluate(() => window.testShared);
      assert(sent.active, 'native sharing starts with transient user activation');
      assert.equal(sent.name, 'gpx-snapshot.gpx');
      assert.equal(sent.type, 'application/gpx+xml');
      assert.equal((sent.text.match(/<trkseg>/g) ?? []).length, 2);
      assert(sent.text.includes('lat="57.700000" lon="11.970000"'));
      const second = sent.text.split('<trkseg>')[2];
      assert(second.indexOf('lat="57.730000"') < second.indexOf('lat="57.720000"'));
      await page.evaluate(() => { window.testShareMode = 'cancel'; });
      await share.click();
      await page.waitForFunction(() => !document.querySelector('.gpx-actions button').disabled);
      await page.evaluate(() => { window.testShareMode = 'fail'; });
      await share.click();
      await page.getByText('Could not share the file.', { exact: false }).waitFor();
    }
    const downloading = page.waitForEvent('download');
    await download.click();
    const saved = await downloading;
    assert.equal(saved.suggestedFilename(), 'gpx-snapshot.gpx');
    const xml = readFileSync(await saved.path(), 'utf8');
    assert.equal((xml.match(/<trkseg>/g) ?? []).length, 2);
    assert(xml.includes('Historical A'));
    assert(xml.includes('not a verified running route'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`ok  GPX ${supported ? 'prepared sharing, cancellation/error and' : 'unsupported sharing with'} unchanged snapshot download`);
  }
} finally {
  await browser.close();
}
