import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Line } from '../domain/types';
import { linesNear } from '../domain/hit';

export type Tone = 'base' | 'planned' | 'done' | 'highlight' | 'candidate' | 'connector';

export interface MapLayer {
  coords: [number, number][];
  tone: Tone;
  weight?: number;
  opacity?: number;
  dashed?: boolean;
  casing?: boolean;
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
const GOTHENBURG: L.LatLngExpression = [57.7089, 11.9746];

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const toneColor = (t: Tone): string =>
  ({ base: css('--line'), planned: css('--vt-blue'), done: '#2e9e4f', highlight: css('--highlight'), candidate: '#f08c00', connector: '#d6342c' })[t];
const toLatLngs = (c: [number, number][]) => c.map(([lon, lat]) => [lat, lon] as L.LatLngTuple);

export function MapView({ layers, markers, tappable, fit, onTap }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const group = useRef<L.LayerGroup | null>(null);
  const latest = useRef({ tappable, onTap });
  latest.current = { tappable, onTap };

  useEffect(() => {
    const m = L.map(el.current!, { center: GOTHENBURG, zoom: 12, zoomControl: false, preferCanvas: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
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
    const g = group.current!;
    g.clearLayers();
    for (const l of layers) {
      const pts = toLatLngs(l.coords);
      const color = toneColor(l.tone);
      const weight = l.weight ?? 3;
      if (l.casing) L.polyline(pts, { color: '#fff', weight: weight + 4, opacity: 0.9, interactive: false }).addTo(g);
      L.polyline(pts, { color, weight, opacity: l.opacity ?? 0.9, dashArray: l.dashed ? '8 8' : undefined, interactive: false }).addTo(g);
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
  }, [layers, markers]);

  useEffect(() => {
    if (!fit || !map.current || fit.coords.length === 0) return;
    const wide = window.innerWidth >= 900;
    map.current.fitBounds(L.latLngBounds(toLatLngs(fit.coords)), {
      paddingTopLeft: [wide ? 410 : 20, fit.topInset],
      paddingBottomRight: [20, wide ? 20 : 300],
      maxZoom: 15,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit?.seq]);

  return <div className="map" ref={el} />;
}
