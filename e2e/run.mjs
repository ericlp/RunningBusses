// Runs every browser journey against `vite preview`. Build first: npm run build && npm run e2e
import { spawn, spawnSync } from 'node:child_process';

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
let failed = 0;
for (const f of ['courses', 'editing', 'backup', 'share', 'filters', 'links', 'update', 'people', 'history', 'status', 'i18n', 'a11y']) {
  console.log(`\n== ${f}`);
  const r = spawnSync('node', [`e2e/${f}.mjs`], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
server.kill();
console.log(failed ? `\n${failed} journey(s) failed` : '\nall journeys passed');
process.exit(failed ? 1 : 0);
