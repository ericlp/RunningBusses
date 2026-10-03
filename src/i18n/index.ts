import { useSyncExternalStore } from 'react';
import { en } from './en';
import { fr } from './fr';
import { sv, type Dict, type Key } from './sv';

export type Lang = 'sv' | 'en' | 'fr';
export type LangPref = 'auto' | Lang;
export const LANGS: Lang[] = ['sv', 'en', 'fr'];
export const LANG_NAMES: Record<Lang, string> = { sv: 'Svenska', en: 'English', fr: 'Français' };

const dicts: Record<Lang, Dict> = { sv, en, fr };
const locales: Record<Lang, string> = { sv: 'sv-SE', en: 'en-GB', fr: 'fr-FR' };
const STORAGE_KEY = 'lang';

/** First supported language in the browser's preference order ("fr-CA" counts as French); Swedish if none. */
export function detectLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0] as Lang;
    if (LANGS.includes(base)) return base;
  }
  return 'sv';
}

export function resolveLang(pref: LangPref, preferred: readonly string[]): Lang {
  return pref === 'auto' ? detectLang(preferred) : pref;
}

function storedPref(): LangPref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'sv' || v === 'en' || v === 'fr' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const browser = typeof window !== 'undefined';
const browserLangs = (): readonly string[] => (browser ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);
let pref: LangPref = browser ? storedPref() : 'auto';
let lang: Lang = resolveLang(pref, browserLangs());
const listeners = new Set<() => void>();

function apply() {
  if (!browser) return;
  document.documentElement.lang = lang;
  document.title = dicts[lang]['app.title'];
}
apply();

export function setLangPref(next: LangPref): void {
  pref = next;
  lang = resolveLang(next, browserLangs());
  try {
    if (next === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // the choice still applies for this session
  }
  apply();
  listeners.forEach((l) => l());
}

export function currentLang(): Lang {
  return lang;
}

/** Locale tag for Intl, so numbers use the decimal comma or point of the chosen language. */
export function localeTag(): string {
  return locales[lang];
}

/** Re-renders the calling component when the language changes. */
export function useLang(): { lang: Lang; pref: LangPref } {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lang,
  );
  return { lang, pref };
}

type Params = Record<string, string | number>;

function fill(text: string, params?: Params): string {
  return params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text;
}

export function t(key: Key, params?: Params): string {
  return fill(dicts[lang][key], params);
}

type PluralBase = Key extends infer K ? (K extends `${infer B}_one` ? B : never) : never;

/** Picks `base_one` or `base_other` using the language's plural rules. `{n}` is filled in automatically. */
export function tn(base: PluralBase, n: number, params?: Params): string {
  const rule = new Intl.PluralRules(locales[lang]).select(n) === 'one' ? 'one' : 'other';
  return t(`${base}_${rule}` as Key, { n, ...params });
}

/** Display name of a line: the dataset label, with "retur" localised. */
export function lineLabel(line: { number: string; tags: string[]; label: string }): string {
  return line.tags.includes('retur') ? t('line.retur', { number: line.number }) : line.label;
}
