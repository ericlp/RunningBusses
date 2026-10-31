import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type { Line } from '../domain/types';
import type { StopPoint } from '../domain/stops';
import { linesNear } from '../domain/hit';
import { splitByOverlap } from '../domain/overlap';
import { boundsIntersect, pathBounds, type GeoBounds } from '../domain/geo';
import { BORDER_PX, PAN_SECONDS, currentPanSpeed, useAppearance } from '../appearance';
import { cardTiles, type CardPath, type CardViewport } from '../domain/card';
import { t } from '../i18n';

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
  /** Fixed line colour (trams): drawn as a plain line in this colour, never rainbow. */
  fixedColor?: string;
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
  /** Stops of the highlighted route(s); shown from a mid zoom level, named from a close one. */
  stops: StopPoint[];
  tappable: Line[];
  fit: Fit | null;
  onTap: (hits: Line[]) => void;
}

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
// Lines grow with zoom so they stay distinct from the street network
const zoomScale = (z: number) => Math.min(2.4, Math.max(1, 1 + (z - 12) * 0.3));
const STOP_MIN_ZOOM = 13;
const STOP_NAME_ZOOM = 16;
const GOTHENBURG: L.LatLngExpression = [57.7089, 11.9746];

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const toneColor = (t: Tone): string =>
  ({ base: css('--status-unplanned'), planned: css('--status-planned'), done: css('--status-done'), highlight: css('--highlight'), candidate: '#8e44ad', connector: '#d6342c' })[t];
/** Golden-angle hues keep neighbouring line numbers visually far apart. */
function rainbow(key: string, dark: boolean): string {
  // names like X40 have no leading number, so they get a number from their letters
  const n = parseInt(key, 10) || [...key].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7);
  const hue = (n * 137.508 + (key.endsWith('r') ? 60 : 0)) % 360;
  return `hsl(${hue.toFixed(0)}, 85%, ${dark ? 60 : 42}%)`;
}
const RAINBOW_TONES: Tone[] = ['base', 'planned', 'done', 'candidate'];
const toLatLngs = (c: [number, number][]) => c.map(([lon, lat]) => [lat, lon] as L.LatLngTuple);

export interface CardMapSnapshot extends CardViewport {
  tiles: { image: HTMLImageElement; x: number; y: number }[];
  complete: boolean;
  pending: boolean;
  filter: string;
}

