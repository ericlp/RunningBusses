import { chromium } from 'playwright';
const b = await chromium.launch();
const errs = [];
let bad = 0;
const check = (ok, m) => { console.log(ok ? 'ok  ' : 'FAIL', m); if (!ok) bad++; };
for (const [name, vp] of [['phone', { width: 360, height: 740 }], ['desktop', { width: 1280, height: 800 }]]) {
  const ctx = await b.newContext({ viewport: vp, locale: 'sv-SE' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto('http://localhost:4173/');
  await p.waitForSelector('.list button');
  await p.click('text=Planera');
  await p.click('text=Skapa bana');
  await p.waitForSelector('.strip');
  await p.fill('.strip-head input', 'Testbana');
  // depth-first: take the first option, undo and try the next one when it dead-ends before 3 legs
  const dfs = async (depth) => {
    if (depth === 3) return true;
    const cnt = await p.locator('.list button').count();
    for (let k = 0; k < Math.min(cnt, 6); k++) {
      await p.locator('.list button').nth(k).click();
      await p.waitForTimeout(150);
      if (await dfs(depth + 1)) return true;
      await p.click('text=Ångra senaste');
      await p.waitForTimeout(150);
    }
    return false;
  };
  await dfs(0);
  const n = await p.locator('.leg-card').count();
  console.log(name, 'legs built', n);
  check(n >= 3, `${name}: built at least 3 legs`);
  await p.click('.strip >> text=Spara');
  await p.waitForSelector('.course');
  const before = await p.textContent('.course .total');

  // edit: remove last, then first
  if ((await p.locator('button:text-is("Redigera")').count()) === 0) await p.click('.course-main');
  await p.click('button:text-is("Redigera")');
  await p.waitForSelector('.strip');
  await p.locator('.leg-card .x[aria-label*="slutet"]').click();
  check((await p.locator('.leg-card').count()) === n - 1, `${name}: removed from end`);
  await p.locator('.leg-card .x[aria-label*="början"]').click();
  check((await p.locator('.leg-card').count()) === n - 2, `${name}: removed from start`);
  // reverse and back
  const startBefore = await p.textContent('.start b');
  await p.click('text=Vänd riktning');
  const startRev = await p.textContent('.start b');
  check(startBefore !== startRev, `${name}: reverse changes start (${startBefore} -> ${startRev})`);
  await p.click('text=Vänd riktning');
  await p.click('.strip >> text=Spara ändringar');
  await p.waitForSelector('.course');
  const legsAfter = await p.locator('.course .seq .badge').count();
  check(legsAfter === n - 2, `${name}: edit saved (${legsAfter} legs)`);

  // persists after reload
  await p.reload();
  await p.click('text=Planera');
  await p.waitForSelector('.course');
  check((await p.locator('.course .seq .badge').count()) === n - 2, `${name}: edit persisted`);

  // re-add to make >=2 legs for splitting: use undo-less approach — split needs >=2 legs
  if ((await p.locator('button:text-is("Redigera")').count()) === 0) await p.click('.course-main');
  await p.click('button:text-is("Redigera")');
  await p.waitForSelector('.strip');
  if ((await p.locator('.list button').count()) > 0) await p.click('.list button >> nth=0');
  const legsNow = await p.locator('.leg-card').count();
  console.log(name, 'legs before split', legsNow);
  check(legsNow >= 2, `${name}: has 2+ legs to split`);
  await p.screenshot({ path: `.cache/${name}-edit.png` });
  await p.locator('.split').first().click();
  await p.waitForSelector('.modal');
  await p.screenshot({ path: `.cache/${name}-split.png` });
  await p.click('.modal button:text-is("Dela")');
  await p.waitForSelector('.course');
  const count = await p.locator('.course').count();
  check(count === 2, `${name}: split gives 2 courses (${count})`);

  // completed courses cannot be edited
  await p.locator('.course-main').first().click();
  if ((await p.locator('text=Markera som genomförd').count()) === 0) await p.locator('.course-main').first().click();
  await p.click('text=Markera som genomförd');
  await p.click('.modal button.primary');
  await p.waitForSelector('.status-Completed');
  check((await p.locator('text=Redigera').count()) === 0, `${name}: no edit on completed course`);
  check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${name}: no horizontal overflow`);
  await ctx.close();
}
console.log('errors', errs, 'failures', bad);
await b.close();
