import { chromium } from 'playwright';
import { checkPageErrors, prepareContext } from './setup.mjs';
const b = await chromium.launch();
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
await prepareContext(ctx);
const p = await ctx.newPage();
const checks = [checkPageErrors(p)];
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');

// filters persist across a reload
await p.click('button.tool:has-text("Filter")');
await p.locator('.filter-panel .chip:text-is("Expressbuss")').click();
await p.reload(); await p.waitForSelector('.badge');
await p.click('button.tool:has-text("Filter")');
ok((await p.locator('.filter-panel .chip:text-is("Expressbuss")').getAttribute('aria-pressed')) === 'true', 'category filter survives reload');

// selecting a line writes it to the hash, and a link to it reopens the selection
await p.locator('.sheet .list button').first().click();
await p.waitForSelector('.line-card');
const url = p.url();
ok(/#line=/.test(url), `selected line is in the hash (${url.split('#')[1]})`);
const p2 = await ctx.newPage();
checks.push(checkPageErrors(p2));
await p2.goto(url); await p2.waitForSelector('.badge');
await p2.waitForSelector('.line-card');
ok(/#line=/.test(p2.url()), 'line link keeps its hash after load');
ok((await p2.locator('.sheet').innerText()).length > 0 && (await p2.locator('[aria-pressed="true"]:text-is("Planera")').count()) === 0, 'line link opens in browse mode');

// plan mode is also linkable
await p.click('text=Planera');
await p.waitForFunction(() => location.hash.includes('mode=plan'));
ok(/mode=plan/.test(p.url()), 'plan mode is in the hash');
const p3 = await ctx.newPage();
checks.push(checkPageErrors(p3));
await p3.goto(p.url()); await p3.waitForSelector('.sheet');
ok((await p3.locator('button[aria-pressed="true"]:has-text("Planera")').count()) === 1, 'plan link opens in plan mode');

// a link pasted into an open tab only changes the hash
await p.goto('http://localhost:4173/#mode=browse'); await p.waitForSelector('.badge');
await p.evaluate(() => { location.hash = 'line=34'; });
await p.waitForFunction(() => document.querySelector('.line-card .name')?.textContent.includes('Hjuvik'));
ok(/Hjuvik/.test(await p.locator('.sheet').innerText()), 'hash change in an open tab selects the line');

// Back returns to the previous selection
const back = await ctx.newPage();
checks.push(checkPageErrors(back));
await back.goto('http://localhost:4173/'); await back.waitForSelector('.badge');
const rows = back.locator('.sheet .list button');
await rows.nth(0).click(); await back.waitForSelector('.line-card');
const first = back.url().split('#')[1];
await rows.nth(1).click();
await back.waitForFunction((first) => location.hash.slice(1) !== first, first);
const second = back.url().split('#')[1];
ok(first && second && first !== second, `two selections give two hashes (${first}, ${second})`);
await back.goBack();
await back.waitForFunction((first) => location.hash.slice(1) === first, first);
ok(back.url().split('#')[1] === first, 'Back returns to the previous line');
ok(await back.locator('.line-card, .card').count() > 0, 'previous line is selected again');
await back.goForward();
await back.waitForFunction((second) => location.hash.slice(1) === second, second);
ok(back.url().split('#')[1] === second, 'Forward returns to the next line');
for (const check of checks) check();
await b.close(); process.exitCode = fails ? 1 : 0;
