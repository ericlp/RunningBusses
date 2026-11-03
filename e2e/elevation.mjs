import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { checkPageErrors, fixture, prepareContext, waitLegs } from './setup.mjs';

const browser = await chromium.launch();
const baseURL = `http://localhost:${process.env.E2E_PORT ?? '4173'}`;
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'sv-SE', serviceWorkers: 'block' });
  await prepareContext(context, fixture, { elevation: true });
  await context.addInitScript(() => {
    window.__elevationMarkerPaints = 0;
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fill = function (...args) {
      if (this.fillStyle === '#8237a5') window.__elevationMarkerPaints++;
      return fill.apply(this, args);
    };
  });
  const page = await context.newPage();
  const checkErrors = checkPageErrors(page);
  await page.goto(`${baseURL}/#line=59`);
  await page.waitForSelector('.line-card');
  await page.getByRole('button', { name: 'Visa höjdprofil' }).click();
  await page.waitForSelector('.elevation-chart');
  assert.match(await page.locator('.elevation-stats').innerText(), /10 m/, 'line profile shows measured ascent');
  assert.match(await page.locator('.elevation-source').innerText(), /Copernicus DEM test fixture/);
  const position = page.locator('.elevation-position input');
  const markerPaints = await page.evaluate(() => window.__elevationMarkerPaints);
  for (let step = 0; step < 20; step++) await position.press('ArrowRight');
  assert.equal(await position.inputValue(), '500', 'slider selects the middle of the route');
  assert.equal(await page.locator('.elevation-chart circle').getAttribute('cx'), '160', 'chart selection follows slider position');
  await page.waitForFunction((before) => window.__elevationMarkerPaints > before, markerPaints);

  await page.getByRole('button', { name: 'Planera' }).click();
  await page.getByRole('button', { name: 'Skapa bana' }).click();
  await page.locator('.sheet .list button').first().click();
  await waitLegs(page, 1);
  await page.locator('.strip button.primary').click();
  await page.locator('.modal input').fill('Höjdtest');
  await page.locator('.modal button.primary').click();
  await page.waitForSelector('.course');
  await page.waitForSelector('.course .details');
  await page.getByRole('button', { name: 'Visa höjdprofil' }).click();
  await page.waitForSelector('.course .elevation-chart');
  assert.match(await page.locator('.course .elevation-stats').innerText(), /10 m/, 'course profile uses the saved route snapshot');
  assert.equal(await page.locator('.course .elevation-source').count(), 1);
  checkErrors();
  await context.close();
  console.log('ok  elevation: line and course profiles, attribution, slider, and map marker');
} finally {
  await browser.close();
}
