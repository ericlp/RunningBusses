import { useSyncExternalStore } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';
export type MapStyle = 'standard' | 'soft' | 'grey';

export const THEMES: readonly ThemePref[] = ['auto', 'light', 'dark'];
export const MAP_STYLES: readonly MapStyle[] = ['standard', 'soft', 'grey'];

const THEME_KEY = 'rb.theme';
const MAP_KEY = 'rb.mapStyle';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

const media = window.matchMedia('(prefers-color-scheme: dark)');
let theme = read(THEME_KEY, THEMES, 'auto');
let mapStyle = read(MAP_KEY, MAP_STYLES, 'soft');
let snapshot = '';
const listeners = new Set<() => void>();

export const resolvedTheme = (): 'light' | 'dark' => (theme === 'auto' ? (media.matches ? 'dark' : 'light') : theme);

function apply() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.dataset.map = mapStyle;
  snapshot = `${theme}|${mapStyle}|${resolvedTheme()}`;
  listeners.forEach((l) => l());
}
media.addEventListener('change', apply);
apply();

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // still applies for this session
  }
}

export function setTheme(next: ThemePref) {
  theme = next;
  save(THEME_KEY, next);
  apply();
}

export function setMapStyle(next: MapStyle) {
  mapStyle = next;
  save(MAP_KEY, next);
  apply();
}

export function useAppearance() {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
  return { theme, mapStyle, resolved: resolvedTheme() };
}
