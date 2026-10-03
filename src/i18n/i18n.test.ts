import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { currentLang, detectLang, lineLabel, localeTag, resolveLang, setLangPref, t, tn } from './index';
import { sv } from './sv';
import { formatKm } from '../domain/filter';

describe('language detection', () => {
  it('uses the first supported language in preference order', () => {
    expect(detectLang(['de-DE', 'fr-CA', 'en'])).toBe('fr');
    expect(detectLang(['en-US', 'sv'])).toBe('en');
  });
  it('falls back to Swedish', () => {
    expect(detectLang(['de', 'ja'])).toBe('sv');
    expect(detectLang([])).toBe('sv');
  });
  it('an explicit choice beats the browser', () => {
    expect(resolveLang('en', ['fr'])).toBe('en');
    expect(resolveLang('auto', ['fr'])).toBe('fr');
  });
});

describe('dictionaries', () => {
  it('have the same keys in every language', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(sv).sort());
    expect(Object.keys(fr).sort()).toEqual(Object.keys(sv).sort());
  });
  it('use the same placeholders in every language', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(sv) as (keyof typeof sv)[]) {
      expect(ph(en[k]), k).toBe(ph(sv[k]));
      expect(ph(fr[k]), k).toBe(ph(sv[k]));
    }
  });
});

describe('translation helpers', () => {
  it('defaults to Swedish without a browser', () => {
    expect(currentLang()).toBe('sv');
    expect(formatKm(9700)).toBe('9,7 km');
  });
  it('switches language, number format and plurals', () => {
    setLangPref('en');
    expect(localeTag()).toBe('en-GB');
    expect(formatKm(9700)).toBe('9.7 km');
    expect(tn('courses.resumeDraft', 1)).toBe('Continue draft (1 leg)');
    expect(tn('courses.resumeDraft', 3)).toBe('Continue draft (3 legs)');
    expect(lineLabel({ number: '62', tags: ['retur'], label: '62 retur' })).toBe('62 return');
    setLangPref('fr');
    expect(t('courses.create')).toBe('Créer un parcours');
    expect(tn('courses.resumeDraft', 0)).toBe('Continuer le brouillon (0 étape)');
    setLangPref('auto');
    expect(currentLang()).toBe('sv');
  });
});
