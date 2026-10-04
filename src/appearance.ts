import { useSyncExternalStore } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';
export type MapStyle = 'standard' | 'soft' | 'grey';

export type Border = 'none' | 'thin' | 'normal' | 'thick';
export type LineColors = 'status' | 'rainbow';
export const BORDERS: readonly Border[] = ['none', 'thin', 'normal', 'thick'];
export const LINE_COLORS: readonly LineColors[] = ['status', 'rainbow'];
/** Extra width in px added to each line for its outline. */
export const BORDER_PX: Record<Border, number> = { none: 0, thin: 2, normal: 4, thick: 7 };
export type PanSpeed = 'off' | 'fast' | 'normal' | 'slow';
export const PAN_SPEEDS: readonly PanSpeed[] = ['off', 'fast', 'normal', 'slow'];
/** Seconds a camera move takes. */
export const PAN_SECONDS: Record<PanSpeed, number> = { off: 0, fast: 0.6, normal: 1.4, slow: 2.6 };
export type Overlap = 'side' | 'stripes' | 'stack';
export const OVERLAPS: readonly Overlap[] = ['side', 'stripes', 'stack'];
export type NavProvider = 'ask' | 'google' | 'vasttrafik';
export const NAV_PROVIDERS: readonly NavProvider[] = ['ask', 'google', 'vasttrafik'];
export const THEMES: readonly ThemePref[] = ['auto', 'light', 'dark'];
export const MAP_STYLES: readonly MapStyle[] = ['standard', 'soft', 'grey'];

const THEME_KEY = 'rb.theme';
const MAP_KEY = 'rb.mapStyle';
const BORDER_KEY = 'rb.border';
const PAN_KEY = 'rb.panSpeed';
const OVERLAP_KEY = 'rb.overlap';
const COLORS_KEY = 'rb.lineColors';
const NAV_KEY = 'rb.navProvider';

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
let border = read(BORDER_KEY, BORDERS, window.matchMedia('(max-width: 640px)').matches ? 'thin' : 'normal');
let lineColors = read(COLORS_KEY, LINE_COLORS, 'status');
let panSpeed = read(PAN_KEY, PAN_SPEEDS, 'normal');
// small screens default to stripes: side-by-side lines take too much room there
let overlap = read(OVERLAP_KEY, OVERLAPS, window.matchMedia('(max-width: 640px)').matches ? 'stripes' : 'side');
let navProvider = read(NAV_KEY, NAV_PROVIDERS, 'ask');
let showLocation = localStorage.getItem('rb.location') === 'on';
let snapshot = '';
const listeners = new Set<() => void>();

export const resolvedTheme = (): 'light' | 'dark' => (theme === 'auto' ? (media.matches ? 'dark' : 'light') : theme);

function apply() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.dataset.map = mapStyle;
  snapshot = `${theme}|${mapStyle}|${border}|${lineColors}|${panSpeed}|${overlap}|${showLocation}|${navProvider}|${resolvedTheme()}`;
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

export function setBorder(next: Border) {
  border = next;
  save(BORDER_KEY, next);
  apply();
}

export function setLineColors(next: LineColors) {
  lineColors = next;
  save(COLORS_KEY, next);
  apply();
}

export function setPanSpeed(next: PanSpeed) {
  panSpeed = next;
  save(PAN_KEY, next);
  apply();
}

export const currentPanSpeed = (): PanSpeed => panSpeed;

export function setOverlap(next: Overlap) {
  overlap = next;
  save(OVERLAP_KEY, next);
  apply();
}

export function setNavProvider(next: NavProvider) {
  navProvider = next;
  save(NAV_KEY, next);
  apply();
}

export function setShowLocation(next: boolean) {
  showLocation = next;
  save('rb.location', next ? 'on' : 'off');
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
  return { theme, mapStyle, border, lineColors, panSpeed, overlap, showLocation, navProvider, resolved: resolvedTheme() };
}
