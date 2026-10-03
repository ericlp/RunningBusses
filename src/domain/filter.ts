import { lineLabel, localeTag, t } from '../i18n';
import type { RouteStatus } from './course';
import type { Category, Line, Tag } from './types';

/** `incomplete` means not completed, which includes lines that are not planned. */
export type StatusFilter = 'all' | 'unplanned' | 'incomplete' | 'completed';

export interface Filters {
  category: Category | 'all';
  status: StatusFilter;
  /** Show only lines with at least one of these tags; empty means no tag filter. */
  tags: Tag[];
  minKm: number | null;
  maxKm: number | null;
}

export const defaultFilters: Filters = { category: 'stadsbuss', status: 'all', tags: [], minKm: null, maxKm: null };

export function applyFilters(lines: Line[], f: Filters, statusOf: (key: string) => RouteStatus = () => 'NotPlanned'): Line[] {
  return lines.filter((l) => {
    if (f.status !== 'all') {
      const st = statusOf(l.key);
      if (f.status === 'unplanned' && st !== 'NotPlanned') return false;
      if (f.status === 'incomplete' && st === 'Completed') return false;
      if (f.status === 'completed' && st !== 'Completed') return false;
    }
    if (f.category !== 'all' && l.category !== f.category) return false;
    if (f.tags.length && !f.tags.some((x) => l.tags.includes(x))) return false;
    if (f.minKm !== null && l.lengthM < f.minKm * 1000) return false;
    if (f.maxKm !== null && l.lengthM > f.maxKm * 1000) return false;
    return true;
  });
}

export function searchLines(lines: Line[], query: string): Line[] {
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

export function sortLines(lines: Line[]): Line[] {
  return [...lines].sort((a, b) => Number(a.number) - Number(b.number) || a.key.localeCompare(b.key));
}

export function formatKm(m: number): string {
  return `${(m / 1000).toLocaleString(localeTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export const tagLabel = (tag: Tag): string => t(`tag.${tag}`);
export const categoryLabel = (c: Category): string => t(`category.${c}`);
export const statusFilterLabel = (s: StatusFilter): string => t(`statusFilter.${s}`);