/** Only public tile events and currently intersecting tiles are used for export. */
export function CourseMapPreview({ paths, start, end, onSnapshot }: {
  paths: CardPath[];
  start: [number, number] | null;
  end: [number, number] | null;
  onSnapshot: (snapshot: CardMapSnapshot | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const { resolved, mapStyle } = useAppearance();
  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: true, attributionControl: true, fadeAnimation: false, zoomAnimation: false });
    const coordinates = paths.flatMap((path) => path.coordinates);
    if (!coordinates.length) {
      onSnapshot({ width: 540, height: 400, zoom: 0, origin: [0, 0], tiles: [], complete: false, pending: false, filter: 'none' });
      return () => m.remove();
    }
    m.fitBounds(L.latLngBounds(toLatLngs(coordinates)), { padding: [24, 24], maxZoom: 15, animate: false });
    const layer = L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, crossOrigin: true, keepBuffer: 0, updateWhenIdle: true });
    const records = new Map<string, { image: HTMLImageElement; state: 'loading' | 'ready' | 'failed' }>();
    const key = ({ x, y, z }: { x: number; y: number; z: number }) => `${z}/${x}/${y}`;
    let moving = false;
    let timedOut = false;
    let deadline = 0;
    const publish = () => {
      if (moving) return;
      const size = m.getSize();
      if (!size.x || !size.y) { onSnapshot(null); return; }
      const origin = m.getPixelOrigin().add(m.containerPointToLayerPoint([0, 0]));
      const viewport: CardViewport = { width: size.x, height: size.y, zoom: m.getZoom(), origin: [origin.x, origin.y] };
      const slots = cardTiles(viewport);
      const tiles = slots.flatMap((slot) => {
        const record = records.get(key(slot));
        return record?.state === 'ready' && record.image.complete && record.image.naturalWidth
          ? [{ image: record.image, x: slot.x * 256 - origin.x, y: slot.y * 256 - origin.y }] : [];
      });
      const pending = !timedOut && slots.some((slot) => !records.has(key(slot)) || records.get(key(slot))?.state === 'loading');
      if (!pending) window.clearTimeout(deadline);
      onSnapshot({
        ...viewport, tiles, complete: tiles.length === slots.length,
        pending,
        filter: getComputedStyle(m.getPane('tilePane')!).filter,
      });
    };
    const armDeadline = () => {
      window.clearTimeout(deadline);
      timedOut = false;
      deadline = window.setTimeout(() => {
        timedOut = true;
        console.warn('Course card visible tile loading deadline reached');
        publish();
      }, 15000);
    };
    layer.on('tileloadstart', (event: L.TileEvent) => {
      records.set(key(event.coords), { image: event.tile, state: 'loading' });
      publish();
    });
    layer.on('tileload', (event: L.TileEvent) => {
      records.set(key(event.coords), { image: event.tile, state: 'ready' });
      publish();
    });
    layer.on('tileerror', (event: L.TileErrorEvent) => {
      records.set(key(event.coords), { image: event.tile, state: 'failed' });
      console.warn('Course card visible tile failed:', event.coords, event.error);
      publish();
    });
    layer.on('tileunload', (event: L.TileEvent) => { records.delete(key(event.coords)); });
    m.on('movestart zoomstart', () => { moving = true; onSnapshot(null); });
    m.on('moveend', () => { moving = false; armDeadline(); publish(); });
    for (const path of paths) {
      if (path.color?.toLowerCase() === '#ffffff') L.polyline(toLatLngs(path.coordinates), { color: '#003f58', weight: 6, interactive: false }).addTo(m);
      L.polyline(toLatLngs(path.coordinates), { color: path.color ?? css('--line'), weight: 4, interactive: false }).addTo(m);
    }
    for (const [point, color] of [[start, '#2e9e4f'], [end, '#d6342c']] as const) {
      if (point) L.circleMarker([point[1], point[0]], { color: '#fff', weight: 2, radius: 6, fillColor: color, fillOpacity: 1, interactive: false }).addTo(m);
    }
    armDeadline();
    layer.addTo(m);
    publish();
    const observer = new ResizeObserver(() => {
      if (el.current?.clientWidth && (el.current.clientWidth !== m.getSize().x || el.current.clientHeight !== m.getSize().y)) m.invalidateSize({ animate: false, pan: false });
    });
    observer.observe(el.current!);
    return () => {
      observer.disconnect();
      window.clearTimeout(deadline);
      layer.off();
      m.off();
      m.remove();
    };
  }, [paths, start, end, onSnapshot, resolved, mapStyle]);
  return <div className="course-card-map" ref={el} role="region" aria-label={t('courseCard.map')} />;
}

