import { chromium } from 'playwright';
const b = await chromium.launch();
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: 360, height: 740 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');
await p.click('text=Planera');
const total = async () => Number((await p.locator('.stats-panel summary').innerText()).match(/av (\d+)/)[1]);
const base = await total();
const group = '.modal [role=group][aria-label="Räknas i framsteg"]';
const open = async () => { await p.click('[aria-label="Inställningar"]'); await p.waitForSelector(group); };
const close = () => p.click('.modal [aria-label="Stäng"]');

await open();
ok((await p.locator(`${group} [aria-pressed=true]`).count()) === 1, 'only one category counted by default');
await p.click(`${group} button:text-is("Spårvagn")`);
await close();
const withTram = await total();
ok(withTram > base, `adding trams raises the total (${base} -> ${withTram})`);

await p.reload(); await p.click('text=Planera');
ok((await total()) === withTram, 'choice survives a reload');

await open();
await p.click(`${group} button:text-is("Spårvagn")`);
await p.click(`${group} button[aria-pressed=true]`);
ok((await p.locator(`${group} [aria-pressed=true]`).count()) === 1, 'the last category cannot be removed');
await close();
ok((await total()) === base, 'back to the default total');
console.log('errors', errs);
await b.close(); process.exit(fails || errs.length ? 1 : 0);
