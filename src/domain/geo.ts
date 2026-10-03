export interface LatLon {
  lat: number;
  lon: number;
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
