import { describe, expect, it } from 'vitest';
import { badgeStyle } from './color';

describe('fixed-colour line badges', () => {
  it('leaves ordinary badges on their default styling', () => {
    expect(badgeStyle(undefined)).toBeUndefined();
    expect(badgeStyle({})).toBeUndefined();
  });
  it.each(['#ffffff', '#eeeeee'])('gives light colour %s dark text and a visible edge', (color) => {
    expect(badgeStyle({ color })).toEqual({ background: color, color: '#111', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.45)' });
  });
  it.each(['#000000', '#112233'])('gives dark colour %s light text', (color) => {
    expect(badgeStyle({ color })).toEqual({ background: color, color: '#fff', boxShadow: undefined });
  });
});
