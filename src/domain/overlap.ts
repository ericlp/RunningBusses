export interface OverlapInput {
  key: string;
  /** GeoJSON order: [lon, lat]. */
  coords: [number, number][];
}

export interface Run {
  coords: [number, number][];
  /** Sorted keys of every line sharing this stretch, including the line itself. */
  group: string[];
}

const CELL_M = 10;
const M_PER_DEG = 111320;
const COS_LAT = 0.534; // Gothenburg, ~57.7°N

const cellX = (lon: number) => Math.floor((lon * M_PER_DEG * COS_LAT) / CELL_M);
const cellY = (lat: number) => Math.floor((lat * M_PER_DEG) / CELL_M);
const id = (x: number, y: number) => x * 4_000_003 + y;

/**
 * Splits each line into runs by which other lines run on the same road at that point.
 * Lines within roughly 10–20 m of each other count as sharing a road.
 */
export function splitByOverlap(lines: OverlapInput[]): Map<string, Run[]> {
  const cells = new Map<number, Set<string>>();
  for (const { key, coords } of lines) {
    for (let i = 0; i < coords.length; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[Math.min(i + 1, coords.length - 1)];
      const metres = Math.hypot((lon2 - lon1) * M_PER_DEG * COS_LAT, (lat2 - lat1) * M_PER_DEG);
      const steps = Math.max(1, Math.ceil(metres / (CELL_M / 2)));
      for (let s = 0; s < steps; s++) {
        const f = s / steps;
        const k = id(cellX(lon1 + (lon2 - lon1) * f), cellY(lat1 + (lat2 - lat1) * f));
        let set = cells.get(k);
        if (!set) cells.set(k, (set = new Set()));
        set.add(key);
      }
    }
  }

  const groupAt = (lon: number, lat: number, own: string): string[] => {
    const x = cellX(lon);
    const y = cellY(lat);
    const found = new Set<string>([own]);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) cells.get(id(x + dx, y + dy))?.forEach((k) => found.add(k));
    return [...found].sort();
  };

  const out = new Map<string, Run[]>();
  for (const { key, coords } of lines) {
    const runs: Run[] = [];
    let current: Run | null = null;
    let currentId = '';
    for (let i = 0; i + 1 < coords.length; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];
      const group = groupAt((lon1 + lon2) / 2, (lat1 + lat2) / 2, key);
      const gid = group.join('|');
      if (current && gid === currentId) current.coords.push(coords[i + 1]);
      else {
        current = { coords: [coords[i], coords[i + 1]], group };
        currentId = gid;
        runs.push(current);
      }
    }
    out.set(key, runs);
  }
  return out;
}
