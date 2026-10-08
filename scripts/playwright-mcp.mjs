import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const executable = chromium.executablePath();
if (!existsSync(executable)) {
  throw new Error('Chromium is missing. Run npx playwright install chromium first.');
}

const server = spawn('npx', [
  '-y', '@playwright/mcp@latest',
  '--headless', '--isolated',
  '--executable-path', executable,
  '--output-dir', '.cache/playwright-mcp',
], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
});

server.on('error', (error) => {
  console.error(`Cannot start Playwright MCP: ${error.message}`);
  process.exitCode = 1;
});
server.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
