export interface LatLon {
  lat: number;
  lon: number;
}

export interface GeoBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

const boundsCache = new WeakMap<readonly (readonly [number, number])[], GeoBounds>();

/** Route snapshots are immutable; cache their extents for rendering and hit testing. */
export function pathBounds(coordinates: readonly (readonly [number, number])[]): GeoBounds {
  const cached = boundsCache.get(coordinates);
  if (cached) return cached;
  const bounds = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
  for (const [lon, lat] of coordinates) {
    bounds.west = Math.min(bounds.west, lon);
    bounds.east = Math.max(bounds.east, lon);
    bounds.south = Math.min(bounds.south, lat);
    bounds.north = Math.max(bounds.north, lat);
  }
  boundsCache.set(coordinates, bounds);
  return bounds;
}

export function boundsIntersect(a: GeoBounds, b: GeoBounds): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

const R = 6371008.8;

export function haversineM(a: LatLon, b: LatLon): number {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Path length in metres of a GeoJSON-ordered ([lon, lat]) coordinate list. */
export function pathLengthM(coordinates: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    total += haversineM({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 });
  }
  return total;
}
