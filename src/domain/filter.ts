import type { Category, Line, Tag } from './types';

export interface Filters {
  category: Category | 'all';
  /** Show only lines with at least one of these tags; empty means no tag filter. */
  tags: Tag[];
  minKm: number | null;
  maxKm: number | null;
}

export const defaultFilters: Filters = { category: 'stadsbuss', tags: [], minKm: null, maxKm: null };

export function applyFilters(lines: Line[], f: Filters): Line[] {
  return lines.filter((l) => {
    if (f.category !== 'all' && l.category !== f.category) return false;
    if (f.tags.length && !f.tags.some((t) => l.tags.includes(t))) return false;
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
      l.from.toLowerCase().includes(q) ||
      l.to.toLowerCase().includes(q) ||
      l.via.some((v) => v.toLowerCase().includes(q)),
  );
}

export function sortLines(lines: Line[]): Line[] {
  return [...lines].sort((a, b) => Number(a.number) - Number(b.number) || a.key.localeCompare(b.key));
}

export function formatKm(m: number): string {
  return `${(m / 1000).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export const tagLabels: Record<Tag, string> = {
  'call-ordered': 'Anropsstyrd',
  loop: 'Slinga',
  'one-way': 'Enkelriktad',
  retur: 'Retur',
};

export const categoryLabels: Record<Category, string> = {
  stadsbuss: 'Stadsbuss',
  stombuss: 'Stombuss',
};
