import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

export const journeys = ['courses', 'editing', 'backup', 'share', 'gpx-share', 'card', 'filters', 'regional', 'ferries', 'category-data', 'links', 'update', 'people', 'history', 'status', 'progress', 'i18n', 'a11y', 'tiles', 'drafts', 'multi-tab', 'storage-failures', 'viewport'];

export function options(args, defaultWorkers = '2') {
  const workerArgs = args.filter((arg) => arg.startsWith('--workers='));
  const workers = workerArgs[0]?.slice('--workers='.length) ?? defaultWorkers;
  if (workerArgs.length > 1 || !/^[1-4]$/.test(workers)) throw new Error('Use --workers=1..4 (default: 2).');
  const selected = args.filter((arg) => !arg.startsWith('--workers='));
  if (selected.some((name) => !journeys.includes(name))) throw new Error(`Unknown journey. Available: ${journeys.join(', ')}`);
  return { workers: Number(workers), selected: selected.length ? [...new Set(selected)] : journeys };
}

export async function runBatch(names, workers, execute) {
  const pending = [...names];
  const results = [];
  await Promise.all(Array.from({ length: Math.min(workers, names.length) }, async () => {
    while (pending.length) {
      const name = pending.shift();
      results.push({ name, ...await execute(name) });
    }
  }));
  return results;
}

async function waitReady(server) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error('Preview exited before becoming ready (is port 4173 already in use?).');
    try {
      const response = await fetch('http://localhost:4173/', { signal: AbortSignal.timeout(500) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch (error) {
      if (error.name !== 'TypeError' && error.name !== 'TimeoutError') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Preview did not become ready within 10 seconds.');
}

async function main() {
  const { workers, selected } = options(process.argv.slice(2), process.env.E2E_WORKERS ?? '2');
  // Refuse an existing listener rather than accidentally testing another build.
  try {
    const response = await fetch('http://localhost:4173/', { signal: AbortSignal.timeout(500) });
    await response.body?.cancel();
    throw new Error('Port 4173 is already in use. Stop that preview before running journeys.');
  } catch (error) {
    if (error.name !== 'TypeError') throw error;
  }
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const children = new Set();
  let stopping = false;
  const stop = () => {
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    server.kill('SIGTERM');
  };
  const interrupted = (signal) => { stop(); process.exitCode = signal === 'SIGINT' ? 130 : 143; };
  const onInterrupt = () => interrupted('SIGINT');
  const onTerminate = () => interrupted('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  const started = performance.now();
  try {
    await waitReady(server);
    console.log(`Running ${selected.length} journeys with ${workers} worker(s).`);
    const results = await runBatch(selected, workers, (name) => new Promise((resolve, reject) => {
      if (stopping) { resolve({ failed: true, seconds: 0 }); return; }
      const began = performance.now();
      const child = spawn(process.execPath, [`e2e/${name}.mjs`], { stdio: ['ignore', 'pipe', 'pipe'] });
      children.add(child);
      let output = '';
      let timedOut = false;
      let forceStop;
      child.stdout.on('data', (data) => { output += data; });
      child.stderr.on('data', (data) => { output += data; });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        forceStop = setTimeout(() => child.kill('SIGKILL'), 5000);
      }, 120000);
      child.once('error', reject);
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        clearTimeout(forceStop);
        children.delete(child);
        const seconds = (performance.now() - began) / 1000;
        const failed = code !== 0 || timedOut;
        console.log(`\n== ${name} (${seconds.toFixed(1)}s${failed ? ', FAILED' : ''})\n${output.trimEnd()}`);
        if (timedOut) console.error(`${name}: exceeded the 120-second journey timeout`);
        else if (signal) console.error(`${name}: terminated by ${signal}`);
        resolve({ failed, seconds });
      });
    }));
    const failed = results.filter((r) => r.failed);
    console.log('\nJourney timings (slowest first):');
    for (const r of results.sort((a, b) => b.seconds - a.seconds)) console.log(`${r.name.padEnd(18)} ${r.seconds.toFixed(1)}s${r.failed ? ' FAILED' : ''}`);
    console.log(`\n${failed.length ? `${failed.length} journey(s) failed` : 'all journeys passed'} in ${((performance.now() - started) / 1000).toFixed(1)}s`);
    if (failed.length) process.exitCode = 1;
  } finally {
    stop();
    if (server.exitCode === null && server.signalCode === null) {
      const forceStop = setTimeout(() => server.kill('SIGKILL'), 5000);
      try { await once(server, 'exit'); }
      finally { clearTimeout(forceStop); }
    }
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
