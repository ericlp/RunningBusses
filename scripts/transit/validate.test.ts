import { describe, expect, it } from 'vitest';
import type { Dataset, Line } from '../../src/domain/types';
import { validateDataset } from './validate';
import { pathLengthM } from '../../src/domain/geo';

const line = (key: string, extra: Partial<Line> = {}): Line => ({
  key, number: key, label: key, category: 'stadsbuss', tags: [], from: 'A', to: 'B', lengthM: 1112, via: [],
  coordinates: [[11.9, 57.7], [11.9, 57.71]], ...extra,
});
const ds = (lines: Line[]): Dataset => ({ schemaVersion: 1, feedVersion: 'x', referenceDate: 'x', generatedAt: 'x', lines });
const opts = { minLines: 1, allowRemoval: false };

describe('validateDataset', () => {
  it('accepts a sane dataset', () => expect(validateDataset(ds([line('1')]), null, opts).errors).toEqual([]));
  it('rejects too few lines, bad coordinates, wrong lengths and duplicates', () => {
    expect(validateDataset(ds([]), null, { ...opts, minLines: 5 }).errors).toHaveLength(1);
    expect(validateDataset(ds([line('1', { coordinates: [[999, 0], [1, 1]] })]), null, opts).errors[0]).toMatch(/invalid coordinates/);
    expect(validateDataset(ds([line('1', { lengthM: 5000 })]), null, opts).errors[0]).toMatch(/does not match/);
    expect(validateDataset(ds([line('1'), line('1')]), null, opts).errors[0]).toMatch(/duplicate/);
  });
  it('rejects removed lines unless allowed', () => {
    const prev = ds([line('1'), line('2')]);
    expect(validateDataset(ds([line('1')]), prev, opts).errors[0]).toMatch(/removed: 2/);
    expect(validateDataset(ds([line('1')]), prev, { ...opts, allowRemoval: true }).errors).toEqual([]);
  });
  it('warns about moved ends', () => {
    const moved = line('1', { coordinates: [[11.91, 57.7], [11.91, 57.71]] });
    expect(validateDataset(ds([moved]), ds([line('1')]), opts).warnings[0]).toMatch(/moved/);
  });
  it('accepts long regional routes but still rejects implausible lengths and wrong geometry', () => {
    const coordinates: [number, number][] = [[11.9, 57.7], [11.9, 58.7]];
    const regional = line('vt.9011014360000000', { category: 'other-bus', coordinates, lengthM: Math.round(pathLengthM(coordinates)) });
    expect(validateDataset(ds([regional]), null, opts).errors).toEqual([]);
    expect(validateDataset(ds([{ ...regional, lengthM: 250000 }]), null, opts).errors).toEqual(expect.arrayContaining([expect.stringMatching(/implausible/)]));
    expect(validateDataset(ds([{ ...regional, lengthM: NaN }]), null, opts).errors).toEqual(expect.arrayContaining([expect.stringMatching(/implausible/)]));
    expect(validateDataset(ds([{ ...regional, lengthM: 80000 }]), null, opts).errors).toEqual(expect.arrayContaining([expect.stringMatching(/does not match/)]));
  });
  it('accepts short ferry crossings without relaxing bus limits or geometry checks', () => {
    const coordinates: [number, number][] = [[11.9, 57.7], [11.9, 57.70135]];
    const ferry = line('vt.362', { category: 'ferry', coordinates, lengthM: Math.round(pathLengthM(coordinates)) });
    expect(ferry.lengthM).toBeGreaterThanOrEqual(50);
    expect(ferry.lengthM).toBeLessThan(300);
    expect(validateDataset(ds([ferry]), null, opts).errors).toEqual([]);
    expect(validateDataset(ds([{ ...ferry, category: 'stadsbuss' }]), null, opts).errors).toContainEqual(expect.stringMatching(/implausible/));
    for (const lengthM of [0, 49, 60001, NaN]) {
      expect(validateDataset(ds([{ ...ferry, lengthM }]), null, opts).errors).toContainEqual(expect.stringMatching(/implausible/));
    }
    expect(validateDataset(ds([{ ...ferry, lengthM: 1000 }]), null, opts).errors).toContainEqual(expect.stringMatching(/does not match/));
  });
});
