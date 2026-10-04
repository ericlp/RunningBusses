import { chromium } from 'playwright';
const b = await chromium.launch();
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');

// filters persist across a reload
await p.click('button.tool:has-text("Filter")');
await p.locator('.filter-panel .chip:text-is("Expressbuss")').click();
await p.reload(); await p.waitForSelector('.badge');
await p.click('button.tool:has-text("Filter")');
ok((await p.locator('.filter-panel .chip:text-is("Expressbuss")').getAttribute('aria-pressed')) === 'true', 'category filter survives reload');

// selecting a line writes it to the hash, and a link to it reopens the selection
await p.locator('.sheet .list button').first().click();
await p.waitForTimeout(300);
const url = p.url();
ok(/#line=/.test(url), `selected line is in the hash (${url.split('#')[1]})`);
const p2 = await ctx.newPage();
await p2.goto(url); await p2.waitForSelector('.badge');
await p2.waitForTimeout(500);
ok(/#line=/.test(p2.url()), 'line link keeps its hash after load');
ok((await p2.locator('.sheet').innerText()).length > 0 && (await p2.locator('[aria-pressed="true"]:text-is("Planera")').count()) === 0, 'line link opens in browse mode');

// plan mode is also linkable
await p.click('text=Planera');
await p.waitForTimeout(200);
ok(/mode=plan/.test(p.url()), 'plan mode is in the hash');
const p3 = await ctx.newPage();
await p3.goto(p.url()); await p3.waitForSelector('.sheet');
ok((await p3.locator('button[aria-pressed="true"]:has-text("Planera")').count()) === 1, 'plan link opens in plan mode');

// a link pasted into an open tab only changes the hash
await p.goto('http://localhost:4173/#mode=browse'); await p.waitForSelector('.badge');
await p.evaluate(() => { location.hash = 'line=34'; });
await p.waitForTimeout(500);
ok(/Hjuvik/.test(await p.locator('.sheet').innerText()), 'hash change in an open tab selects the line');
await b.close(); process.exit(fails);
