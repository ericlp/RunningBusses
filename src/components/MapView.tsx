import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type { Line } from '../domain/types';
import { linesNear } from '../domain/hit';
import { splitByOverlap } from '../domain/overlap';
import { BORDER_PX, PAN_SECONDS, currentPanSpeed, useAppearance } from '../appearance';

export type Tone = 'base' | 'planned' | 'done' | 'highlight' | 'candidate' | 'connector';

export interface MapLayer {
  coords: [number, number][];
  tone: Tone;
  /** App line key; lets the rainbow colouring give each line its own colour. */
  key?: string;
  weight?: number;
  opacity?: number;
  dashed?: boolean;
  casing?: boolean;
  /** Draw direction arrows along the path, in coordinate order. */
  arrows?: boolean;
}

export interface MapMarker {
  /** [lon, lat] */
  at: [number, number];
  color: 'start' | 'end';
}

export interface Fit {
  coords: [number, number][];
  /** Changing the sequence number triggers a new zoom, even for the same coordinates. */
  seq: number;
  topInset: number;
}

interface Props {
  layers: MapLayer[];
  markers: MapMarker[];
  tappable: Line[];
  fit: Fit | null;
  onTap: (hits: Line[]) => void;
}

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
// Lines grow with zoom so they stay distinct from the street network
const zoomScale = (z: number) => Math.min(2.4, Math.max(1, 1 + (z - 12) * 0.3));
const GOTHENBURG: L.LatLngExpression = [57.7089, 11.9746];

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const toneColor = (t: Tone): string =>
  ({ base: css('--line'), planned: css('--vt-blue'), done: '#2e9e4f', highlight: css('--highlight'), candidate: '#f08c00', connector: '#d6342c' })[t];
/** Golden-angle hues keep neighbouring line numbers visually far apart. */
function rainbow(key: string, dark: boolean): string {
  const n = parseInt(key, 10) || 0;
  const hue = (n * 137.508 + (key.endsWith('r') ? 60 : 0)) % 360;
  return `hsl(${hue.toFixed(0)}, 85%, ${dark ? 60 : 42}%)`;
}
const RAINBOW_TONES: Tone[] = ['base', 'planned', 'done', 'candidate'];
const toLatLngs = (c: [number, number][]) => c.map(([lon, lat]) => [lat, lon] as L.LatLngTuple);

