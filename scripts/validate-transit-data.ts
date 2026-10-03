import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { Dataset } from '../src/domain/types';
import { formatReport, validateDataset } from './transit/validate';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const nextPath = arg('next') ?? 'public/data/lines.json';
const prevPath = arg('previous');

const next: Dataset = JSON.parse(readFileSync(nextPath, 'utf8'));
const previous: Dataset | null = prevPath && existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, 'utf8')) : null;
const report = validateDataset(next, previous, { minLines: 30, allowRemoval: process.env.ALLOW_REMOVAL === '1' });
const text = formatReport(report, next);
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
process.exit(report.errors.length ? 1 : 0);
