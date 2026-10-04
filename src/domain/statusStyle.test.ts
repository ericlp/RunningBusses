import { describe, expect, it } from 'vitest';
import { STATUS_STYLE } from './statusStyle';

describe('STATUS_STYLE', () => {
  it('gives each status a distinct line style', () => {
    const keys = Object.values(STATUS_STYLE).map((s) => `${s.weight}${s.dashed}`);
    expect(new Set(keys).size).toBe(3);
  });
});
