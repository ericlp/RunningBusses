import type { CSSProperties } from 'react';
import type { Line } from './types';

/** Badge colours for lines with a fixed colour (trams); other lines keep the default badge. */
export function badgeStyle(line: Pick<Line, 'color'> | undefined): CSSProperties | undefined {
  const hex = line?.color;
  if (!hex) return undefined;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
  return { background: hex, color: light ? '#111' : '#fff', boxShadow: light ? 'inset 0 0 0 1px rgba(0,0,0,0.45)' : undefined };
}
