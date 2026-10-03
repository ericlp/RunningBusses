export interface OverlapInput {
  key: string;
  /** GeoJSON order: [lon, lat]. */
  coords: [number, number][];
}

export interface Run {
  coords: [number, number][];
  /** Sorted keys of every line sharing this stretch, including the line itself. */
  group: string[];
  /** True where this line runs against the first line in the group. */
  flip: boolean;
}

const M_PER_DEG = 111320;
const COS_LAT = 0.534; // Gothenburg, ~57.7°N

const mx = (lon: number) => lon * M_PER_DEG * COS_LAT;
const my = (lat: number) => lat * M_PER_DEG;
const id = (x: number, y: number) => x * 4_000_003 + y;

/** Adds points on long segments so a sparse straight road is still checked along its whole length. */
function densify(coords: [number, number][], maxM: number): [number, number][] {
  const out: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const steps = Math.ceil(Math.hypot(mx(lon2) - mx(lon1), my(lat2) - my(lat1)) / maxM);
    for (let s = 1; s < steps; s++) out.push([lon1 + ((lon2 - lon1) * s) / steps, lat1 + ((lat2 - lat1) * s) / steps]);
    out.push(coords[i]);
  }
  return out;
}

/**
 * Splits each line into runs by which other lines run on the same road at that point.
 * Lines within roughly cellM to 2·cellM metres of each other count as sharing a road.
 * `flip` is true where the line runs against the first line of its group, so the caller
 * can put opposite-direction lines on opposite sides instead of on top of each other.
 */
export function splitByOverlap(lines: OverlapInput[], cellM = 10): Map<string, Run[]> {
  const cellX = (lon: number) => Math.floor(mx(lon) / cellM);
  const cellY = (lat: number) => Math.floor(my(lat) / cellM);
  const dense = lines.map((l) => ({ key: l.key, coords: densify(l.coords, cellM) }));

  // per cell: which lines pass and their summed heading (metres frame)
  const cells = new Map<number, Map<string, [number, number]>>();
  for (const { key, coords } of dense) {
    for (let i = 0; i + 1 < coords.length; i++) {
      const dx = mx(coords[i + 1][0]) - mx(coords[i][0]);
      const dy = my(coords[i + 1][1]) - my(coords[i][1]);
      const len = Math.hypot(dx, dy) || 1;
      const k = id(cellX((coords[i][0] + coords[i + 1][0]) / 2), cellY((coords[i][1] + coords[i + 1][1]) / 2));
      let m = cells.get(k);
      if (!m) cells.set(k, (m = new Map()));
      const h = m.get(key) ?? [0, 0];
      m.set(key, [h[0] + dx / len, h[1] + dy / len]);
    }
  }

  const around = (lon: number, lat: number, own: string) => {
    const x = cellX(lon);
    const y = cellY(lat);
    const heading = new Map<string, [number, number]>();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        cells.get(id(x + dx, y + dy))?.forEach((h, k) => {
          const c = heading.get(k) ?? [0, 0];
          heading.set(k, [c[0] + h[0], c[1] + h[1]]);
        });
    heading.set(own, heading.get(own) ?? [0, 0]);
    return heading;
  };

  const out = new Map<string, Run[]>();
  for (const { key, coords } of dense) {
    const runs: Run[] = [];
    let current: Run | null = null;
    let currentId = '';
    for (let i = 0; i + 1 < coords.length; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];
      const heading = around((lon1 + lon2) / 2, (lat1 + lat2) / 2, key);
      const group = [...heading.keys()].sort();
      let flip = false;
      if (group.length > 1 && group[0] !== key) {
        const ref = heading.get(group[0])!;
        flip = (mx(lon2) - mx(lon1)) * ref[0] + (my(lat2) - my(lat1)) * ref[1] < 0;
      }
      const gid = `${group.join('|')}#${flip}`;
      if (current && gid === currentId) current.coords.push(coords[i + 1]);
      else {
        current = { coords: [coords[i], coords[i + 1]], group, flip };
        currentId = gid;
        runs.push(current);
      }
    }
    out.set(key, runs);
  }
  return out;
}
