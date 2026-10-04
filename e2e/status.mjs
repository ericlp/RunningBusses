import { chromium } from 'playwright';
const b = await chromium.launch();
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: 360, height: 740 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');
ok(await p.locator('.legend').count() === 1, 'legend shown in by-status mode');
ok((await p.locator('.legend span').count()) === 3, 'legend has three statuses');
const colours = await p.evaluate(() => ['unplanned', 'planned', 'done'].map((n) => getComputedStyle(document.documentElement).getPropertyValue(`--status-${n}`).trim()));
ok(new Set(colours).size === 3 && colours.every(Boolean), `three distinct status colours (${colours})`);
ok(await p.locator('.list .dot').count() > 0, 'list rows carry a status dot');

// plan one line, then its row shows the planned dot and the colour differs from unplanned
await p.click('text=Planera'); await p.click('text=Skapa bana');
await p.click('.sheet .list button >> nth=0');
await p.click('.strip >> text=Spara'); await p.fill('.modal input', 'Statusbana'); await p.click('.modal .primary');
await p.waitForSelector('.course');
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');
const dot = (cls) => p.locator(`.list .${cls}`).first().evaluate((e) => getComputedStyle(e).backgroundColor);
ok((await dot('dot-NotCompleted')) !== (await dot('dot-NotPlanned')), 'planned and unplanned dots differ');

// rainbow mode has no status legend
await p.click('[aria-label="Inställningar"]');
await p.selectOption('.modal select >> nth=1', { label: 'Regnbåge (en färg per linje)' }).catch(async () => {
  const sel = p.locator('.modal select', { has: p.locator('option', { hasText: 'Regnbåge' }) });
  await sel.selectOption({ label: 'Regnbåge (en färg per linje)' });
});
await p.click('[aria-label="Stäng"]');
ok(await p.locator('.legend').count() === 0, 'no legend in rainbow mode');
console.log('errors', errs);
await b.close(); process.exit(fails || errs.length ? 1 : 0);
