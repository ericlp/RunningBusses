import { chromium } from 'playwright';
const b = await chromium.launch();
let bad = 0;
for (const loc of ['sv-SE','en-GB','fr-FR','de-DE']) {
  const ctx = await b.newContext({ locale: loc, viewport: { width: 360, height: 740 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:4173/');
  await p.waitForSelector('.badge');
  const lang = await p.evaluate(() => document.documentElement.lang);
  await p.click('text=/^(Planera|Plan|Planifier)$/');
  const btn = await p.textContent('.sheet button');
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(loc, lang, await p.title(), '|', btn?.trim(), '| overflow', ov);
  if (ov) bad++;
  if (loc === 'sv-SE') {
    await p.click('[aria-label="Inställningar"]');
    await p.selectOption('select', 'fr');
    console.log(' after switch:', await p.evaluate(() => document.documentElement.lang), await p.textContent('.modal h2'));
    await p.reload(); await p.waitForSelector('.badge');
    console.log(' persisted:', await p.evaluate(() => document.documentElement.lang));
  }
  await ctx.close();
}
await b.close(); process.exit(bad);
