import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readStored } from './data-fixture.mjs';
import { checkPageErrors, createCourse, prepareContext, waitLegs } from './setup.mjs';

const browser = await chromium.launch();
try {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ locale: 'en-GB', viewport: { width, height: 740 }, serviceWorkers: 'block' });
    await prepareContext(context);
    const first = await context.newPage();
    const second = await context.newPage();
    const errors = [checkPageErrors(first), checkPageErrors(second)];
    await first.goto('http://localhost:4173/');
    await createCourse(first, 'Original');
    await first.waitForFunction(async () => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('running-busses', 1);
        request.onsuccess = () => resolve(request.result);
      });
      const draft = await new Promise((resolve) => {
        const tx = db.transaction('kv');
        const request = tx.objectStore('kv').get('draft');
        request.onsuccess = () => resolve(request.result);
        tx.oncomplete = () => db.close();
      });
      return draft === null;
    });
    const before = await readStored(first, 'courses');
    await second.goto('http://localhost:4173/#mode=plan');
    await second.locator('.course').waitFor();
    const revision = await readStored(first, 'user.revision');
    assert.deepEqual(await readStored(second, 'user.revision'), revision, 'opening a tab does not write the draft');

    if (await first.locator('.course-main').getAttribute('aria-pressed') !== 'true') await first.locator('.course-main').click();
    await first.getByRole('button', { name: 'Edit', exact: true }).click();
    await waitLegs(first, 1);
    await first.waitForFunction(() => document.querySelector('.strip'));
    // Read after an ordered IndexedDB transaction, waiting for the saved edit draft.
    await first.waitForFunction(async () => {
      const request = indexedDB.open('running-busses', 1);
      return await new Promise((resolve) => {
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('kv');
          const get = tx.objectStore('kv').get('draft');
          get.onsuccess = () => resolve(Boolean(get.result?.editingId));
          tx.oncomplete = () => db.close();
        };
      });
    });
    const winningDraft = await readStored(first, 'draft');
    await second.getByRole('button', { name: 'Create course', exact: true }).click();
    await second.locator('.sheet .list button').first().click();
    await waitLegs(second, 1);
    await second.locator('.write-conflict').waitFor();
    assert.deepEqual(await readStored(second, 'draft'), winningDraft);
    await second.locator('.strip button.primary').click();
    await second.locator('.modal input').fill('Unsaved loser');
    await second.locator('.modal button.primary').click();
    await second.locator('.modal').waitFor({ state: 'detached' });
    assert.equal(await second.locator('.leg-card').count(), 1, 'rejected save retains local draft');
    assert.deepEqual(await readStored(first, 'courses'), before);
    assert.deepEqual(await readStored(first, 'draft'), winningDraft);
    await second.clock.install();
    await second.clock.fastForward(10000);
    assert.equal(await second.locator('.write-conflict').count(), 1, 'conflict warning does not expire');
    second.once('dialog', (dialog) => dialog.dismiss());
    await second.getByRole('button', { name: 'Reload saved data', exact: true }).click();
    assert.equal(await second.locator('.leg-card').count(), 1, 'cancelled reload keeps local edits');
    await first.getByRole('button', { name: 'Close and keep the draft', exact: true }).click();
    second.once('dialog', (dialog) => dialog.accept());
    await second.getByRole('button', { name: 'Reload saved data', exact: true }).click();
    await second.locator('.course').waitFor();
    assert.equal(await second.locator('.write-conflict').count(), 0);
    await second.getByRole('button', { name: 'Continue editing "Original"', exact: true }).click();
    await waitLegs(second, 1);
    await second.locator('.strip button.primary').click();
    await second.locator('.modal input').fill('Recovered');
    await second.locator('.modal button.primary').click();
    await second.locator('.course').filter({ hasText: 'Recovered' }).waitFor();
    assert.equal((await readStored(second, 'courses'))[0].name, 'Recovered');
    if (await first.locator('.course-main').getAttribute('aria-pressed') !== 'true') await first.locator('.course-main').click();
    first.once('dialog', (dialog) => dialog.accept());
    await first.getByRole('button', { name: 'Delete', exact: true }).click();
    await first.locator('.write-conflict').waitFor();
    assert.equal((await readStored(first, 'courses'))[0].name, 'Recovered', 'stale delete cannot remove the newer course');
    assert.equal(await second.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    errors.forEach((check) => check());
    await context.close();
    console.log(`ok  ${width}px: stale draft/course rejected, local edits retained, explicit reload recovery`);
  }
} finally { await browser.close(); }
