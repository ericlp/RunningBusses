import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Line } from '../domain/types';
import { linesNear } from '../domain/hit';

interface Props {
  lines: Line[];
  selected: Line | null;
  onTap: (hits: Line[]) => void;
}

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const GOTHENBURG: L.LatLngExpression = [57.7089, 11.9746];

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const toLatLngs = (l: Line) => l.coordinates.map(([lon, lat]) => [lat, lon] as L.LatLngTuple);

export function MapView({ lines, selected, onTap }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const latest = useRef({ lines, onTap });
  latest.current = { lines, onTap };

  useEffect(() => {
    const m = L.map(el.current!, { center: GOTHENBURG, zoom: 12, zoomControl: false, preferCanvas: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    layers.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      // 14 px tolerance converted to metres at the tap latitude
      const mPerPx = (40075016 * Math.cos((e.latlng.lat * Math.PI) / 180)) / (256 * 2 ** m.getZoom());
      latest.current.onTap(linesNear(latest.current.lines, e.latlng.lat, e.latlng.lng, 14 * mPerPx));
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const g = layers.current!;
    g.clearLayers();
    const base = cssVar('--line');
    const hi = cssVar('--highlight');
    const dim = selected !== null;
    for (const l of lines) {
      if (l.key === selected?.key) continue;
      L.polyline(toLatLngs(l), { color: base, weight: 3, opacity: dim ? 0.45 : 0.85, interactive: false }).addTo(g);
    }
    if (selected) {
      const pts = toLatLngs(selected);
      L.polyline(pts, { color: '#fff', weight: 10, opacity: 0.9, interactive: false }).addTo(g);
      L.polyline(pts, { color: hi, weight: 6, interactive: false }).addTo(g);
      L.circleMarker(pts[0], { radius: 8, color: '#fff', weight: 3, fillColor: '#2e9e4f', fillOpacity: 1 }).addTo(g);
      L.circleMarker(pts[pts.length - 1], { radius: 8, color: '#fff', weight: 3, fillColor: '#d6342c', fillOpacity: 1 }).addTo(g);
    }
  }, [lines, selected]);

  useEffect(() => {
    if (selected && map.current) {
      const wide = window.innerWidth >= 900;
      map.current.fitBounds(L.latLngBounds(toLatLngs(selected)), {
        paddingTopLeft: [wide ? 410 : 20, wide ? 80 : 70],
        paddingBottomRight: [20, wide ? 20 : 300],
        maxZoom: 15,
      });
    }
  }, [selected]);

  return <div className="map" ref={el} />;
}
