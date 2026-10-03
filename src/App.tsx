import { useEffect, useMemo, useState } from 'react';
import { MapView, type Fit, type MapLayer, type MapMarker, type Tone } from './components/MapView';
import { BuilderPanel, BuilderStrip, CourseList, LineCard, SplitDialog } from './components/Courses';
import { loadDataset } from './data/dataset';
import { DEFAULT_RADIUS_M, loadCourses, loadDraft, loadRadius, saveCourses, saveDraft, saveRadius, type Draft } from './data/store';
import {
  courseStats,
  legEnd,
  legStart,
  nextOptions,
  orientedCoordinates,
  canReverse,
  removeFirst,
  removeLast,
  reverseLegs,
  splitAt,
  routeInfo,
  routeStatuses,
  usedLineKeys,
  formatDistance,
  type Course,
  type Leg,
  type Option,
  type RouteStatus,
} from './domain/course';
import { applyFilters, categoryLabel, defaultFilters, formatKm, searchLines, sortLines, statusFilterLabel, tagLabel, type Filters, type StatusFilter } from './domain/filter';
import { LANG_NAMES, LANGS, lineLabel, setLangPref, t, tn, useLang, type LangPref } from './i18n';
import type { Category, Dataset, Line, Tag } from './domain/types';

type Mode = 'browse' | 'plan' | 'build';

const ALL_TAGS: Tag[] = ['call-ordered', 'loop', 'one-way', 'retur'];
const STATUS_FILTERS: StatusFilter[] = ['all', 'unplanned', 'incomplete', 'completed'];
const EMPTY_DRAFT: Draft = { name: '', legs: [] };
const toneOf: Record<RouteStatus, Tone> = { NotPlanned: 'base', NotCompleted: 'planned', Completed: 'done' };

interface ChooserItem {
  id: string;
  badge: string;
  text: string;
  km: string;
  pick: () => void;
}

const pt = (p: { lat: number; lon: number }): [number, number] => [p.lon, p.lat];

/** Highlighted legs in order, with dashed red connectors for the gaps and start/end markers. */
function legLayers(legs: Leg[]): { layers: MapLayer[]; markers: MapMarker[] } {
  const layers: MapLayer[] = [];
  legs.forEach((leg, i) => {
    if (leg.kind === 'line') layers.push({ coords: orientedCoordinates(leg), tone: 'highlight', weight: 6, casing: true, opacity: 1 });
    const a = legEnd(leg);
    const b = legs[i + 1] && legStart(legs[i + 1]);
    if (a && b) layers.push({ coords: [pt(a), pt(b)], tone: 'connector', weight: 4, dashed: true, opacity: 1 });
  });
  const markers: MapMarker[] = [];
  const first = legs.length ? legStart(legs[0]) : null;
  const last = legs.length ? legEnd(legs[legs.length - 1]) : null;
  if (first) markers.push({ at: pt(first), color: 'start' });
  if (last) markers.push({ at: pt(last), color: 'end' });
  return { layers, markers };
}

const legCoords = (legs: Leg[]) => legs.flatMap((l) => (l.kind === 'line' ? l.line.coordinates : []));

