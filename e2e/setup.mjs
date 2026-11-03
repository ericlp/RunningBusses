import assert from 'node:assert/strict';
import { serveFixture } from './data-fixture.mjs';

const line = (key, number, category, from, to, a, b, lengthM) => ({
  key, number, label: number, category, tags: [], from, to, via: [from, to],
  coordinates: [a, b], viaAt: [a, b], lengthM,
});

export const fixture = {
  schemaVersion: 1, feedVersion: 'browser-test', referenceDate: '20261028', generatedAt: '2026-10-31T00:00:00Z',
  lines: [
    line('59', '59', 'stadsbuss', 'Start', 'Second', [11.97, 57.7], [11.98, 57.7], 1000),
    line('60', '60', 'stadsbuss', 'Second', 'Third', [11.98, 57.7], [11.99, 57.7], 1100),
    line('61', '61', 'stadsbuss', 'Third', 'Hjuvik', [11.99, 57.7], [12, 57.7], 1200),
    line('34', '34', 'stadsbuss', 'Hjuvik', 'Finish', [12, 57.7], [12.01, 57.7], 1300),
    line('62', '62', 'stadsbuss', 'Distant start', 'Distant end', [13.95, 58.4], [13.97, 58.4], 1600),
    line('x1', 'X1', 'express', 'Express start', 'Express end', [11.97, 57.71], [11.98, 57.71], 1800),
    line('90', '90', 'industri', 'Factory start', 'Factory end', [11.97, 57.72], [11.98, 57.72], 900),
    line('tram1', '1', 'tram', 'Tram start', 'Tram end', [11.97, 57.73], [11.98, 57.73], 1400),
  ],
};

const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

export async function prepareContext(context, dataset = fixture, options = {}) {
  await serveFixture(context, dataset, options);
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: tile }));
  await context.addInitScript(() => localStorage.setItem('rb.panSpeed', 'off'));
}

export function checkPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return () => assert.deepEqual(errors, [], 'journey must not produce browser errors');
}

export const waitLegs = (page, count) => page.waitForFunction(
  (count) => document.querySelectorAll('.leg-card').length === count, count);

export async function createCourse(page, name = 'Testbana') {
  await page.getByRole('button', { name: /^(Planera|Plan|Planifier)$/ }).click();
  await page.getByRole('button', { name: /^(Skapa bana|Create course|Créer un parcours)$/ }).click();
  await page.locator('.sheet .list button').first().click();
  await waitLegs(page, 1);
  await page.locator('.strip button.primary').click();
  await page.locator('.modal input').fill(name);
  await page.locator('.modal button.primary').click();
  await page.waitForSelector('.course');
}
