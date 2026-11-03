import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/refresh-transit-data.yml', 'utf8');
const notification = workflow.slice(workflow.indexOf('      - name: Notify that the refresh needs review'));
const script = notification.split('        run: |\n')[1].split('\n')
  .map((line) => line.replace(/^          /, '')).join('\n');

describe('monthly refresh review workflow', () => {
  it('uses failure-only artifact and notification steps with an explicit public-file allowlist', () => {
    const artifact = workflow.slice(workflow.indexOf('      - name: Save review evidence on failure'),
      workflow.indexOf('      - name: Notify that the refresh needs review'));
    expect(artifact).toContain('if: failure()');
    expect(artifact).toContain('include-hidden-files: true');
    expect(artifact).toContain('retention-days: 30');
    expect(artifact).toContain('.cache/route-audit.json');
    expect(artifact).toContain('.cache/vt/stop_times.txt');
    expect(artifact).toContain('.cache/vt/shapes.txt');
    expect(artifact).toContain('transit-build.log');
    expect(artifact).toContain('transit-validation.log');
    expect(artifact).not.toMatch(/\.env|\*|vt\.zip/);
    expect(notification).toContain('if: failure()');
    expect(notification).toContain('shell: bash');
    expect(workflow).toContain('issues: write');
  });

  it.each(['', '123'])('notifies by creating or commenting without executing any other GitHub action (%s)', (number) => {
    const directory = mkdtempSync(join(tmpdir(), 'transit-workflow-'));
    try {
      const log = join(directory, 'calls.jsonl');
      writeFileSync(join(directory, 'gh'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(args) + '\\n');
if (args[0] !== 'issue') process.exit(91);
if (args[1] === 'list') {
  if (process.env.FAIL_LIST === '1') process.exit(92);
  console.log(process.env.ISSUE_NUMBER);
} else if (!['create', 'comment'].includes(args[1])) process.exit(93);
`, { mode: 0o755 });
      const env = {
        ...process.env, PATH: `${directory}:${process.env.PATH}`,
        RUNNER_TEMP: directory, CALL_LOG: log, ISSUE_NUMBER: number,
        REVIEW_OWNER: 'test-owner', REVIEW_RUN_URL: 'https://github.com/example/repo/actions/runs/123',
      };
      const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], { env, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      const calls: string[][] = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      expect(calls).toHaveLength(2);
      expect(calls[0].slice(0, 2)).toEqual(['issue', 'list']);
      expect(calls[1].slice(0, number ? 3 : 2)).toEqual(number ? ['issue', 'comment', number] : ['issue', 'create']);
      const body = readFileSync(join(directory, 'transit-review-notification.md'), 'utf8');
      expect(body).toContain('@test-owner');
      expect(body).toContain(env.REVIEW_RUN_URL);
      expect(body).toContain('allow_removal=true only after confirmation');
      const failure = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
        env: { ...env, FAIL_LIST: '1' }, encoding: 'utf8',
      });
      expect(failure.status).toBe(92);
      expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(3);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
