import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultFilters, loadFilters, loadSort, saveFilters, saveSort } from './filter';

function stubStorage(): Map<string, string> {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  });
  return m;
}

describe('persisted filters and sort', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = stubStorage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to defaults when nothing is stored', () => {
    expect(loadFilters()).toEqual(defaultFilters);
    expect(loadSort()).toBe('number');
  });

  it('round-trips filters and sort', () => {
    const f = { categories: ['express', 'tram'], status: 'completed', tags: ['loop'], minKm: 3, maxKm: 12.5 } as const;
    saveFilters({ ...f, categories: [...f.categories], tags: [...f.tags] });
    saveSort('longest');
    expect(loadFilters()).toEqual(f);
    expect(loadSort()).toBe('longest');
  });
  it('persists the additional bus category without changing defaults', () => {
    saveFilters({ ...defaultFilters, categories: ['other-bus'] });
    expect(loadFilters().categories).toEqual(['other-bus']);
    expect(defaultFilters.categories).toEqual(['stadsbuss']);
  });

  it('drops invalid values instead of trusting storage', () => {
    store.set('rb.filters', JSON.stringify({ categories: ['bogus'], status: 'nope', tags: ['x', 'loop'], minKm: 'a', maxKm: null }));
    store.set('rb.sort', 'bogus');
    expect(loadFilters()).toEqual({ ...defaultFilters, tags: ['loop'] });
    expect(loadSort()).toBe('number');
  });

  it('survives corrupt JSON and unavailable storage', () => {
    store.set('rb.filters', '{not json');
    expect(loadFilters()).toEqual(defaultFilters);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadFilters()).toEqual(defaultFilters);
    expect(loadSort()).toBe('number');
    expect(() => saveFilters(defaultFilters)).not.toThrow();
    expect(() => saveSort('name')).not.toThrow();
  });
});
