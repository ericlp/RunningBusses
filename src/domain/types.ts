export type Category = 'stadsbuss' | 'stombuss';
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