export function MapView({ layers, markers, stops, tappable, fit, onTap }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const group = useRef<L.LayerGroup | null>(null);
  const [zoom, setZoom] = useState(12);
  const [viewport, setViewport] = useState<GeoBounds | null>(null);
  const { resolved, border, lineColors, overlap, showLocation } = useAppearance();
  const latest = useRef({ tappable, onTap });
  latest.current = { tappable, onTap };

  useEffect(() => {
    const m = L.map(el.current!, { center: GOTHENBURG, zoom: 12, zoomControl: false, renderer: L.canvas({ padding: 0.8 }) });
    // crossOrigin makes tile responses readable, so the service worker can cache them without opaque-response overhead
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, crossOrigin: true }).addTo(m);
    m.on('zoomend', () => setZoom(m.getZoom()));
    const updateViewport = () => {
      const bounds = m.getBounds().pad(1);
      setViewport({ west: bounds.getWest(), east: bounds.getEast(), south: bounds.getSouth(), north: bounds.getNorth() });
    };
    m.on('moveend resize', updateViewport);
    updateViewport();
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

  const renderedLayers = useMemo(
    () => layers.filter((layer) => layer.tone === 'highlight' || (viewport && boundsIntersect(pathBounds(layer.coords), viewport))),
    [layers, viewport],
  );

  // Lines sharing a road are found once per set of visible layers
  const runs = useMemo(
    () => {
      if (overlap === 'stack') return null;
      // lines closer than ~4 px would visibly touch, so the sharing distance follows the zoom
      const cell = Math.min(40, Math.max(10, 4 * ((40075016 * Math.cos((57.7 * Math.PI) / 180)) / (256 * 2 ** zoom))));
      const shared = renderedLayers.filter((l) => l.key && RAINBOW_TONES.includes(l.tone));
      const input = (fixed: boolean) => shared.filter((l) => !!l.fixedColor === fixed).map((l) => ({ key: l.key!, coords: l.coords }));
      // trams are thicker and run on their own tracks, so they only share space with each other
      return new Map([...splitByOverlap(input(false), cell), ...splitByOverlap(input(true), cell)]);
    },
    [renderedLayers, overlap, zoom],
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
    // A white tram line (line 1) would vanish on the map, so trams always keep a dark edge in that case
    const casingOptions = (l: MapLayer, tram: string | null, outline: number, width: number, opacity: number): L.PolylineOptions | null => {
      if (l.tone === 'connector') return null;
      const pale = tram?.toLowerCase() === '#ffffff';
      const px = pale ? Math.max(outline, 2) : outline;
      if (px <= 0) return null;
      return { color: pale ? '#231f20' : casingColor, weight: width + px, opacity: Math.min(1, opacity * 0.95), interactive: false };
    };
    const pieces: Piece[] = [];
    for (const l of renderedLayers) {
      const tram = l.fixedColor && RAINBOW_TONES.includes(l.tone) ? l.fixedColor : null;
      const color = tram ? tram : rainbowOn && l.key && RAINBOW_TONES.includes(l.tone) ? rainbow(l.key, resolved === 'dark') : toneColor(l.tone);
      // trams are all run, so they are drawn as a plain line in their own colour, without a status line
      const statusWeight = (l.weight ?? 3) * zoomScale(zoom);
      const weight = tram ? statusWeight * 1.4 : statusWeight;
      const outline = BORDER_PX[border] + (l.casing ? 2 : 0);
      const opacity = l.opacity ?? 0.9;
      const parts = runs && l.key && runs.has(l.key) ? runs.get(l.key)! : [{ coords: l.coords, group: [l.key ?? ''], flip: false }];
      for (const part of parts) {
        const n = part.group.length;
        const i = part.group.indexOf(l.key!);
        const side = overlap === 'side' && n > 1;
        const stripe = overlap === 'stripes' && n > 1 && !tram;
        const pts = side ? shifted(part.coords, (part.flip ? -1 : 1) * (i - (n - 1) / 2) * (weight + Math.min(2, BORDER_PX[border]))) : toLatLngs(part.coords);
        const dash = Math.max(8, weight * 1.6);
        pieces.push({
          pts,
          top: !!l.casing,
          casing: casingOptions(l, tram, outline, weight, opacity),
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
    for (const l of renderedLayers) {
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
    if (zoom >= STOP_MIN_ZOOM) {
      for (const st of stops) {
        const dot = L.circleMarker([st.at[1], st.at[0]], {
          radius: 4.5,
          color: resolved === 'dark' ? '#0b1a22' : '#231f20',
          weight: 2,
          fillColor: '#fff',
          fillOpacity: 1,
          bubblingMouseEvents: false,
        });
        // a tap or hover names the stop; close up the names stay visible
        dot.bindTooltip(st.name, { direction: 'top', offset: [0, -6], permanent: zoom >= STOP_NAME_ZOOM, className: 'stop-label' });
        dot.on('click', () => dot.openTooltip());
        dot.addTo(g);
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
  }, [renderedLayers, runs, markers, stops, zoom, resolved, border, lineColors, overlap]);

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
