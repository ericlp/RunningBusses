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
  for (const { supported, status, width } of [
    { supported: true, status: 'Completed', width: 360 },
    { supported: false, status: 'Completed', width: 360 },
    { supported: true, status: 'NotCompleted', width: 360 },
    { supported: true, status: 'Completed', width: 1100 },
    { supported: false, status: 'NotCompleted', width: 1100 },
  ]) {
    const context = await browser.newContext({ locale: 'en-GB', viewport: { width, height: 740 }, serviceWorkers: 'block' });
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
    await writeStored(page, [['courses', [{ ...course, status, pinned: status !== 'Completed', completedAt: status === 'Completed' ? course.completedAt : null }]]]);
    await page.reload();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.locator('.course-main').click();
    await page.getByText('For Garmin: export GPX', { exact: false }).waitFor();
    await page.getByText('Garmin may import only the first line', { exact: false }).waitFor();
    const sharing = page.getByRole('group', { name: 'Share and export course', exact: true });
    const editing = page.getByRole('group', { name: 'Edit course', exact: true });
    assert.deepEqual(await sharing.locator('button').allTextContents(),
      ['Share course', 'Share image', ...(supported ? ['Share GPX'] : []), 'Export GPX']);
    assert.deepEqual(await editing.locator('button').allTextContents(), status === 'Completed'
      ? ['Edit date and runners', 'Mark as not completed', 'Delete']
      : ['Update to current data', 'Edit', 'Mark as completed', 'Delete']);
    const groups = await page.evaluate(() => {
      const sharing = document.querySelector('.gpx-actions').getBoundingClientRect();
      const editing = document.querySelector('.course-edit-actions').getBoundingClientRect();
      return { sharingBottom: sharing.bottom, editingTop: editing.top };
    });
    assert(groups.editingTop >= groups.sharingBottom, 'edit actions start after all sharing actions and guidance');
    const share = page.getByRole('button', { name: 'Share GPX', exact: true });
    const download = page.getByRole('button', { name: 'Export GPX', exact: true });
    assert.equal(await share.count(), supported ? 1 : 0);
    if (supported) {
      await share.click();
      await page.getByText('The file was handed to the share sheet.', { exact: false }).waitFor();
      assert.equal(await page.locator('.toast.info[role="status"]').count(), 1);
      assert.equal(await page.locator('.toast').evaluate((toast) => getComputedStyle(toast).backgroundColor), 'rgb(27, 42, 58)');
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
      assert.equal(await page.locator('.toast[role="alert"]:not(.info)').count(), 1);
    }
    await page.evaluate(() => {
      window.originalGpxClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { throw new Error('Mock download failure'); };
    });
    await download.click();
    await page.getByText('Could not start the download.', { exact: true }).waitFor();
    assert.equal(await page.locator('.toast[role="alert"]:not(.info)').count(), 1);
    await page.evaluate(() => { HTMLAnchorElement.prototype.click = window.originalGpxClick; });
    const downloading = page.waitForEvent('download');
    await download.click();
    const saved = await downloading;
    await page.getByText('Download started.', { exact: true }).waitFor();
    assert.equal(await page.locator('.toast.info[role="status"]').count(), 1);
    assert.equal(saved.suggestedFilename(), 'gpx-snapshot.gpx');
    const xml = readFileSync(await saved.path(), 'utf8');
    assert.equal((xml.match(/<trkseg>/g) ?? []).length, 2);
    assert(xml.includes('Historical A'));
    assert(xml.includes('not a verified running route'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`ok  ${width}px ${status}: grouped actions, guidance, ${supported ? 'informational sharing, cancellation/errors and' : 'unsupported sharing with'} unchanged snapshot download`);
  }
} finally {
  await browser.close();
}
