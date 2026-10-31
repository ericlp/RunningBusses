import { describe, expect, it } from 'vitest';
import { journeys, options, runBatch } from './run.mjs';
import { spawnSync } from 'node:child_process';

describe('browser journey runner', () => {
  it('defaults to the complete suite and accepts a bounded worker override', () => {
    expect(options([])).toEqual({ workers: 2, selected: journeys });
    expect(options(['--workers=1', 'backup', 'courses', 'backup'])).toEqual({ workers: 1, selected: ['backup', 'courses'] });
    expect(options([], '3').workers).toBe(3);
    for (const value of ['0', '5', '-1', '2.5', 'two', '']) expect(() => options([`--workers=${value}`])).toThrow();
    expect(() => options(['unknown'])).toThrow(/Unknown journey/);
    expect(() => options(['--workers=1', '--workers=2'])).toThrow();
  });

  it('bounds concurrent work and executes every journey once, including after failures', async () => {
    const releases = new Map();
    const started = [];
    let active = 0;
    let maximum = 0;
    const finished = runBatch(['a', 'b', 'c'], 2, async (name) => {
      started.push(name);
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => releases.set(name, resolve));
      active--;
      return { failed: name === 'a', seconds: 1 };
    });
    expect(started).toEqual(['a', 'b']);
    releases.get('a')();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(['a', 'b', 'c']);
    releases.get('b')();
    releases.get('c')();
    const results = await finished;
    expect(maximum).toBe(2);
    expect(results.map((r) => r.name).sort()).toEqual(['a', 'b', 'c']);
    expect(results.filter((r) => r.failed).map((r) => r.name)).toEqual(['a']);
  });

  it('runs serially with one worker and propagates execution errors', async () => {
    const started = [];
    await runBatch(['a', 'b'], 1, async (name) => { started.push(name); return { failed: false }; });
    expect(started).toEqual(['a', 'b']);
    await expect(runBatch(['a'], 1, async () => { throw new Error('spawn failed'); })).rejects.toThrow('spawn failed');
  });

  it('reports invalid CLI input as a failed command before starting preview', () => {
    const result = spawnSync(process.execPath, ['e2e/run.mjs', '--workers=0'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Use --workers=1..4');
    expect(result.stdout).not.toContain('Running');
  });
});
