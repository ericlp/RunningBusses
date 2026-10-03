export type Category = 'stadsbuss' | 'stombuss' | 'express' | 'industri' | 'tram';
export const CATEGORIES: readonly Category[] = ['stadsbuss', 'stombuss', 'express', 'industri', 'tram'];

/** Orders line numbers the way people read them: 9 before 17 before 114 before X1. */
export const compareLineNumbers = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true });
export type Tag = 'call-ordered' | 'loop' | 'one-way' | 'retur';

export interface Stop {
  name: string;
  lat: number;
  lon: number;
}

/** One runnable route: a line, or one direction of a line whose directions differ (a "retur"). */
export interface Line {
  /** Stable app key, e.g. "59" or "62r". */
  key: string;
  number: string;
  /** Display name, e.g. "62" or "62 retur". */
  label: string;
  category: Category;
  /** Fixed line colour (trams only), as a hex string. */
  color?: string;
  tags: Tag[];
  from: string;
  to: string;
  lengthM: number;
  /** Ordered stop names along the path (parent stations). */
  via: string[];
  /** GeoJSON order: [lon, lat]. */
  coordinates: [number, number][];
}

export interface Dataset {
  schemaVersion: 1;
  feedVersion: string;
  referenceDate: string;
  generatedAt: string;
  lines: Line[];
}

export interface Manifest {
  schemaVersion: 1;
  feedVersion: string;
  referenceDate: string;
  generatedAt: string;
  lineCount: number;
  file: string;
  hash: string;
}
