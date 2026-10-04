import { chromium } from 'playwright';
const b = await chromium.launch();
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: 360, height: 740 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const open = async () => { if ((await p.locator('.details').count()) === 0) await p.locator('.course-main').first().click(); };
p.on('dialog', (d) => d.accept());
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');
await p.click('text=Planera'); await p.click('text=Skapa bana');
await p.click('.sheet .list button >> nth=0');
await p.click('.strip >> text=Spara'); await p.fill('.modal input', 'Loggbana'); await p.click('.modal .primary');
await p.waitForSelector('.course');

// navigate link
await open();
await p.click('.details button:text-is("Navigera till start")');
const nav = await p.locator('.details a:text-is("Google Maps")').getAttribute('href');
ok(/google\.com\/maps\/dir\/.*destination=5\d\.\d+,1\d\.\d+/.test(nav ?? ''), 'navigate link has coordinates');

// history: complete, then uncomplete (undo toast dismissed by completing flow)
await p.click('text=Markera som genomförd'); await p.click('.modal button.primary'); await p.waitForSelector('.status-Completed');
await p.waitForSelector('.toast.info', { state: 'detached', timeout: 15000 });
await open(); await p.click('text=Markera som ej genomförd');
await p.waitForTimeout(300);
await p.click('.stats-panel summary');
const hist = await p.locator('.history').innerText();
ok(hist.includes('Genomförd') && hist.includes('Inte längre genomförd'), 'history lists both events');

// history survives deleting the course and a reload
await p.reload(); await p.click('text=Planera'); await p.waitForSelector('.course');
await p.click('.stats-panel summary');
ok((await p.locator('.history').innerText()).includes('Loggbana'), 'history persisted');

// share from the line card: select the course's line on the browse map
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');
await p.click('.list li:has-text("Planerad") button');
await p.waitForSelector('.line-card');
await p.focus('.leaflet-container');
let labels = 0;
for (let i = 0; i < 6 && !labels; i++) { await p.keyboard.press('+'); await p.waitForTimeout(500); labels = await p.locator('.leaflet-tooltip.stop-label').count(); }
ok(labels > 0, 'stop names shown when zoomed in');
await p.click('.line-card button:text-is("Dela bana")');
await p.waitForSelector('.toast');
const link = await p.evaluate(() => navigator.clipboard.readText());
ok(link.includes('#sync='), 'line card shares the course');
console.log('errors', errs);
await b.close(); process.exit(fails || errs.length ? 1 : 0);
