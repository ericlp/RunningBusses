import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { readStored, writeStored } from './data-fixture.mjs';
import { checkPageErrors, createCourse, prepareContext, waitLegs } from './setup.mjs';

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ locale: 'en-GB', viewport: { width: 360, height: 740 }, serviceWorkers: 'block' });
  await prepareContext(context);
  await context.addInitScript(() => {
    window.failCourseSave = false;
    window.failImportSave = false;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (window.failCourseSave && key === 'courses') throw new DOMException('Simulated quota failure', 'QuotaExceededError');
      if (window.failImportSave && key === 'people') {
        this.transaction.abort();
        throw new DOMException('Simulated interrupted import', 'AbortError');
      }
      return put.call(this, value, key);
    };
  });
  const page = await context.newPage();
  const checkErrors = checkPageErrors(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('http://localhost:4173/');
  await createCourse(page, 'Original');
  const original = await readStored(page, 'courses');
  await page.getByRole('button', { name: 'Create course', exact: true }).click();
  await page.locator('.sheet .list button').first().click();
  await waitLegs(page, 1);
  await page.evaluate(() => { window.failCourseSave = true; });
  await page.locator('.strip button.primary').click();
  await page.locator('.modal input').fill('Retry course');
  await page.locator('.modal button.primary').click();
  await page.getByText('Could not save. The change was not made.', { exact: true }).waitFor();
  assert.deepEqual(await readStored(page, 'courses'), original);
  assert.equal((await readStored(page, 'draft')).name, 'Retry course');
  assert.equal(await page.locator('.leg-card').count(), 1);
  await page.evaluate(() => { window.failCourseSave = false; });
  await page.locator('.strip button.primary').click();
  await page.locator('.modal button.primary').click();
  await page.waitForFunction(() => document.querySelectorAll('.course').length === 2);
  assert.equal((await readStored(page, 'courses'))[1].name, 'Retry course');
  const before = await readStored(page, 'courses');
  await writeStored(page, [['people', ['Existing']], ['log', []], ['recovery', { savedAt: '2026-10-01', courses: original }]]);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const backup = JSON.parse(readFileSync(await (await downloading).path(), 'utf8'));
  backup.courses = [{ ...backup.courses[0], id: 'replacement', name: 'Imported' }];
  backup.people = ['Incoming'];
  const recoveryBefore = await readStored(page, 'recovery');
  await page.setInputFiles('.modal input[type=file]', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.locator('.import-preview').waitFor();
  await page.locator('.import-preview .choice').filter({ hasText: 'Replace all my courses' }).click();
  await page.evaluate(() => { window.failImportSave = true; });
  await page.locator('.import-preview button.primary').click();
  await page.getByText('Could not save. Nothing was changed.', { exact: true }).waitFor();
  assert.deepEqual(await readStored(page, 'courses'), before);
  assert.deepEqual(await readStored(page, 'recovery'), recoveryBefore);
  assert.deepEqual(await readStored(page, 'people'), ['Existing']);
  assert.deepEqual(await readStored(page, 'log'), []);
  assert.equal(await page.getByText('Import complete.', { exact: true }).count(), 0);
  assert.equal(await page.locator('.import-preview').count(), 1, 'failed import remains retryable');
  await page.evaluate(() => { window.failImportSave = false; });
  await page.locator('.import-preview button.primary').click();
  await page.getByText('Import complete.', { exact: true }).waitFor();
  assert.deepEqual(await readStored(page, 'courses'), backup.courses);
  assert.deepEqual(await readStored(page, 'people'), ['Incoming']);
  assert.deepEqual((await readStored(page, 'recovery')).courses, before);
  checkErrors();
  console.log('ok  storage: failed save retains draft; aborted import rolls back every record and retries');
  await context.close();
} finally { await browser.close(); }