export function App() {
  const { pref } = useLang();
  const [showSettings, setShowSettings] = useState(false);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ready, setReady] = useState(false);
  const [radiusM, setRadiusM] = useState(loadRadius);
  const [mode, setMode] = useState<Mode>('browse');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [chooser, setChooser] = useState<ChooserItem[] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fit, setFit] = useState<Fit | null>(null);
  const [split, setSplit] = useState<{ at: number; name1: string; name2: string } | null>(null);

  useEffect(() => {
    loadDataset()
      .then((r) => {
        setDataset(r.dataset);
        setOffline(r.offline);
      })
      .catch((e) => setError(String(e.message ?? e)));
    Promise.all([loadCourses(), loadDraft()])
      .then(([c, d]) => {
        setCourses(c);
        // an edit draft is only meaningful while its course still exists and is not completed
        const stale = d?.editingId && !c.some((x) => x.id === d.editingId && x.status !== 'Completed');
        setDraft(stale ? null : d);
        setReady(true);
      })
      .catch(() => setToast(t('toast.loadCourses')));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const empty = !draft || (draft.legs.length === 0 && draft.name === '');
    saveDraft(empty ? null : draft).catch(() => setToast('Kunde inte spara utkastet.'));
  }, [draft, ready]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const statuses = useMemo(() => routeStatuses(courses), [courses]);
  const statusOf = (key: string): RouteStatus => statuses.get(key)?.status ?? 'NotPlanned';
  const visible = useMemo(() => (dataset ? applyFilters(dataset.lines, filters, statusOf) : []), [dataset, filters, statuses]);
  const listed = useMemo(() => sortLines(searchLines(visible, query)), [visible, query]);
  const selected = useMemo(() => dataset?.lines.find((l) => l.key === selectedKey) ?? null, [dataset, selectedKey]);
  const selectedCourse = useMemo(() => courses.find((c) => c.id === selectedCourseId) ?? null, [courses, selectedCourseId]);

  const legs = draft?.legs ?? [];
  // the course being edited releases its own lines for the draft
  const others = useMemo(() => courses.filter((c) => c.id !== draft?.editingId), [courses, draft?.editingId]);
  const options = useMemo(() => {
    if (mode !== 'build' || !dataset) return [];
    const pool = applyFilters(dataset.lines, { ...filters, status: 'all' });
    return nextOptions(pool, usedLineKeys(others, legs), legs, radiusM);
  }, [mode, dataset, filters, others, legs, radiusM]);

  const fitTo = (coords: [number, number][], topInset = 70) => setFit({ coords, seq: (fit?.seq ?? 0) + 1, topInset });

  const commit = async (next: Course[]): Promise<boolean> => {
    try {
      await saveCourses(next);
      setCourses(next);
      return true;
    } catch {
      setToast(t('toast.save'));
      return false;
    }
  };

  const setRadius = (m: number) => {
    setRadiusM(m);
    if (m >= 50 && m <= 5000) saveRadius(m);
  };

  const pickLine = (l: Line) => {
    setSelectedKey(l.key);
    setChooser(null);
    fitTo(l.coordinates);
  };

  const addOption = (o: Option) => {
    const leg: Leg = { kind: 'line', line: o.line, reversed: o.reversed };
    setDraft((d) => ({ ...(d ?? EMPTY_DRAFT), legs: [...(d?.legs ?? []), leg] }));
    setChooser(null);
    fitTo(o.line.coordinates, 230);
  };

  const optionItem = (o: Option): ChooserItem => ({
    id: `${o.line.key}-${o.reversed}`,
    badge: o.line.label,
    text: `${o.reversed ? o.line.to : o.line.from} → ${o.reversed ? o.line.from : o.line.to}${o.gapM !== null ? t('option.gap', { dist: formatDistance(o.gapM) }) : ''}`,
    km: formatKm(o.line.lengthM),
    pick: () => addOption(o),
  });

  const onTap = (hits: Line[]) => {
    if (mode === 'build') {
      const opts = options.filter((o) => hits.some((h) => h.key === o.line.key));
      if (opts.length === 1) addOption(opts[0]);
      else if (opts.length > 1) setChooser(opts.map(optionItem));
      else setChooser(null);
      return;
    }
    if (mode === 'plan') {
      const hit = hits.find((h) => statuses.has(h.key));
      setChooser(null);
      const id = hit ? statuses.get(hit.key)!.courseId : null;
      selectCourse(id);
      return;
    }
    if (hits.length === 0) {
      setSelectedKey(null);
      setChooser(null);
    } else if (hits.length === 1) pickLine(hits[0]);
    else setChooser(hits.map((l) => ({ id: l.key, badge: l.label, text: `${l.from} → ${l.to}`, km: formatKm(l.lengthM), pick: () => pickLine(l) })));
  };

  const selectCourse = (id: string | null) => {
    setSelectedCourseId(id);
    const c = courses.find((x) => x.id === id);
    if (c) fitTo(legCoords(c.legs));
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setChooser(null);
    setSelectedKey(null);
  };

  const startBuild = () => {
    setDraft((d) => d ?? EMPTY_DRAFT);
    setSelectedCourseId(null);
    setChooser(null);
    setMode('build');
  };

  const startEdit = (c: Course) => {
    if (c.status === 'Completed') return;
    if (draft && draft.editingId !== c.id && draft.legs.length > 0 && !confirm(t('confirm.discardOther'))) return;
    if (draft?.editingId !== c.id) setDraft({ name: c.name, legs: c.legs, editingId: c.id });
    setChooser(null);
    setMode('build');
    fitTo(legCoords(c.legs), 230);
  };

  const closeBuild = () => {
    setMode('plan');
    setChooser(null);
  };

  const discardDraft = () => {
    if (legs.length > 0 && !confirm(t('confirm.discardDraft'))) return;
    setDraft(null);
    closeBuild();
  };

  const saveDraftAsCourse = async () => {
    if (!draft || !legs.some((l) => l.kind === 'line')) return;
    setSaving(true);
    const now = new Date().toISOString();
    if (draft.editingId) {
      const existing = courses.find((c) => c.id === draft.editingId);
      if (!existing || existing.status === 'Completed') {
        setSaving(false);
        setToast(t('toast.courseGoneUnsaved'));
        return;
      }
      const updated: Course = { ...existing, name: draft.name.trim() || existing.name, legs: draft.legs, updatedAt: now };
      const ok = await commit(courses.map((c) => (c.id === updated.id ? updated : c)));
      setSaving(false);
      if (ok) {
        setDraft(null);
        setMode('plan');
        setSelectedCourseId(updated.id);
        fitTo(legCoords(updated.legs));
      }
      return;
    }
    const course: Course = {
      id: crypto.randomUUID(),
      name: draft.name.trim() || t('course.defaultName', { n: courses.length + 1 }),
      status: 'NotCompleted',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      legs: draft.legs,
    };
    const ok = await commit([...courses, course]);
    setSaving(false);
    if (ok) {
      setDraft(null);
      setMode('plan');
      setSelectedCourseId(course.id);
      fitTo(legCoords(course.legs));
    }
  };

  const openSplit = (at: number) => {
    const base = draft?.name.trim() || t('course.baseName');
    setSplit({ at, name1: `${base} 1`, name2: `${base} 2` });
  };

  const confirmSplit = async () => {
    if (!split || !draft?.editingId) return;
    const existing = courses.find((c) => c.id === draft.editingId);
    if (!existing || existing.status === 'Completed') {
      setToast(t('toast.courseGone'));
      setSplit(null);
      return;
    }
    const [a, b] = splitAt(draft.legs, split.at);
    const now = new Date().toISOString();
    const first: Course = { ...existing, name: split.name1.trim(), legs: a, status: 'NotCompleted', completedAt: null, updatedAt: now };
    const second: Course = { id: crypto.randomUUID(), name: split.name2.trim(), status: 'NotCompleted', createdAt: now, updatedAt: now, completedAt: null, legs: b };
    setSaving(true);
    // one write replaces the old course with both halves, so a failure leaves nothing half-split
    const next = courses.flatMap((c) => (c.id === existing.id ? [first, second] : [c]));
    const ok = await commit(next);
    setSaving(false);
    if (ok) {
      setSplit(null);
      setDraft(null);
      setMode('plan');
      setSelectedCourseId(first.id);
      fitTo(legCoords(first.legs));
    }
  };

  const toggleComplete = async (c: Course) => {
    const completing = c.status !== 'Completed';
    const msg = completing
      ? t('confirm.complete', { name: c.name })
      : t('confirm.uncomplete', { name: c.name });
    if (!confirm(msg)) return;
    const now = new Date().toISOString();
    await commit(courses.map((x) => (x.id === c.id ? { ...x, status: completing ? 'Completed' : 'NotCompleted', completedAt: completing ? now : null, updatedAt: now } : x)));
  };

  const deleteCourse = async (c: Course) => {
    if (!confirm(t(c.status === 'Completed' ? 'confirm.deleteDone' : 'confirm.deleteOpen', { name: c.name }))) return;
    if (await commit(courses.filter((x) => x.id !== c.id))) setSelectedCourseId(null);
  };

  const toggleTag = (t: Tag) => setFilters((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));
  const num = (v: string) => (v === '' ? null : Number(v.replace(',', '.')));

  const { layers, markers, tappable } = useMemo(() => {
    const layers: MapLayer[] = [];
    let markers: MapMarker[] = [];
    let tappable: Line[] = [];
    if (mode === 'build') {
      const used = usedLineKeys(others, legs);
      const optionKeys = new Set(options.map((o) => o.line.key));
      const pool = dataset ? applyFilters(dataset.lines, { ...filters, status: 'all' }) : [];
      for (const l of pool) if (!used.has(l.key) && !optionKeys.has(l.key)) layers.push({ coords: l.coordinates, tone: 'base', opacity: 0.5 });
      const seen = new Set<string>();
      for (const o of options) {
        if (seen.has(o.line.key)) continue;
        seen.add(o.line.key);
        tappable.push(o.line);
        layers.push({ coords: o.line.coordinates, tone: 'candidate', weight: 5, casing: true, opacity: 1 });
      }
      const d = legLayers(legs);
      layers.push(...d.layers);
      markers = d.markers;
    } else {
      const dim = mode === 'plan' && selectedCourse !== null;
      const shown = visible.filter((l) => l.key !== selectedKey);
      for (const l of shown) {
        const st = statusOf(l.key);
        layers.push({ coords: l.coordinates, tone: toneOf[st], weight: st === 'NotPlanned' ? 3 : 4, opacity: dim || selectedKey ? 0.4 : 0.85 });
      }
      if (mode === 'plan') {
        tappable = courses.flatMap((c) => c.legs.flatMap((l) => (l.kind === 'line' ? [l.line] : [])));
        if (selectedCourse) {
          const d = legLayers(selectedCourse.legs);
          layers.push(...d.layers);
          markers = d.markers;
        }
      } else {
        tappable = visible;
        if (selected) {
          layers.push({ coords: selected.coordinates, tone: 'highlight', weight: 6, casing: true, opacity: 1 });
          markers = [
            { at: selected.coordinates[0], color: 'start' },
            { at: selected.coordinates[selected.coordinates.length - 1], color: 'end' },
          ];
        }
      }
    }
    return { layers, markers, tappable };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dataset, visible, selected, selectedKey, selectedCourse, courses, others, legs, options, filters]);

  const stats = courseStats(legs);

  return (
    <div className="app">
      <header className="topbar">
        <h1>{t('app.title')}</h1>
        {mode !== 'build' && (
          <>
            <button aria-pressed={mode === 'browse'} onClick={() => switchMode('browse')}>
              {t('nav.map')}
            </button>
            <button aria-pressed={mode === 'plan'} onClick={() => switchMode('plan')}>
              {t('nav.plan')}
            </button>
          </>
        )}
        <button aria-pressed={showFilters} onClick={() => setShowFilters((s) => !s)}>
          {t('nav.filter')}
        </button>
        <button aria-label={t('nav.settings')} onClick={() => setShowSettings(true)}>
          ⚙
        </button>
      </header>
      <main className="main">
        {error && !dataset ? (
          <div className="status">
            <div>
              <p>{t('load.error')}</p>
              <p className="muted">{error}</p>
              <button className="chip" onClick={() => location.reload()}>
                {t('load.retry')}
              </button>
            </div>
          </div>
        ) : !dataset ? (
          <div className="status">{t('load.loading')}</div>
        ) : (
          <MapView layers={layers} markers={markers} tappable={tappable} fit={fit} onTap={onTap} />
        )}

        {mode === 'build' && (
          <BuilderStrip
            name={draft?.name ?? ''}
            legs={legs}
            onName={(name) => setDraft((d) => ({ ...(d ?? EMPTY_DRAFT), name }))}
            onSave={saveDraftAsCourse}
            onCancel={closeBuild}
            saving={saving}
            canSave={legs.some((l) => l.kind === 'line') && ready}
            editing={!!draft?.editingId}
            onRemoveFirst={() => setDraft((d) => (d ? { ...d, legs: removeFirst(d.legs) } : d))}
            onRemoveLast={() => setDraft((d) => (d ? { ...d, legs: removeLast(d.legs) } : d))}
            onSplit={openSplit}
          />
        )}

        {noticeOpen && mode !== 'build' && (
          <div className="notice" role="note">
            <span>
              {t('notice.text')}
              {offline && t('notice.offline')}
            </span>
            <button aria-label={t('common.close')} onClick={() => setNoticeOpen(false)}>
              ×
            </button>
          </div>
        )}

        {toast && (
          <div className="toast" role="alert">
            {toast}
          </div>
        )}

        {split && draft && (
          <SplitDialog
            first={splitAt(draft.legs, split.at)[0]}
            second={splitAt(draft.legs, split.at)[1]}
            name1={split.name1}
            name2={split.name2}
            onName1={(n) => setSplit((x) => x && { ...x, name1: n })}
            onName2={(n) => setSplit((x) => x && { ...x, name2: n })}
            onConfirm={confirmSplit}
            onCancel={() => setSplit(null)}
            saving={saving}
          />
        )}

        {chooser && (
          <div className="chooser" role="dialog" aria-label={t('chooser.aria')}>
            <p className="muted">{t('chooser.title')}</p>
            <ul className="list">
              {chooser.map((c) => (
                <li key={c.id}>
                  <button onClick={c.pick}>
                    <span className="badge">{c.badge}</span>
                    <span>{c.text}</span>
                    <span className="km">{c.km}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="chip" onClick={() => setChooser(null)}>
              {t('common.close')}
            </button>
          </div>
        )}

        {dataset && (
          <section className={`sheet ${mode}`} aria-label={mode === 'build' ? t('sheet.build') : mode === 'plan' ? t('sheet.plan') : t('sheet.browse')}>
            <div className="sheet-handle" />
            <div className="sheet-body">
              {showFilters && (
                <div className="filters">
                  <div className="chips" role="group" aria-label={t('filter.category')}>
                    {(['stadsbuss', 'stombuss', 'all'] as const).map((c) => (
                      <button key={c} className="chip" aria-pressed={filters.category === c} onClick={() => setFilters((f) => ({ ...f, category: c }))}>
                        {c === 'all' ? t('filter.all') : categoryLabel(c as Category)}
                      </button>
                    ))}
                  </div>
                  {mode !== 'build' && (
                    <div className="chips" role="group" aria-label={t('filter.status')}>
                      {STATUS_FILTERS.map((s) => (
                        <button key={s} className="chip" aria-pressed={filters.status === s} onClick={() => setFilters((f) => ({ ...f, status: s }))}>
                          {statusFilterLabel(s)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="chips" role="group" aria-label={t('filter.tags')}>
                    {ALL_TAGS.map((t) => (
                      <button key={t} className="chip" aria-pressed={filters.tags.includes(t)} onClick={() => toggleTag(t)}>
                        {tagLabel(t)}
                      </button>
                    ))}
                  </div>
                  <div className="field">
                    <input inputMode="decimal" placeholder={t('filter.minKm')} aria-label={t('filter.minKmAria')} value={filters.minKm ?? ''} onChange={(e) => setFilters((f) => ({ ...f, minKm: num(e.target.value) }))} />
                    <input inputMode="decimal" placeholder={t('filter.maxKm')} aria-label={t('filter.maxKmAria')} value={filters.maxKm ?? ''} onChange={(e) => setFilters((f) => ({ ...f, maxKm: num(e.target.value) }))} />
                  </div>
                </div>
              )}

              {mode === 'build' && (
                <BuilderPanel
                  options={options}
                  hasLegs={legs.length > 0}
                  radiusM={radiusM || DEFAULT_RADIUS_M}
                  onRadius={setRadius}
                  onPick={addOption}
                  onUndo={() => setDraft((d) => (d ? { ...d, legs: removeLast(d.legs) } : d))}
                  canReverse={canReverse(legs)}
                  onReverse={() => setDraft((d) => (d && canReverse(d.legs) ? { ...d, legs: reverseLegs(d.legs) } : d))}
                  editing={!!draft?.editingId}
                  onAddManual={(label, lengthM) =>
                    setDraft((d) => ({ ...(d ?? EMPTY_DRAFT), legs: [...(d?.legs ?? []), { kind: 'manual', id: crypto.randomUUID(), label, lengthM }] }))
                  }
                  onDiscard={discardDraft}
                />
              )}

              {mode === 'plan' && (
                <CourseList
                  courses={courses}
                  selectedId={selectedCourseId}
                  draftLegs={legs.length}
                  draftEditingId={draft?.editingId ?? null}
                  onEdit={startEdit}
                  onSelect={selectCourse}
                  onCreate={startBuild}
                  onToggleComplete={toggleComplete}
                  onDelete={deleteCourse}
                />
              )}

              {mode === 'browse' && (
                <>
                  {selected && <LineCard line={selected} info={routeInfo(selected.key, courses)} onClose={() => setSelectedKey(null)} />}
                  <div className="field">
                    <input type="search" placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                  <p className="muted">
                    {t('list.count', { shown: listed.length, total: dataset.lines.length, version: dataset.feedVersion })}
                  </p>
                  <ul className="list">
                    {listed.map((l) => {
                      const st = statusOf(l.key);
                      return (
                        <li key={l.key}>
                          <button onClick={() => pickLine(l)} aria-current={l.key === selectedKey}>
                            <span className="badge">{lineLabel(l)}</span>
                            <span>
                              {l.from} → {l.to}
                              <br />
                              <span className="sub">{[st === 'Completed' ? t('list.completed') : st === 'NotCompleted' ? t('list.planned') : '', ...l.tags.map((tag) => tagLabel(tag))].filter(Boolean).join(' · ')}</span>
                            </span>
                            <span className="km">{formatKm(l.lengthM)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {mode === 'build' && <p className="muted">{stats.gaps.length ? tn('panel.gaps', stats.gaps.length, { dist: formatDistance(stats.gapM) }) : t('panel.gapsNone')}</p>}
            </div>
          </section>
        )}
        {showSettings && dataset && (
          <div className="modal-back" onClick={() => setShowSettings(false)}>
            <div className="modal" role="dialog" aria-modal="true" aria-label={t('settings.title')} onClick={(e) => e.stopPropagation()}>
              <h2>{t('settings.title')}</h2>
              <label className="field">
                <span>{t('settings.language')}</span>
                <select value={pref} onChange={(e) => setLangPref(e.target.value as LangPref)}>
                  <option value="auto">{t('settings.auto')}</option>
                  {LANGS.map((l) => (
                    <option key={l} value={l}>
                      {LANG_NAMES[l]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">{t('settings.data', { version: dataset.feedVersion })}</p>
              <button className="chip" onClick={() => setShowSettings(false)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
