import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const URL = process.env.E2E_URL ?? 'http://localhost:4173/';
const b = await chromium.launch();
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

for (const [w, h, scheme] of [[360, 740, 'light'], [360, 740, 'dark'], [1280, 800, 'light']]) {
  const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: w, height: h }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForSelector('.badge');
  const tooSmall = () => p.evaluate(() =>
    [...document.querySelectorAll('button,input,select,label.chip')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 43.5 || r.width < 43.5) && !e.closest('.leaflet-control-container') && !e.hidden; })
      .map((e) => `${e.tagName}.${e.className}:${(e.innerText || e.getAttribute('aria-label') || '').slice(0, 20)}`));
  const check = async (label) => {
    const axe = await new AxeBuilder({ page: p }).exclude('.leaflet-container').analyze();
    const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    ok(bad.length === 0, `${w}px ${scheme} ${label}: axe ${bad.map((v) => v.id + '×' + v.nodes.length).join(',')}`);
    const small = await tooSmall();
    ok(small.length === 0, `${w}px ${scheme} ${label}: touch targets ${small.join(' | ')}`);
  };
  await check('browse');
  await p.click('text=Filter');
  await check('filters');
  await p.click('text=Filter');
  await p.click('text=Planera');
  await p.click('text=Skapa bana');
  await p.locator('.sheet .list button').first().click();
  await check('build');
  await p.click('[aria-label="Inställningar"]');
  await check('settings');
  // keyboard: Tab reaches a visible focus ring
  await p.keyboard.press('Escape');
  await p.keyboard.press('Tab');
  const outline = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  ok(outline !== 'none', `${w}px ${scheme}: focus outline visible`);
  await ctx.close();
}
await b.close();
process.exit(fails ? 1 : 0);
