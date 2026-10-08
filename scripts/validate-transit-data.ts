import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { Dataset } from '../src/domain/types';
import { formatReport, validateDataset } from './transit/validate';
import { dirname } from 'node:path';
import { validateSplitAssets } from './transit/validate-split';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const nextPath = arg('next') ?? 'public/data/lines.json';
const prevPath = arg('previous');

const next: Dataset = JSON.parse(readFileSync(nextPath, 'utf8'));
const previous: Dataset | null = prevPath && existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, 'utf8')) : null;
const report = validateDataset(next, previous, { minLines: 30, allowRemoval: process.env.ALLOW_REMOVAL === '1' });
try {
  await validateSplitAssets(next, dirname(nextPath));
} catch (e) {
  report.errors.push(`Split assets: ${e instanceof Error ? e.message : e}`);
}
const text = formatReport(report, next);
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
process.exit(report.errors.length ? 1 : 0);
