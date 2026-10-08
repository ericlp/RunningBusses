import { lineLabel, localeTag, t } from '../i18n';
import type { RouteStatus } from './course';
import { CATEGORIES, compareLineNumbers, type Category, type LineMetadata, type Tag } from './types';

/** `incomplete` means not completed, which includes lines that are not planned. */
export type StatusFilter = 'all' | 'unplanned' | 'incomplete' | 'completed';

export interface Filters {
  /** Show lines from any of these categories; never empty. */
  categories: Category[];
  status: StatusFilter;
  /** Show only lines with at least one of these tags; empty means no tag filter. */
  tags: Tag[];
  minKm: number | null;
  maxKm: number | null;
}

export const defaultFilters: Filters = { categories: ['stadsbuss'], status: 'incomplete', tags: [], minKm: null, maxKm: null };

const FILTERS_KEY = 'rb.filters';
const SORT_KEY = 'rb.sort';
const STATUSES: readonly StatusFilter[] = ['all', 'unplanned', 'incomplete', 'completed'];
const TAGS: readonly Tag[] = ['call-ordered', 'loop', 'one-way', 'retur'];

export function loadFilters(): Filters {
  try {
    const o = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? 'null');
    if (!o || typeof o !== 'object') return defaultFilters;
    const categories = CATEGORIES.filter((c) => Array.isArray(o.categories) && o.categories.includes(c));
    const km = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
      categories: categories.length ? categories : defaultFilters.categories,
      status: STATUSES.includes(o.status) ? o.status : defaultFilters.status,
      tags: TAGS.filter((x) => Array.isArray(o.tags) && o.tags.includes(x)),
      minKm: km(o.minKm),
      maxKm: km(o.maxKm),
    };
  } catch {
    return defaultFilters;
  }
}

export function saveFilters(f: Filters): void {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    /* storage unavailable */
  }
}

export function loadSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_KEY) as SortKey | null;
    return v && SORT_KEYS.includes(v) ? v : 'number';
  } catch {
    return 'number';
  }
}

export function saveSort(s: SortKey): void {
  try {
    localStorage.setItem(SORT_KEY, s);
  } catch {
    /* storage unavailable */
  }
}

export function applyFilters<T extends LineMetadata>(lines: T[], f: Filters, statusOf: (key: string) => RouteStatus = () => 'NotPlanned'): T[] {
  return lines.filter((l) => {
    if (f.status !== 'all') {
      const st = statusOf(l.key);
      if (f.status === 'unplanned' && st !== 'NotPlanned') return false;
      if (f.status === 'incomplete' && st === 'Completed') return false;
      if (f.status === 'completed' && st !== 'Completed') return false;
    }
    if (!f.categories.includes(l.category)) return false;
    if (f.tags.length && !f.tags.some((x) => l.tags.includes(x))) return false;
    if (f.minKm !== null && l.lengthM < f.minKm * 1000) return false;
    if (f.maxKm !== null && l.lengthM > f.maxKm * 1000) return false;
    return true;
  });
}

/** Which chips would still show something, given the other active filters. A chip that is already on stays usable. */
export function facetAvailability(lines: LineMetadata[], f: Filters, statusOf: (key: string) => RouteStatus) {
  const any = (g: Filters) => applyFilters(lines, g, statusOf).length > 0;
  return {
    category: (c: Category) => f.categories.includes(c) || any({ ...f, categories: [c] }),
    status: (s: StatusFilter) => f.status === s || any({ ...f, status: s }),
    tag: (tag: Tag) => f.tags.includes(tag) || any({ ...f, tags: [tag] }),
  };
}

export function searchLines<T extends LineMetadata>(lines: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return lines;
  return lines.filter(
    (l) =>
      l.label.toLowerCase().includes(q) ||
      lineLabel(l).toLowerCase().includes(q) ||
      l.from.toLowerCase().includes(q) ||
      l.to.toLowerCase().includes(q) ||
      l.via.some((v) => v.toLowerCase().includes(q)),
  );
}

export type SortKey = 'number' | 'shortest' | 'longest' | 'status' | 'name';
export const SORT_KEYS: readonly SortKey[] = ['number', 'shortest', 'longest', 'status', 'name'];

const STATUS_RANK: Record<RouteStatus, number> = { NotCompleted: 0, NotPlanned: 1, Completed: 2 };

export function sortLines<T extends LineMetadata>(lines: T[], by: SortKey = 'number', statusOf: (key: string) => RouteStatus = () => 'NotPlanned'): T[] {
  const byNumber = (a: LineMetadata, b: LineMetadata) => compareLineNumbers(a.number, b.number) || a.key.localeCompare(b.key);
  const primary: Record<SortKey, (a: LineMetadata, b: LineMetadata) => number> = {
    number: () => 0,
    shortest: (a, b) => a.lengthM - b.lengthM,
    longest: (a, b) => b.lengthM - a.lengthM,
    status: (a, b) => STATUS_RANK[statusOf(a.key)] - STATUS_RANK[statusOf(b.key)],
    name: (a, b) => a.from.localeCompare(b.from, localeTag()),
  };
  return [...lines].sort((a, b) => primary[by](a, b) || byNumber(a, b));
}

export function formatKm(m: number): string {
  return `${(m / 1000).toLocaleString(localeTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** True when the selection is the default one, whatever the order. */
export const sameCategories = (a: Category[], b: Category[]): boolean => a.length === b.length && a.every((c) => b.includes(c));

export const tagLabel = (tag: Tag): string => t(`tag.${tag}`);
export const categoryLabel = (c: Category): string => t(`category.${c}`);
export const statusFilterLabel = (s: StatusFilter): string => t(`statusFilter.${s}`);
