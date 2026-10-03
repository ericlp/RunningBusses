import { legEnd, legEndName, legLabel, legStart, legStartName, orientedCoordinates, type Course } from './course';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const fix = (n: number) => n.toFixed(6);

/**
 * GPX 1.1: one track with one segment per bus line, in running order and direction,
 * plus waypoints at the start and at the end of every line. Gaps between lines are not
 * filled in, so a watch shows them as breaks. Manual legs carry no geometry.
 */
export function courseToGpx(course: Course): string {
  const wpt = (p: { lat: number; lon: number }, name: string, desc: string) =>
    `  <wpt lat="${fix(p.lat)}" lon="${fix(p.lon)}"><name>${esc(name)}</name><desc>${esc(desc)}</desc></wpt>`;
  const waypoints: string[] = [];
  const segments: string[] = [];
  course.legs.forEach((leg, i) => {
    const s = legStart(leg);
    const e = legEnd(leg);
    if (i === 0 && s) waypoints.push(wpt(s, legStartName(leg), `Start, ${legLabel(leg)}`));
    if (e) waypoints.push(wpt(e, legEndName(leg), `${legLabel(leg)}`));
    if (leg.kind === 'line') {
      const pts = orientedCoordinates(leg).map(([lon, lat]) => `    <trkpt lat="${fix(lat)}" lon="${fix(lon)}"/>`);
      segments.push(`   <trkseg>\n${pts.join('\n')}\n   </trkseg>`);
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Gothenburg Bus Running" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(course.name)}</name><desc>${esc('Bus routes are a reference, not a verified running route.')}</desc></metadata>
${waypoints.join('\n')}
  <trk>
   <name>${esc(course.name)}</name>
${segments.join('\n')}
  </trk>
</gpx>
`;
}

export const gpxFileName = (course: Course) =>
  `${course.name.normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'bana'}.gpx`;
