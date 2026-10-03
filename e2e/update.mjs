import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'sv-SE', viewport: { width: 360, height: 740 } });
const p = await ctx.newPage();
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
p.on('dialog', d => d.accept());
await p.goto('http://localhost:4173/'); await p.waitForSelector('.badge');
await p.click('text=Planera'); await p.click('text=Skapa bana');
await p.locator('.sheet .list button').first().click();
await p.click('.strip >> text=Spara'); await p.click('.modal .primary'); await p.waitForTimeout(500);
// tamper stored length to simulate older data, then reload so reconcile runs
await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('running-busses', 1); r.onsuccess = () => { const db = r.result; const s = db.transaction('kv','readwrite').objectStore('kv'); const g = s.get('courses'); g.onsuccess = () => { const c = g.result; c[0].legs[0].line.lengthM = 1234; s.put(c,'courses').onsuccess = res; }; }; }));
await p.reload(); await p.waitForSelector('.badge');
await p.waitForSelector('.toast, [role=status]', { timeout: 3000 }).catch(()=>{});
ok(/uppdaterades/.test(await p.locator('body').innerText()), 'open course auto-updated toast');
// complete then unlock -> pinned
await p.click('text=Planera').catch(()=>{}); await p.waitForTimeout(300);
await p.click('.course-main'); await p.click('button:has-text("Markera som genomförd")'); await p.click('.modal button.primary');
await p.waitForTimeout(400); await p.click('button:has-text("Markera som ej genomförd")'); await p.waitForTimeout(400);
ok(await p.locator('.tag:text-is("Äldre data")').count() === 1, 'unlocked course is pinned');
ok(await p.locator('button:has-text("Uppdatera till aktuell data")').count() === 1, 'update button');
await p.click('button:has-text("Uppdatera till aktuell data")');
await p.waitForTimeout(300);
ok(await p.locator('.tag:text-is("Äldre data")').count() === 0, 'pin cleared');
await b.close(); process.exit(fails);
