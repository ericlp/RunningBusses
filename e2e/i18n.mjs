import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { checkPageErrors, prepareContext } from './setup.mjs';

const browser = await chromium.launch();
try {
  for (const [locale, language, create, title] of [
    ['sv-SE', 'sv', 'Skapa bana', 'Vill du jaga bussar?'],
    ['en-GB', 'en', 'Create course', 'Do you wanna chase buses?'],
    ['fr-FR', 'fr', 'Créer un parcours', 'Envie de courir après les bus ?'],
    ['de-DE', 'sv', 'Skapa bana', 'Vill du jaga bussar?'],
  ]) {
    const context = await browser.newContext({ locale, viewport: { width: 360, height: 740 }, serviceWorkers: 'block' });
    await prepareContext(context);
    const page = await context.newPage();
    const checkErrors = checkPageErrors(page);
    await page.goto('http://localhost:4173/');
    await page.waitForSelector('.badge');
    assert.equal(await page.locator('html').getAttribute('lang'), language);
    assert.equal(await page.title(), title);
    await page.getByRole('button', { name: /^(Planera|Plan|Planifier)$/ }).click();
    assert.equal(await page.getByRole('button', { name: create, exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (locale === 'sv-SE') {
      await page.click('[aria-label="Inställningar"]');
      await page.locator('.modal select').first().selectOption('fr');
      await page.waitForFunction(() => document.documentElement.lang === 'fr');
      assert.equal(await page.locator('.modal h2').innerText(), 'Réglages');
      assert.equal(await page.title(), 'Envie de courir après les bus ?');
      await page.reload();
      await page.waitForSelector('.sheet');
      assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
      assert.equal(await page.getByRole('button', { name: 'Créer un parcours', exact: true }).count(), 1);
      assert.equal(await page.evaluate(() => localStorage.getItem('lang')), 'fr');
    }
    checkErrors();
    await context.close();
    console.log(`ok  ${locale}: language, translated controls, title and preference persistence`);
  }
} finally { await browser.close(); }
