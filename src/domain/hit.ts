import type { Line } from './types';

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

function distanceToSegmentM(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance in metres from a point to the nearest part of a line. */
export function distanceToLineM(line: Line, lat: number, lon: number): number {
  const kx = M_PER_DEG_LON * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  const c = line.coordinates;
  for (let i = 1; i < c.length; i++) {
    const d = distanceToSegmentM(
      0,
      0,
      (c[i - 1][0] - lon) * kx,
      (c[i - 1][1] - lat) * M_PER_DEG_LAT,
      (c[i][0] - lon) * kx,
      (c[i][1] - lat) * M_PER_DEG_LAT,
    );
    if (d < best) best = d;
  }
  return best;
}

/** Lines within toleranceM of a tapped point, nearest first. Overlapping lines all show up. */
export function linesNear(lines: Line[], lat: number, lon: number, toleranceM: number): Line[] {
  const dLat = toleranceM / M_PER_DEG_LAT;
  const dLon = toleranceM / (M_PER_DEG_LON * Math.cos((lat * Math.PI) / 180));
  return lines
    .filter((l) => {
      let minLon = Infinity;
      let maxLon = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const [x, y] of l.coordinates) {
        if (x < minLon) minLon = x;
        if (x > maxLon) maxLon = x;
        if (y < minLat) minLat = y;
        if (y > maxLat) maxLat = y;
      }
      return lon >= minLon - dLon && lon <= maxLon + dLon && lat >= minLat - dLat && lat <= maxLat + dLat;
    })
    .map((l) => ({ l, d: distanceToLineM(l, lat, lon) }))
    .filter(({ d }) => d <= toleranceM)
    .sort((a, b) => a.d - b.d)
    .map(({ l }) => l);
}
