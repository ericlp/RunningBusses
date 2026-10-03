import { describe, expect, it } from 'vitest';
import { categoryOf, type CategoryConfig } from './category';

const config: CategoryConfig = {
  stadsbuss: { numberRange: [22, 99], exclude: [25] },
  stombuss: { numbers: [17, 18, 19, 21, 25] },
  express: { pattern: '^X\\d+$' },
  industri: { numberRange: [114, 258] },
};

describe('categoryOf', () => {
  it('sorts lines into the five groups of the city network', () => {
    expect(categoryOf('59', config)).toBe('stadsbuss');
    expect(categoryOf('25', config)).toBe('stombuss');
    expect(categoryOf('17', config)).toBe('stombuss');
    expect(categoryOf('X40', config)).toBe('express');
    expect(categoryOf('X1', config)).toBe('express');
    expect(categoryOf('114', config)).toBe('industri');
    expect(categoryOf('258', config)).toBe('industri');
  });
  it('leaves everything else out', () => {
    for (const name of ['16', '100', '259', '501', '4E', 'TÅG', 'X', 'x1', '']) expect(categoryOf(name, config)).toBeUndefined();
  });
});
