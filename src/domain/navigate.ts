import { legStart, legStartName, type Leg } from './course';

export interface Destination {
  name: string;
  lat: number;
  lon: number;
}

/** Where a course starts: its first leg with a known position. */
export function courseStart(legs: readonly Leg[]): Destination | null {
  const first = legs[0];
  const at = first && legStart(first);
  return at ? { name: legStartName(first), lat: at.lat, lon: at.lon } : null;
}

/** A directions link that opens the maps app on phones and the web map elsewhere; the origin is the current position. */
export function directionsUrl(d: Pick<Destination, 'lat' | 'lon'>): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${d.lat.toFixed(5)},${d.lon.toFixed(5)}&travelmode=walking`;
}
