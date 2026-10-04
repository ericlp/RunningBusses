import { chromium } from 'playwright';
const b = await chromium.launch();
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: 360, height: 740 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const open = async () => { if ((await p.locator('.details').count()) === 0) await p.locator('.course-main').first().click(); };
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');
await p.click('text=Planera'); await p.click('text=Skapa bana');
await p.click('.sheet .list button >> nth=0');
await p.click('.strip >> text=Spara'); await p.fill('.modal input', 'Testbana'); await p.click('.modal .primary');
await p.waitForSelector('.course');

// progress panel starts at zero
await p.click('.stats-panel summary');
ok((await p.locator('.stats-panel summary').innerText()).includes('0 av'), 'progress shown');

// complete with people, adding them in the dialog
await open(); await p.click('text=Markera som genomförd');
await p.fill('.modal .person-add input', 'Anna'); await p.click('.modal .person-add button');
await p.fill('.modal .person-add input', 'Bo'); await p.click('.modal .person-add button');
await p.click('.modal .chip.check:has-text("Bo")'); // deselect Bo
await p.click('.modal button.primary'); await p.waitForSelector('.status-Completed');
ok(await p.locator('.toast.info').count() === 1, 'undo offered');
ok((await p.locator('.course-main').innerText()).includes('Sprungen av Anna'), 'participants shown on the course');
ok((await p.locator('.stats-panel').innerText()).includes('Anna'), 'person total shown');

// undo restores the open course
await p.click('.toast.info button');
await p.waitForTimeout(300);
ok(await p.locator('.status-Completed').count() === 0, 'undo reverts completion');

// the people list survives a reload and is preselectable
await p.reload(); await p.click('text=Planera'); await p.waitForSelector('.course');
await open(); await p.click('text=Markera som genomförd');
ok(await p.locator('.modal .chip.check:has-text("Bo")').count() === 1, 'people list persisted');
await p.click('.modal .chip.check:has-text("Anna")');
await p.click('.modal button.primary'); await p.waitForSelector('.status-Completed');

// share one course
await open(); await p.click('button:text-is("Dela bana")');
await p.waitForSelector('.toast');
const link = await p.evaluate(() => navigator.clipboard.readText());
ok(link.includes('#sync='), 'single course link copied');
const ctx2 = await b.newContext({ locale: 'sv-SE', viewport: { width: 360, height: 740 } });
const q = await ctx2.newPage();
await q.goto(link); await q.waitForSelector('.import-preview');
ok(await q.locator('.import-preview input[type=radio]').count() === 0, 'partial link cannot replace');
await q.click('.import-preview .primary'); await q.waitForSelector('text=Importen är klar.');
await q.waitForSelector('.course');
ok((await q.locator('.course-main').innerText()).includes('Sprungen av Anna'), 'participants arrive with the course');
console.log('errors', errs);
await b.close(); process.exit(fails || errs.length ? 1 : 0);
