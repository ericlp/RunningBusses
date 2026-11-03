import { useEffect, useState } from 'react';
import { buildCourseElevation, coordinateAtCourseDistance, type CourseElevation } from '../domain/elevation';
import { formatDistance, type Leg } from '../domain/course';
import type { Catalog, CatalogManifest } from '../domain/types';
import { t } from '../i18n';
import { loadElevationProfiles } from '../data/routeExtras';

interface Props {
  id: string;
  title: string;
  legs: Leg[];
  manifest: CatalogManifest | null;
  catalog: Catalog | null;
  onPosition: (point: [number, number] | null) => void;
}

function chartSegments(data: CourseElevation, width: number, height: number): string[] {
  const { points, summary } = data;
  if (summary.totalM <= 0) return [];
  const heights = points.flatMap((point) => point.elevationM === null ? [] : [point.elevationM]);
  if (!heights.length) return [];
  const minimum = Math.min(...heights);
  const maximum = Math.max(...heights);
  const range = Math.max(1, maximum - minimum);
  const padding = 8;
  const segments: string[] = [];
  let segment: string[] = [];
  for (const point of points) {
    if (point.elevationM === null) {
      if (segment.length > 1) segments.push(segment.join(' '));
      segment = [];
      continue;
    }
    const x = (point.courseDistanceM / summary.totalM) * width;
    const y = height - padding - ((point.elevationM - minimum) / range) * (height - padding * 2);
    segment.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  if (segment.length > 1) segments.push(segment.join(' '));
  return segments;
}

export function ElevationPanel({ id, title, legs, manifest, catalog, onPosition }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [data, setData] = useState<CourseElevation | null>(null);
  const [source, setSource] = useState<{ attribution: string; licence: string; note: string } | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [selectedDistance, setSelectedDistance] = useState(0);
  const routeKeys = legs.flatMap((leg) => leg.kind === 'line' ? [leg.line.key] : []);
  const keys = [...new Set(routeKeys)];

  const load = async () => {
    if (!manifest || !catalog) return;
    setLoading(true);
    setError(false);
    setData(null);
    try {
      const result = await loadElevationProfiles(manifest, catalog, keys);
      setSource(result.manifest?.source ?? null);
      setStorageError(result.storageError);
      const courseElevation = await buildCourseElevation({ legs }, result.profiles);
      setData(courseElevation);
      if (result.storageError) console.warn('Elevation profiles could not be fully saved for offline use.');
      if (result.unavailableKeys.length) {
        console.info('Elevation profiles unavailable for routes:', result.unavailableKeys);
      }
    } catch (reason) {
      console.warn('Elevation profiles could not be loaded:', reason);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const position = (distanceM: number) => {
    setSelectedDistance(distanceM);
    onPosition(coordinateAtCourseDistance(legs, distanceM));
  };

  useEffect(() => () => onPosition(null), [onPosition]);

  return (
    <section className="elevation-panel" aria-label={t('elevation.title', { name: title })} data-elevation-id={id}>
      <button className="chip" aria-expanded={open} onClick={() => {
        const next = !open;
        setOpen(next);
        if (next && !data && !loading && manifest && catalog) void load();
        if (!next) onPosition(null);
      }}>
        {open ? t('elevation.hide') : t('elevation.show')}
      </button>
      {open && (
        <div className="elevation-content">
          {!manifest || !catalog ? <p className="muted">{t('elevation.noData')}</p> : null}
          {loading && <p role="status">{t('elevation.loading')}</p>}
          {error && (
            <div role="alert">
              <p>{t('elevation.error')}</p>
              <button className="chip" onClick={() => void load()}>{t('elevation.retry')}</button>
            </div>
          )}
          {data && (
            <>
              {data.summary.coveredM === 0 && <p className="muted">{t('elevation.none')}</p>}
              <svg className="elevation-chart" viewBox="0 0 320 110" role="img" aria-label={t('elevation.chartAria', { name: title })}>
                {chartSegments(data, 320, 110).map((segment, index) => (
                  <polyline key={index} points={segment} fill="none" stroke="var(--vt-blue-strong)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                ))}
                {(() => {
                  const point = data.points.find((item) => item.elevationM !== null && Math.abs(item.courseDistanceM - selectedDistance) < 0.5);
                  const heights = data.points.flatMap((item) => item.elevationM === null ? [] : [item.elevationM]);
                  if (!point || heights.length === 0) return null;
                  const min = Math.min(...heights);
                  const max = Math.max(...heights);
                  const y = 102 - ((point.elevationM! - min) / Math.max(1, max - min)) * 94;
                  return <circle cx={(point.courseDistanceM / Math.max(1, data.summary.totalM)) * 320} cy={y} r="4" fill="var(--status-done)" />;
                })()}
              </svg>
              <label className="elevation-position">
                <span>{t('elevation.position')}</span>
                <input
                  type="range"
                  aria-label={t('elevation.position')}
                  min={0}
                  max={Math.max(1, Math.round(data.summary.totalM))}
                  step={25}
                  value={Math.min(Math.round(selectedDistance), Math.max(1, Math.round(data.summary.totalM)))}
                  onChange={(event) => position(Number(event.target.value))}
                />
              </label>
              <p className="elevation-coverage">{t('elevation.coverage', {
                covered: formatDistance(data.summary.coveredM),
                total: formatDistance(data.summary.totalM),
              })}</p>
              <dl className="elevation-stats">
                <div><dt>{t('elevation.ascent')}</dt><dd>{data.summary.ascentM === null ? '—' : formatDistance(data.summary.ascentM)}</dd></div>
                <div><dt>{t('elevation.descent')}</dt><dd>{data.summary.descentM === null ? '—' : formatDistance(data.summary.descentM)}</dd></div>
                <div><dt>{t('elevation.lowHigh')}</dt><dd>{data.summary.lowestM === null || data.summary.highestM === null ? '—' : `${Math.round(data.summary.lowestM)}–${Math.round(data.summary.highestM)} m`}</dd></div>
                <div><dt>{t('elevation.steepest')}</dt><dd>{data.summary.steepest200m ? `${data.summary.steepest200m.changeM > 0 ? '+' : ''}${Math.round(data.summary.steepest200m.changeM)} m / 200 m` : '—'}</dd></div>
              </dl>
              {data.summary.incomplete && <p className="muted">{t('elevation.incomplete')}</p>}
              {storageError && <p className="muted">{t('elevation.storageError')}</p>}
              {source && <p className="elevation-source">{source.attribution} {source.licence}. {source.note}</p>}
              {!source && <p className="elevation-source">{t('elevation.noSource')}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
