import { chromium } from 'playwright';
const b = await chromium.launch();
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: 360, height: 740 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');
await p.click('text=Planera'); await p.click('text=Skapa bana');
await p.click('.sheet .list button >> nth=0');
await p.click('.strip >> text=Spara'); await p.fill('.modal input', 'Navbana'); await p.click('.modal .primary');
await p.waitForSelector('.details');

// default: ask which provider
await p.click('.details button:text-is("Navigera till start")');
const google = await p.locator('.details a:text-is("Google Maps")').getAttribute('href');
const vt = p.locator('.details a:has-text("Västtrafik till")');
ok(/^https:\/\/www\.google\.com\/maps\/dir\//.test(google ?? ''), 'google option links to Google Maps');
const stop = (await vt.innerText()).replace('Västtrafik till ', '');
ok(stop.length > 0, `västtrafik option names the stop (${stop})`);
ok((await vt.getAttribute('href')).startsWith('https://www.vasttrafik.se/reseplaneraren'), 'västtrafik option links to the planner');
await Promise.all([ctx.waitForEvent('page').then((x) => x.close()), vt.click()]);
ok((await p.evaluate(() => navigator.clipboard.readText())) === stop, 'stop name copied to the clipboard');
ok((await p.locator('.details [role=status]').innerText()).includes(stop), 'copy is confirmed');

// preferred provider in Settings: the chip links directly
await p.click('[aria-label="Inställningar"]');
await p.selectOption('.modal select:has(option:text-is("Fråga varje gång"))', { label: 'Västtrafik' });
await p.click('.modal [aria-label="Stäng"]');
ok((await p.locator('.details a:text-is("Navigera till start")').getAttribute('href')).includes('vasttrafik.se'), 'preferred västtrafik opens directly');
await p.reload(); await p.click('text=Planera'); await p.click('.course-main');
ok(await p.locator('.details a:text-is("Navigera till start")').count() === 1, 'preference survives a reload');
console.log('errors', errs);
await b.close(); process.exit(fails || errs.length ? 1 : 0);
