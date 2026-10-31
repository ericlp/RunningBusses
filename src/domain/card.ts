import { courseStats, formatTotal, legEnd, legLabel, legStart, orientedCoordinates, type Course } from './course';
import { t } from '../i18n';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
export const CARD_MAP_Y = 180;
export const CARD_MAP_HEIGHT = 800;

export interface CardViewport {
  width: number;
  height: number;
  zoom: number;
  origin: [number, number];
}

export interface CardPath {
  coordinates: [number, number][];
  color?: string;
}

export const truncateCardText = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}\u2026`;

export function courseCardModel(course: Course) {
  const stats = courseStats(course.legs);
  const start = course.legs.length ? legStart(course.legs[0]) : null;
  const end = course.legs.length ? legEnd(course.legs[course.legs.length - 1]) : null;
  return {
    name: truncateCardText(course.name, 160),
    distance: formatTotal(stats),
    status: `${t(course.status === 'Completed' ? 'courses.statusDone' : 'courses.statusOpen')}${course.status === 'Completed' && course.completedAt ? ` ${course.completedAt.slice(0, 10)}` : ''}`,
    runners: course.status === 'Completed' && course.participants?.length
      ? truncateCardText(t('courses.runBy', { names: course.participants.join(', ') }), 180) : '',
    startName: truncateCardText(stats.startName ?? '', 100),
    endName: truncateCardText(stats.endName ?? '', 100),
    badges: course.legs.map((leg) => ({ text: truncateCardText(legLabel(leg), 18), color: leg.kind === 'line' ? leg.line.color : undefined })),
    paths: course.legs.flatMap((leg): CardPath[] => leg.kind === 'line' ? [{ coordinates: orientedCoordinates(leg), color: leg.line.color }] : []),
    start: start ? [start.lon, start.lat] as [number, number] : null,
    end: end ? [end.lon, end.lat] as [number, number] : null,
    appName: t('app.title'),
  };
}

export type CourseCardModel = ReturnType<typeof courseCardModel>;

/** Web Mercator world pixels, matching Leaflet's EPSG:3857 tile grid. */
export function cardWorldPoint([lon, lat]: readonly [number, number], zoom: number): [number, number] {
  const sin = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180);
  const size = 256 * 2 ** zoom;
  return [(lon + 180) / 360 * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
}

export function cardPoint(point: readonly [number, number], viewport: CardViewport): [number, number] {
  const [x, y] = cardWorldPoint(point, viewport.zoom);
  return [(x - viewport.origin[0]) / viewport.width * CARD_WIDTH, (y - viewport.origin[1]) / viewport.height * CARD_MAP_HEIGHT];
}

export function cardTiles(viewport: CardViewport): { x: number; y: number; z: number }[] {
  const tiles = [];
  for (let y = Math.floor(viewport.origin[1] / 256); y < Math.ceil((viewport.origin[1] + viewport.height) / 256); y++) {
    for (let x = Math.floor(viewport.origin[0] / 256); x < Math.ceil((viewport.origin[0] + viewport.width) / 256); x++) {
      tiles.push({ x, y, z: viewport.zoom });
    }
  }
  return tiles;
}

export function fitCardViewport(paths: CardPath[], width = 540, height = 400): CardViewport | null {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const path of paths) for (const point of path.coordinates) {
    const [x, y] = cardWorldPoint(point, 0);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (left === Infinity) return null;
  const scale = Math.min((width - 96) / Math.max(right - left, 0.000001), (height - 96) / Math.max(bottom - top, 0.000001));
  const zoom = Math.max(0, Math.min(15, Math.floor(Math.log2(scale))));
  const factor = 2 ** zoom;
  return { width, height, zoom, origin: [(left + right) / 2 * factor - width / 2, (top + bottom) / 2 * factor - height / 2] };
}
