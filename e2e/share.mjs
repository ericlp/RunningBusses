import { chromium } from 'playwright';
const b = await chromium.launch();
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const mk = async (perm) => {
  const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: 360, height: 740 }, permissions: perm ? ['clipboard-read', 'clipboard-write'] : [] });
  return { ctx, p: await ctx.newPage() };
};
const A = await mk(true);
await A.p.goto('http://localhost:4173/'); await A.p.waitForSelector('.badge');
await A.p.click('text=Planera'); await A.p.click('text=Skapa bana');
await A.p.click('.sheet .list button >> nth=0');
await A.p.click('.strip >> text=Spara'); await A.p.click('.modal .primary'); await A.p.waitForTimeout(500);
await A.p.click('[aria-label="Inställningar"]');
await A.p.click('button:text-is("Kopiera länk")');
await A.p.waitForSelector('[role=status]');
const link = await A.p.evaluate(() => navigator.clipboard.readText());
ok(link.includes('#sync='), 'link copied');
ok(link.length < 2000, `link is short (${link.length})`);

// a fresh device opens the link
const B = await mk(false);
await B.p.goto(link); await B.p.waitForSelector('.import-preview');
ok((await B.p.locator('.import-preview').innerText()).includes('Länken innehåller 1 bana'), 'preview shows the shared course');
ok(await B.p.locator('[aria-label="Inställningar"][aria-modal], .modal:not(.import-preview)').count() === 0, 'link opens the dialog directly, not Settings');
ok(!link.includes('#') || !(await B.p.evaluate(() => location.hash)), 'fragment removed from the address bar');
ok(await B.p.locator('.course-main').count() === 0, 'nothing saved before confirming');
await B.p.click('.import-preview .primary'); await B.p.waitForSelector('text=Importen är klar.');
await B.p.waitForSelector('.course-main');
ok(await B.p.locator('.course-main').count() === 1, 'course imported after confirming');
ok(await B.p.locator('.details').count() === 1, 'imported course is opened directly');

// pasting a link into the address bar of the open app
await B.p.click('[aria-label="Inställningar"]');
await B.p.evaluate((l) => { location.hash = new URL(l).hash; }, link);
await B.p.waitForSelector('.import-preview');
ok((await B.p.locator('.import-preview').innerText()).includes('Länken innehåller 1 bana'), 'link opened in a running app is read');
await B.p.click('button:text-is("Avbryt")');

// a broken link only shows a message
const C = await mk(false);
await C.p.goto('http://localhost:4173/#sync=zbroken'); await C.p.waitForSelector('[role=status]');
ok((await C.p.locator('[role=status]').innerText()).includes('trasig'), 'broken link explained');
await b.close(); process.exit(fails);