export function MapView({ layers, markers, tappable, fit, onTap }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const group = useRef<L.LayerGroup | null>(null);
  const [zoom, setZoom] = useState(12);
  const { resolved, border, lineColors, overlap, showLocation } = useAppearance();
  const latest = useRef({ tappable, onTap });
  latest.current = { tappable, onTap };

  useEffect(() => {
    const m = L.map(el.current!, { center: GOTHENBURG, zoom: 12, zoomControl: false, renderer: L.canvas({ padding: 0.8 }) });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    m.on('zoomend', () => setZoom(m.getZoom()));
    let frame = 0;
    m.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const mPerPx = (40075016 * Math.cos((e.latlng.lat * Math.PI) / 180)) / (256 * 2 ** m.getZoom());
        const hit = linesNear(latest.current.tappable, e.latlng.lat, e.latlng.lng, 14 * mPerPx).length > 0;
        m.getContainer().style.cursor = hit ? 'pointer' : '';
      });
    });
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    group.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      // 14 px tap tolerance converted to metres at this latitude and zoom
      const mPerPx = (40075016 * Math.cos((e.latlng.lat * Math.PI) / 180)) / (256 * 2 ** m.getZoom());
      latest.current.onTap(linesNear(latest.current.tappable, e.latlng.lat, e.latlng.lng, 14 * mPerPx));
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!showLocation || !m || !navigator.geolocation) return;
    const dot = L.circleMarker([0, 0], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1, interactive: false });
    const halo = L.circle([0, 0], { radius: 0, weight: 1, color: '#1a73e8', fillOpacity: 0.12, interactive: false });
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const ll: L.LatLngTuple = [p.coords.latitude, p.coords.longitude];
        dot.setLatLng(ll);
        halo.setLatLng(ll).setRadius(p.coords.accuracy);
        if (!m.hasLayer(dot)) {
          halo.addTo(m);
          dot.addTo(m);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      dot.remove();
      halo.remove();
    };
  }, [showLocation]);

  // Lines sharing a road are found once per set of layers
  const runs = useMemo(
    () =>
      overlap === 'stack'
        ? null
        : splitByOverlap(
            layers.filter((l) => l.key && RAINBOW_TONES.includes(l.tone)).map((l) => ({ key: l.key!, coords: l.coords })),
            // lines closer than ~4 px would visibly touch, so the sharing distance follows the zoom
            Math.min(40, Math.max(10, 4 * ((40075016 * Math.cos((57.7 * Math.PI) / 180)) / (256 * 2 ** zoom)))),
          ),
    [layers, overlap, zoom],
  );

  useEffect(() => {
    const g = group.current!;
    g.clearLayers();
    const rainbowOn = lineColors === 'rainbow';
    const casingColor = resolved === 'dark' ? '#0b1a22' : '#fff';
    const toPx = (c: [number, number]) => L.CRS.EPSG3857.latLngToPoint(L.latLng(c[1], c[0]), zoom);

    // Shifts a path sideways by a number of screen pixels, so lines sharing a road lie next to each other
    const shifted = (coords: [number, number][], px: number): L.LatLngTuple[] => {
      const p = coords.map(toPx);
      return p.map((pt, i) => {
        const a = p[Math.max(0, i - 1)];
        const b = p[Math.min(p.length - 1, i + 1)];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const q = L.point(pt.x - ((b.y - a.y) / len) * px, pt.y + ((b.x - a.x) / len) * px);
        const ll = L.CRS.EPSG3857.pointToLatLng(q, zoom);
        return [ll.lat, ll.lng];
      });
    };

    interface Piece {
      pts: L.LatLngTuple[];
      line: L.PolylineOptions;
      casing: L.PolylineOptions | null;
      top: boolean;
    }
    const pieces: Piece[] = [];
    for (const l of layers) {
      const color = rainbowOn && l.key && RAINBOW_TONES.includes(l.tone) ? rainbow(l.key, resolved === 'dark') : toneColor(l.tone);
      const weight = (l.weight ?? 3) * zoomScale(zoom);
      const outline = BORDER_PX[border] + (l.casing ? 2 : 0);
      const opacity = l.opacity ?? 0.9;
      const parts = runs && l.key && runs.has(l.key) ? runs.get(l.key)! : [{ coords: l.coords, group: [l.key ?? ''], flip: false }];
      for (const part of parts) {
        const n = part.group.length;
        const i = part.group.indexOf(l.key!);
        const side = overlap === 'side' && n > 1;
        const stripe = overlap === 'stripes' && n > 1;
        const pts = side ? shifted(part.coords, (part.flip ? -1 : 1) * (i - (n - 1) / 2) * (weight + Math.min(2, BORDER_PX[border]))) : toLatLngs(part.coords);
        const dash = Math.max(8, weight * 1.6);
        pieces.push({
          pts,
          top: !!l.casing,
          casing: l.tone !== 'connector' && outline > 0 ? { color: casingColor, weight: weight + outline, opacity: Math.min(1, opacity * 0.95), interactive: false } : null,
          line: stripe
            ? { color, weight, opacity, dashArray: `${dash} ${dash * (n - 1)}`, dashOffset: String(-i * dash), lineCap: 'butt', interactive: false }
            : { color, weight, opacity, dashArray: l.dashed ? '8 8' : undefined, interactive: false },
        });
      }
    }
    // All outlines go under all lines, otherwise one line's outline hides its neighbour's stripes
    const flat = pieces.filter((p) => !p.top);
    for (const p of flat) if (p.casing) L.polyline(p.pts, p.casing).addTo(g);
    for (const p of flat) L.polyline(p.pts, p.line).addTo(g);
    for (const p of pieces.filter((p) => p.top)) {
      if (p.casing) L.polyline(p.pts, p.casing).addTo(g);
      L.polyline(p.pts, p.line).addTo(g);
    }
    // Chevrons every ~110 px of screen distance; a path crossing itself stays readable
    const arrowIcon = L.divIcon({
      className: 'dir-arrow',
      html: '<svg viewBox="0 0 20 20" width="26" height="26"><path d="M5 3 L15 10 L5 17 L8 10 Z" fill="#fff" stroke="#0b1a22" stroke-width="1.6" stroke-linejoin="round"/></svg>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    for (const l of layers) {
      if (!l.arrows) continue;
      const p = l.coords.map(toPx);
      const step = 110;
      let next = step / 2;
      let travelled = 0;
      for (let i = 1; i < p.length; i++) {
        const dx = p[i].x - p[i - 1].x;
        const dy = p[i].y - p[i - 1].y;
        const len = Math.hypot(dx, dy);
        while (len > 0 && travelled + len >= next) {
          const f = (next - travelled) / len;
          const ll = L.CRS.EPSG3857.pointToLatLng(L.point(p[i - 1].x + dx * f, p[i - 1].y + dy * f), zoom);
          const m = L.marker(ll, { icon: arrowIcon, interactive: false, keyboard: false });
          m.addTo(g);
          const svg = m.getElement()?.querySelector('svg');
          if (svg) svg.style.transform = `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)`;
          next += step;
        }
        travelled += len;
      }
    }
    for (const mk of markers) {
      L.circleMarker([mk.at[1], mk.at[0]], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: mk.color === 'start' ? '#2e9e4f' : '#d6342c',
        fillOpacity: 1,
        interactive: false,
      }).addTo(g);
    }
  }, [layers, runs, markers, zoom, resolved, border, lineColors, overlap]);

  useEffect(() => {
    if (!fit || !map.current || fit.coords.length === 0) return;
    const wide = window.innerWidth >= 900;
    const bounds = L.latLngBounds(toLatLngs(fit.coords));
    const opts = {
      paddingTopLeft: [wide ? 410 : 20, fit.topInset] as L.PointTuple,
      paddingBottomRight: [20, wide ? 20 : 300] as L.PointTuple,
      maxZoom: 15,
    };
    const seconds = PAN_SECONDS[currentPanSpeed()];
    // flyToBounds eases between distant routes so you see how they relate
    if (seconds === 0) map.current.fitBounds(bounds, { ...opts, animate: false });
    else map.current.flyToBounds(bounds, { ...opts, duration: seconds, easeLinearity: 0.2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit?.seq]);

  return <div className="map" ref={el} />;
}
