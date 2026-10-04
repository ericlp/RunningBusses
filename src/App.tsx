import { useEffect, useMemo, useRef, useState } from 'react';
import { MapView, type Fit, type MapLayer, type MapMarker, type Tone } from './components/MapView';
import { BuilderPanel, BuilderStrip, CourseList, LineCard, SplitDialog } from './components/Courses';
import { StatsPanel } from './components/Stats';
import { sendShareLink } from './components/shareLink';
import { loadDataset } from './data/dataset';
import { DEFAULT_RADIUS_M, loadCourses, loadDraft, loadLog, loadPeople, loadRadius, loadRecovery, saveCourses, saveLog, savePeople, saveRecovery, saveDraft, saveRadius, type Draft } from './data/store';
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
import { applyFilters, categoryLabel, facetAvailability, defaultFilters, formatKm, loadFilters, loadSort, saveFilters, saveSort, sameCategories, searchLines, SORT_KEYS, sortLines, statusFilterLabel, tagLabel, type Filters, type SortKey, type StatusFilter } from './domain/filter';
import { badgeStyle } from './domain/color';
import { previewRefresh, reconcileCourses, refreshLegs } from './domain/reconcile';
import { legStops, lineStops, type StopPoint } from './domain/stops';
import { addEntry, makeEntry, removeEntry, type LogEntry } from './domain/log';
import { addPerson, knownPeople, loadProgressCategories, saveProgressCategories, toggleProgressCategory } from './domain/stats';
import { courseToGpx, gpxFileName } from './domain/gpx';
import { REPO_URL, Tour, type TourStep } from './components/Tour';
import { BackupSection } from './components/Backup';
import { decodeShare, payloadFromHash, type ShareError, type Shared } from './domain/share';
import type { Key } from './i18n/sv';
import { BORDERS, LINE_COLORS, OVERLAPS, setOverlap, MAP_STYLES, PAN_SPEEDS, THEMES, setBorder, setPanSpeed, setShowLocation, setLineColors, setMapStyle, setTheme, useAppearance, type Border, type Overlap, type LineColors, type MapStyle, type PanSpeed, type ThemePref } from './appearance';
import { LANG_NAMES, LANGS, lineLabel, setLangPref, t, tn, useLang, type LangPref } from './i18n';
import { CATEGORIES, type Category, type Dataset, type Line, type Tag } from './domain/types';

const STALE_DAYS = 45;

type Mode = 'browse' | 'plan' | 'build';

const ALL_TAGS: Tag[] = ['call-ordered', 'loop', 'one-way', 'retur'];
const STATUS_FILTERS: StatusFilter[] = ['all', 'unplanned', 'incomplete', 'completed'];
const EMPTY_DRAFT: Draft = { name: '', legs: [] };
import { STATUS_STYLE } from './domain/statusStyle';
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
    if (leg.kind === 'line') layers.push({ coords: orientedCoordinates(leg), tone: 'highlight', weight: 6, casing: true, opacity: 1, arrows: true });
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

// read once at load and removed from the address bar, so a reload does not import again
const initialSyncPayload = payloadFromHash(location.hash);
if (initialSyncPayload !== null) history.replaceState(null, '', location.pathname + location.search);

function viewFromHash(hash: string): { mode: Mode; line: string | null } {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  return { mode: q.get('mode') === 'plan' ? 'plan' : 'browse', line: q.get('line') };
}
const initialView = viewFromHash(location.hash);

export function App() {
  const { pref } = useLang();
  const { theme, mapStyle, border, lineColors, panSpeed, overlap, showLocation } = useAppearance();
  const [showSettings, setShowSettings] = useState(false);
  const syncPayload = useRef<string | null>(initialSyncPayload);
  const deepLinked = useRef(initialView.line !== null);
  const modeRef = useRef<Mode>(initialView.mode);
  const viewSynced = useRef(false);
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    // a link pasted into the address bar of an open tab only changes the hash
    const onHash = () => {
      const p = payloadFromHash(location.hash);
      if (p === null) {
        // a view link pasted into an open tab; never interrupt a draft
        const v = viewFromHash(location.hash);
        if (modeRef.current === 'build') return;
        deepLinked.current = v.line !== null;
        setMode(v.mode);
        setSelectedKey(v.line);
        setChooser(null);
        return;
      }
      syncPayload.current = p;
      history.replaceState(null, '', location.pathname + location.search);
      setSyncTick((n) => n + 1);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [incoming, setIncoming] = useState<{ shared: Shared | null; error: ShareError | null } | null>(null);
  // bottom sheet height on phones: 0 peek, 1 half, 2 tall
  const [snap, setSnap] = useState(1);
  const [naming, setNaming] = useState(false);
  const dragRef = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const [sheetH, setSheetH] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!showSettings) return;
    setShowFilters(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowSettings(false);
    const onPop = () => setShowSettings(false);
    history.pushState({ rbSettings: true }, '');
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      // closed by other means: drop the entry we added so Back doesn't need an extra press
      if (history.state?.rbSettings) history.back();
    };
  }, [showSettings]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [storedPeople, setStoredPeople] = useState<string[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [progressCategories, setProgressCategories] = useState<Category[]>(loadProgressCategories);
  useEffect(() => saveProgressCategories(progressCategories), [progressCategories]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ready, setReady] = useState(false);
  const [radiusM, setRadiusM] = useState(loadRadius);
  const [mode, setMode] = useState<Mode>(initialView.mode);
  modeRef.current = mode;
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>(loadSort);
  useEffect(() => saveFilters(filters), [filters]);
  useEffect(() => saveSort(sortBy), [sortBy]);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialView.line);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [chooser, setChooser] = useState<ChooserItem[] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => {
    if (!showFilters) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('.filter-panel, [data-filter-toggle]')) setShowFilters(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [showFilters]);
  const [tour, setTour] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fit, setFit] = useState<Fit | null>(null);
  const [completing, setCompleting] = useState<{ course: Course; date: string; participants: string[]; newName: string; editOnly: boolean } | null>(null);
  const [undo, setUndo] = useState<{ text: string; course: Course; entryId: string } | null>(null);
  const [split, setSplit] = useState<{ at: number; name1: string; name2: string } | null>(null);

  useEffect(() => {
    loadDataset()
      .then((r) => {
        setDataset(r.dataset);
        setOffline(r.offline);
      })
      .catch((e) => setError(String(e.message ?? e)));
    Promise.all([loadCourses(), loadDraft(), loadPeople().catch(() => [] as string[]), loadLog().catch(() => [] as LogEntry[])])
      .then(([c, d, p, lg]) => {
        setCourses(c);
        setLog(lg);
        setStoredPeople(p);
        // an edit draft is only meaningful while its course still exists and is not completed
        const stale = d?.editingId && !c.some((x) => x.id === d.editingId && x.status !== 'Completed');
        setDraft(stale ? null : d);
        setReady(true);
      })
      .catch(() => setToast(t('toast.loadCourses')));
  }, []);

  const reconciledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !dataset || reconciledFor.current === dataset.generatedAt) return;
    reconciledFor.current = dataset.generatedAt;
    const r = reconcileCourses(courses, dataset.lines);
    if (!r.changes.length) return;
    commit(r.courses).then((ok) => ok && setToast(tn('toast.updated', r.changes.length)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dataset]);

  useEffect(() => {
    if (!ready) return;
    const empty = !draft || (draft.legs.length === 0 && draft.name === '');
    saveDraft(empty ? null : draft).catch(() => setToast(t('toast.saveDraft')));
  }, [draft, ready]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(timer);
  }, [undo]);

  const people = useMemo(() => knownPeople(storedPeople, courses), [storedPeople, courses]);
  const addPersonName = async (name: string): Promise<string[]> => {
    const next = addPerson(people, name);
    if (next.length === people.length) return people;
    try {
      await savePeople(next);
      setStoredPeople(next);
      return next;
    } catch {
      setToast(t('toast.save'));
      return people;
    }
  };
  const removePersonName = async (name: string) => {
    const next = storedPeople.filter((p) => p.toLowerCase() !== name.toLowerCase());
    try {
      await savePeople(next);
      setStoredPeople(next);
    } catch {
      setToast(t('toast.save'));
    }
  };

  const statuses = useMemo(() => routeStatuses(courses), [courses]);
  const statusOf = (key: string): RouteStatus => statuses.get(key)?.status ?? 'NotPlanned';
  const visible = useMemo(() => (dataset ? applyFilters(dataset.lines, filters, statusOf) : []), [dataset, filters, statuses]);
  const listed = useMemo(() => sortLines(searchLines(visible, query), sortBy, statusOf), [visible, query, sortBy, statuses]);
  const selected = useMemo(() => dataset?.lines.find((l) => l.key === selectedKey) ?? null, [dataset, selectedKey]);
  useEffect(() => {
    if (mode === 'build' || !ready) return;
    const q = new URLSearchParams();
    if (mode === 'plan') q.set('mode', 'plan');
    if (selected) q.set('line', selected.key);
    const h = q.toString();
    // keep a pending #sync= link intact until it is consumed
    if (payloadFromHash(location.hash) !== null) return;
    const url = location.pathname + location.search + (h ? `#${h}` : '');
    if (url === location.pathname + location.search + location.hash) return;
    // the first sync only normalises the address; later selections are history entries so Back returns to the previous one
    if (viewSynced.current) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
    viewSynced.current = true;
  }, [mode, selected, ready]);
  useEffect(() => {
    if (!selected || !deepLinked.current) return;
    deepLinked.current = false;
    fitTo(selected.coordinates);
  }, [selected]);
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

  const onTourStep = (s: TourStep) => {
    switchMode(s.mode ?? 'browse');
    setShowFilters(!!s.filters);
  };
  const closeTour = () => {
    localStorage.setItem('rb.tour', 'done');
    setTour(false);
    switchMode('browse');
    setShowFilters(false);
  };
  useEffect(() => {
    // first visit only; automated browsers skip it so tests are not blocked
    if (dataset && !navigator.webdriver && !localStorage.getItem('rb.tour') && !syncPayload.current) setTour(true);
  }, [dataset]);
  useEffect(() => {
    // a shared link is only read; nothing is saved until the user confirms the import
    const payload = syncPayload.current;
    if (!dataset || !ready || !payload) return;
    syncPayload.current = null;
    void decodeShare(payload, dataset.lines).then((r) => {
      if (r.ok) setIncoming({ shared: r.shared, error: null });
      else setIncoming({ shared: null, error: r.error });
    });
  }, [dataset, ready, syncTick]);

  // a shared course opens straight on the map once it is saved
  const openImported = (imported: Course[]) => {
    setToast(t('backup.done'));
    setShowSettings(false);
    const first = imported[0];
    if (!first) return;
    setMode('plan');
    setChooser(null);
    setSelectedKey(null);
    setSelectedCourseId(first.id);
    fitTo(legCoords(first.legs));
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

  const applyImport = async (next: Course[], radius: number | null, nextPeople: string[], nextLog: LogEntry[]): Promise<boolean> => {
    try {
      await saveRecovery({ savedAt: new Date().toISOString(), courses });
    } catch {
      return false;
    }
    if (!(await commit(next))) return false;
    // the people list is rebuilt from the courses anyway, so a failure here loses nothing
    savePeople(nextPeople).then(() => setStoredPeople(nextPeople)).catch(() => undefined);
    saveLog(nextLog).then(() => setLog(nextLog)).catch(() => undefined);
    if (radius !== null) setRadius(radius);
    // a draft that edits a course which no longer exists or is now completed would be stale
    if (draft?.editingId && !next.some((x) => x.id === draft.editingId && x.status !== 'Completed')) setDraft(null);
    setSelectedCourseId(null);
    return true;
  };

  const refreshCourse = async (c: Course) => {
    if (!dataset) return;
    const change = previewRefresh(c, dataset.lines);
    if (change && !confirm(t('confirm.update', { name: c.name, old: formatDistance(change.oldTotalM), new: formatDistance(change.newTotalM) }))) return;
    const now = new Date().toISOString();
    if (await commit(courses.map((x) => (x.id === c.id ? { ...x, legs: refreshLegs(x.legs, dataset.lines), pinned: undefined, updatedAt: now } : x)))) {
      if (!change) setToast(t('toast.updateNone'));
    }
  };

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const toggleComplete = async (c: Course) => {
    if (c.status !== 'Completed') {
      // start from this course's earlier runners, else from whoever ran the latest completed course
      const last = [...courses].filter((x) => x.status === 'Completed' && x.participants?.length).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];
      setCompleting({ course: c, date: today(), participants: c.participants ?? last?.participants ?? [], newName: '', editOnly: false });
      return;
    }
    if (!confirm(t('confirm.uncomplete', { name: c.name }))) return;
    const now = new Date().toISOString();
    if (await commit(courses.map((x) => (x.id === c.id ? { ...x, status: 'NotCompleted', completedAt: null, pinned: true, updatedAt: now } : x)))) {
      const entry = makeEntry('uncompleted', c);
      writeLog(addEntry(log, entry));
      setUndo({ text: t('toast.uncompleted', { name: c.name }), course: c, entryId: entry.id });
    }
  };

  // the log is history only: a failed write must not block completing a course
  const writeLog = (next: LogEntry[]) => {
    setLog(next);
    saveLog(next).catch(() => undefined);
  };

  const editRun = (c: Course) => setCompleting({ course: c, date: c.completedAt?.slice(0, 10) || today(), participants: c.participants ?? [], newName: '', editOnly: true });

  const addCompletingPerson = async () => {
    if (!completing || !completing.newName.trim()) return;
    const typed = completing.newName;
    const added = addPerson([], typed)[0];
    if (!added) return;
    const all = await addPersonName(added);
    const stored = all.find((p) => p.toLowerCase() === added.toLowerCase()) ?? added;
    // keep text typed while the save was pending
    setCompleting((x) => x && { ...x, newName: x.newName === typed ? '' : x.newName, participants: x.participants.some((p) => p.toLowerCase() === stored.toLowerCase()) ? x.participants : [...x.participants, stored] });
  };

  const confirmComplete = async () => {
    if (!completing) return;
    const { course: c, date, participants, editOnly } = completing;
    const now = new Date().toISOString();
    const ordered = people.filter((p) => participants.includes(p));
    const done = (x: Course): Course => ({ ...x, status: 'Completed', completedAt: date || today(), pinned: undefined, participants: ordered.length ? ordered : undefined, updatedAt: now });
    if (await commit(courses.map((x) => (x.id === c.id ? done(x) : x)))) {
      setCompleting(null);
      if (!editOnly) {
        const entry = makeEntry('completed', done(c), new Date(now));
        writeLog(addEntry(log, entry));
        setUndo({ text: t('toast.completed', { name: c.name }), course: c, entryId: entry.id });
      }
    }
  };

  const undoLast = async () => {
    if (!undo) return;
    const { course, entryId } = undo;
    setUndo(null);
    if (await commit(courses.map((x) => (x.id === course.id ? course : x)))) writeLog(removeEntry(log, entryId));
  };

  const shareCourse = async (c: Course) => {
    if (!dataset) return;
    const msg = await sendShareLink([c], dataset.feedVersion, typeof navigator.share === 'function' ? 'share' : 'copy', true);
    if (msg) setToast(msg);
  };

  const exportGpx = (c: Course) => {
    const url = URL.createObjectURL(new Blob([courseToGpx(c)], { type: 'application/gpx+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = gpxFileName(c);
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteCourse = async (c: Course) => {
    if (!confirm(t(c.status === 'Completed' ? 'confirm.deleteDone' : 'confirm.deleteOpen', { name: c.name }))) return;
    if (await commit(courses.filter((x) => x.id !== c.id))) setSelectedCourseId(null);
  };

  // at least one category stays selected, so the list is never empty by accident
  const toggleCategory = (c: Category) =>
    setFilters((f) => {
      if (!f.categories.includes(c)) return { ...f, categories: CATEGORIES.filter((x) => x === c || f.categories.includes(x)) };
      return f.categories.length > 1 ? { ...f, categories: f.categories.filter((x) => x !== c) } : f;
    });
  const toggleTag = (t: Tag) => setFilters((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));
  const num = (v: string) => (v === '' ? null : Number(v.replace(',', '.')));

  const { layers, markers, stops, tappable } = useMemo(() => {
    const layers: MapLayer[] = [];
    let stops: StopPoint[] = [];
    let markers: MapMarker[] = [];
    let tappable: Line[] = [];
    if (mode === 'build') {
      const used = usedLineKeys(others, legs);
      const optionKeys = new Set(options.map((o) => o.line.key));
      const pool = dataset ? applyFilters(dataset.lines, { ...filters, status: 'all' }) : [];
      for (const l of pool) if (!used.has(l.key) && !optionKeys.has(l.key)) layers.push({ coords: l.coordinates, key: l.key, tone: 'base', opacity: 0.7, fixedColor: l.color });
      const seen = new Set<string>();
      for (const o of options) {
        if (seen.has(o.line.key)) continue;
        seen.add(o.line.key);
        tappable.push(o.line);
        layers.push({ coords: o.line.coordinates, key: o.line.key, tone: 'candidate', weight: 5, casing: true, opacity: 1, fixedColor: o.line.color });
      }
      const d = legLayers(legs);
      layers.push(...d.layers);
      markers = d.markers;
      stops = legStops(legs);
    } else {
      const shown = visible.filter((l) => l.key !== selectedKey);
      for (const l of shown) {
        const st = statusOf(l.key);
        layers.push({ coords: l.coordinates, key: l.key, tone: toneOf[st], weight: STATUS_STYLE[st].weight, dashed: STATUS_STYLE[st].dashed && !l.color, opacity: 1, fixedColor: l.color });
      }
      if (mode === 'plan') {
        tappable = courses.flatMap((c) => c.legs.flatMap((l) => (l.kind === 'line' ? [l.line] : [])));
        if (selectedCourse) {
          const d = legLayers(selectedCourse.legs);
          layers.push(...d.layers);
          markers = d.markers;
          stops = legStops(selectedCourse.legs);
        }
      } else {
        tappable = visible;
        if (selected) {
          layers.push({ coords: selected.coordinates, tone: 'highlight', weight: 6, casing: true, opacity: 1, arrows: true });
          markers = [
            { at: selected.coordinates[0], color: 'start' },
            { at: selected.coordinates[selected.coordinates.length - 1], color: 'end' },
          ];
          stops = lineStops(selected);
        }
      }
    }
    return { layers, markers, stops, tappable };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dataset, visible, selected, selectedKey, selectedCourse, courses, others, legs, options, filters]);

  useEffect(() => {
    if (selectedKey) document.querySelector('.list [aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

  const stats = courseStats(legs);
  const avail = useMemo(() => (dataset ? facetAvailability(dataset.lines, filters, statusOf) : null), [dataset, filters, statuses]);
  const activeFilters = Number(!sameCategories(filters.categories, defaultFilters.categories)) + Number(filters.status !== defaultFilters.status) + filters.tags.length + Number(filters.minKm !== null || filters.maxKm !== null);

  return (
    <div className="app">
      <header className="topbar" onClick={() => showSettings && setShowSettings(false)}>
        <h1>{t('app.title')}</h1>
        {mode !== 'build' && (
          <div className="segmented" role="group" aria-label={t('nav.mode')}>
            <button aria-pressed={mode === 'browse'} onClick={() => switchMode('browse')}>
              {t('nav.map')}
            </button>
            <button aria-pressed={mode === 'plan'} onClick={() => switchMode('plan')}>
              {t('nav.plan')}
            </button>
          </div>
        )}
        <div className="tools">
          <button className="tool" data-filter-toggle aria-pressed={showFilters} aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
            {t('nav.filter')}
            {activeFilters > 0 && <span className="count">{activeFilters}</span>}
          </button>
          <button className="tool" aria-label={t('nav.settings')} onClick={(e) => {
              e.stopPropagation();
              setShowSettings((s) => !s);
            }}>
            ⚙
          </button>
        </div>
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
          <>
            <MapView layers={layers} markers={markers} stops={stops} tappable={tappable} fit={fit} onTap={onTap} />
            {lineColors === 'status' && (
              <div className="legend" aria-label={t('legend.aria')}>
                {(['NotPlanned', 'NotCompleted', 'Completed'] as const).map((s) => (
                  <span key={s}>
                    <i className={`l-${s}`} aria-hidden />
                    {t(`routeStatus.${s}` as Key)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {mode === 'build' && (
          <BuilderStrip
            name={draft?.name ?? ''}
            legs={legs}
            onName={(name) => setDraft((d) => ({ ...(d ?? EMPTY_DRAFT), name }))}
            onSave={() => setNaming(true)}
            onCancel={closeBuild}
            saving={saving}
            canSave={legs.some((l) => l.kind === 'line') && ready}
            editing={!!draft?.editingId}
            onRemoveFirst={() => setDraft((d) => (d ? { ...d, legs: removeFirst(d.legs) } : d))}
            onRemoveLast={() => setDraft((d) => (d ? { ...d, legs: removeLast(d.legs) } : d))}
            onSplit={openSplit}
          />
        )}

        {noticeOpen && mode !== 'build' && (offline || (dataset && Date.now() - Date.parse(dataset.generatedAt) > STALE_DAYS * 864e5)) && (
          <div className="notice" role="note">
            <span>
              {offline && t('notice.offline')}
              {dataset && Date.now() - Date.parse(dataset.generatedAt) > STALE_DAYS * 864e5 && t('notice.stale', { date: dataset.generatedAt.slice(0, 10) })}
            </span>
            <button className="chip" aria-label={t('common.close')} onClick={() => setNoticeOpen(false)}>
              ×
            </button>
          </div>
        )}

        {toast && (
          <div className="toast" role="alert">
            {toast}
          </div>
        )}
        {undo && !toast && (
          <div className="toast info" role="status">
            {undo.text}
            <button className="chip" onClick={() => void undoLast()}>
              {t('toast.undo')}
            </button>
          </div>
        )}

        {completing && (
          <div className="modal-back">
            <div className="modal" role="dialog" aria-modal="true" aria-label={completing.editOnly ? t('complete.editTitle') : t('complete.title')}>
              <h2>{completing.editOnly ? t('complete.editTitle') : t('complete.title')}</h2>
              <p className="muted">{completing.editOnly ? completing.course.name : t('confirm.complete', { name: completing.course.name })}</p>
              <label className="field">
                <span>{t('complete.date')}</span>
                <input type="date" value={completing.date} max={today()} onChange={(e) => setCompleting((x) => x && { ...x, date: e.target.value })} />
              </label>
              <fieldset className="people-pick">
                <legend>{t('complete.people')}</legend>
                {people.length === 0 && <p className="muted">{t('complete.noPeople')}</p>}
                <div className="chips">
                  {people.map((p) => {
                    const on = completing.participants.includes(p);
                    return (
                      <button
                        key={p}
                        className="chip check"
                        aria-pressed={on}
                        onClick={() => setCompleting((x) => x && { ...x, participants: on ? x.participants.filter((q) => q !== p) : [...x.participants, p] })}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                <div className="field person-add">
                  <input
                    value={completing.newName}
                    maxLength={40}
                    placeholder={t('complete.newPerson')}
                    aria-label={t('complete.newPerson')}
                    onChange={(e) => setCompleting((x) => x && { ...x, newName: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && void addCompletingPerson()}
                  />
                  <button className="chip" onClick={() => void addCompletingPerson()} disabled={!completing.newName.trim()}>
                    {t('stats.addPerson')}
                  </button>
                </div>
              </fieldset>
              <div className="actions">
                <button className="primary compact" onClick={confirmComplete} disabled={saving || !completing.date}>
                  {t('complete.confirm')}
                </button>
                <button className="chip" onClick={() => setCompleting(null)}>
                  {t('split.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {naming && draft && (
          <div className="modal-back">
            <div className="modal" role="dialog" aria-modal="true" aria-label={t('name.title')}>
              <h2>{t('name.title')}</h2>
              <label className="field">
                <span>{t('strip.name')}</span>
                <input
                  autoFocus
                  value={draft.name}
                  placeholder={t('course.defaultName', { n: courses.length + 1 })}
                  onChange={(e) => setDraft((d) => ({ ...(d ?? EMPTY_DRAFT), name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setNaming(false);
                      void saveDraftAsCourse();
                    }
                  }}
                />
              </label>
              <div className="actions">
                <button
                  className="primary compact"
                  disabled={saving}
                  onClick={() => {
                    setNaming(false);
                    void saveDraftAsCourse();
                  }}
                >
                  {draft.editingId ? t('strip.saveChanges') : t('strip.save')}
                </button>
                <button className="chip" onClick={() => setNaming(false)}>
                  {t('split.cancel')}
                </button>
              </div>
            </div>
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

        {showFilters && (
          <section className="filter-panel" aria-label={t('filter.title')}>
            <div className="filter-head">
              <h2>{t('filter.title')}</h2>
              <button className="chip" disabled={activeFilters === 0} onClick={() => setFilters(defaultFilters)}>
                {t('filter.reset')}
              </button>
              <button className="chip" aria-label={t('common.close')} onClick={() => setShowFilters(false)}>
                ×
              </button>
            </div>
                  <div className="filter-group" role="group" aria-label={t('filter.category')}>
                    <h3>{t('filter.category')}</h3>
                    <div className="chips">
                    {CATEGORIES.map((c) => (
                      <button key={c} className="chip check" disabled={avail ? !avail.category(c) : false} data-default={defaultFilters.categories.includes(c)} aria-pressed={filters.categories.includes(c)} onClick={() => toggleCategory(c)}>
                        {categoryLabel(c)}
                      </button>
                    ))}
                    </div>
                  </div>
                  {mode !== 'build' && (
                    <div className="filter-group" role="group" aria-label={t('filter.status')}>
                    <h3>{t('filter.status')}</h3>
                    <div className="chips">
                      {STATUS_FILTERS.map((s) => (
                        <button key={s} className="chip radio" disabled={avail ? !avail.status(s) : false} data-default={s === defaultFilters.status} aria-pressed={filters.status === s} onClick={() => setFilters((f) => ({ ...f, status: f.status === s ? defaultFilters.status : s }))}>
                          {statusFilterLabel(s)}
                        </button>
                      ))}
                    </div>
                    </div>
                  )}
                  <div className="filter-group" role="group" aria-label={t('filter.tags')}>
                    <h3>{t('filter.tags')}</h3>
                    <div className="chips">
                    {ALL_TAGS.map((t) => (
                      <button key={t} className="chip check" disabled={avail ? !avail.tag(t) : false} aria-pressed={filters.tags.includes(t)} onClick={() => toggleTag(t)}>
                        {tagLabel(t)}
                      </button>
                    ))}
                    </div>
                  </div>
                  <div className="field">
                    <input inputMode="decimal" placeholder={t('filter.minKm')} aria-label={t('filter.minKmAria')} value={filters.minKm ?? ''} onChange={(e) => setFilters((f) => ({ ...f, minKm: num(e.target.value) }))} />
                    <input inputMode="decimal" placeholder={t('filter.maxKm')} aria-label={t('filter.maxKmAria')} value={filters.maxKm ?? ''} onChange={(e) => setFilters((f) => ({ ...f, maxKm: num(e.target.value) }))} />
                  </div>
                          </section>
        )}

        {dataset && (
          <section
            ref={sheetRef}
            className={`sheet ${mode} snap${snap}${mode === 'browse' && selected ? ' has-sel' : ''}${dragging ? ' dragging' : ''}`}
            style={sheetH === null ? undefined : { height: sheetH, maxHeight: sheetH }}
            aria-label={mode === 'build' ? t('sheet.build') : mode === 'plan' ? t('sheet.plan') : t('sheet.browse')}
          >
            <button
              type="button"
              className="sheet-handle"
              aria-label={t('sheet.resize')}
              onPointerDown={(e) => {
                const el = sheetRef.current;
                if (!el) return;
                dragRef.current = { y: e.clientY, h: el.offsetHeight, moved: false };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                const el = sheetRef.current;
                if (!d || !el) return;
                if (!d.moved && Math.abs(e.clientY - d.y) < 6) return;
                d.moved = true;
                setDragging(true);
                const max = (el.parentElement?.clientHeight ?? 700) * 0.9;
                setSheetH(Math.max(44, Math.min(max, d.h - (e.clientY - d.y))));
              }}
              onPointerCancel={() => {
                dragRef.current = null;
                setDragging(false);
                setSheetH(null);
              }}
              onPointerUp={() => {
                const d = dragRef.current;
                const el = sheetRef.current;
                dragRef.current = null;
                setDragging(false);
                if (!d || !el) return;
                if (!d.moved) {
                  setSnap((n) => (n + 1) % 3);
                  return;
                }
                const parent = el.parentElement?.clientHeight ?? 700;
                const full = (el.querySelector('.sheet-body')?.scrollHeight ?? 0) + 44;
                const targets = [44, parent * 0.36, parent * 0.78].map((h, i) => (i === 0 ? h : Math.min(h, Math.max(full, 44))));
                const cur = el.offsetHeight;
                let best = 0;
                targets.forEach((h, i) => {
                  if (Math.abs(h - cur) < Math.abs(targets[best] - cur)) best = i;
                });
                setSheetH(targets[best]);
                window.setTimeout(() => {
                  setSnap(best);
                  setSheetH(null);
                }, 260);
              }}
            />
            <div className="sheet-body">
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
                <>
                <StatsPanel courses={courses} lines={dataset?.lines ?? []} people={people} log={log} categories={progressCategories} onAddPerson={(n) => void addPersonName(n)} onRemovePerson={(n) => void removePersonName(n)} />
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
                  onRefresh={refreshCourse}
                  onExportGpx={exportGpx}
                  onShare={shareCourse}
                  onEditRun={editRun}
                  lines={dataset?.lines ?? []}
                />
                </>
              )}

              {mode === 'browse' && (
                <>
                  {selected && <LineCard
                      line={selected}
                      info={routeInfo(selected.key, courses)}
                      onClose={() => setSelectedKey(null)}
                      onShareCourse={() => {
                        const c = courses.find((x) => x.id === routeInfo(selected.key, courses).courseId);
                        if (c) void shareCourse(c);
                      }}
                    />}
                  <div className="field">
                    <input type="search" placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
                    <select aria-label={t('sort.label')} value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
                      {SORT_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {t(`sort.${k}` as Key)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="chip check plain"
                    aria-pressed={filters.status === 'incomplete' || filters.status === 'unplanned'}
                    onClick={() => setFilters((f) => ({ ...f, status: f.status === 'incomplete' || f.status === 'unplanned' ? 'all' : 'incomplete' }))}
                  >
                    {t('list.hideCompleted')}
                  </button>
                  <p className="muted">
                    {t('list.count', { shown: listed.length, total: dataset.lines.length, version: dataset.feedVersion })}
                  </p>
                  <ul className="list">
                    {listed.map((l) => {
                      const st = statusOf(l.key);
                      return (
                        <li key={l.key}>
                          <button onClick={() => pickLine(l)} aria-current={l.key === selectedKey}>
                            <span className="badge" style={badgeStyle(l)}>{lineLabel(l)}</span>
                            <span>
                              {l.from} → {l.to}
                              <br />
                              <span className="sub"><span className={`dot dot-${st}`} aria-hidden />{[st === 'Completed' ? t('list.completed') : st === 'NotCompleted' ? t('list.planned') : '', ...l.tags.map((tag) => tagLabel(tag))].filter(Boolean).join(' · ')}</span>
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
        {!showSettings && (
          <BackupSection
            dialogOnly
            courses={courses}
            people={people}
            log={log}
            radiusM={radiusM}
            feedVersion={dataset?.feedVersion ?? ''}
            incoming={incoming}
            onConsumed={() => setIncoming(null)}
            onImported={openImported}
            onApply={applyImport}
            loadRecoveryCourses={async () => null}
          />
        )}
        {tour && <Tour onStep={onTourStep} onClose={closeTour} />}

        {showSettings && dataset && (
          <div className="modal-back" onClick={() => setShowSettings(false)}>
            <div className="modal" role="dialog" aria-modal="true" aria-label={t('settings.title')} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h2>{t('settings.title')}</h2>
                <button className="chip" aria-label={t('common.close')} onClick={() => setShowSettings(false)}>
                  ×
                </button>
              </div>
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
              <label className="field">
                <span>{t('settings.theme')}</span>
                <select value={theme} onChange={(e) => setTheme(e.target.value as ThemePref)}>
                  {THEMES.map((v) => (
                    <option key={v} value={v}>
                      {t(`settings.theme${v[0].toUpperCase()}${v.slice(1)}` as Key)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('settings.mapStyle')}</span>
                <select value={mapStyle} onChange={(e) => setMapStyle(e.target.value as MapStyle)}>
                  {MAP_STYLES.map((v) => (
                    <option key={v} value={v}>
                      {t(`settings.map${v[0].toUpperCase()}${v.slice(1)}` as Key)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('settings.border')}</span>
                <select value={border} onChange={(e) => setBorder(e.target.value as Border)}>
                  {BORDERS.map((v) => (
                    <option key={v} value={v}>
                      {t(`settings.border${v[0].toUpperCase()}${v.slice(1)}` as Key)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('settings.overlap')}</span>
                <select value={overlap} onChange={(e) => setOverlap(e.target.value as Overlap)}>
                  {OVERLAPS.map((v) => (
                    <option key={v} value={v}>
                      {t(`settings.overlap${v[0].toUpperCase()}${v.slice(1)}` as Key)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('settings.lineColors')}</span>
                <select value={lineColors} onChange={(e) => setLineColors(e.target.value as LineColors)}>
                  {LINE_COLORS.map((v) => (
                    <option key={v} value={v}>
                      {t(`settings.colors${v[0].toUpperCase()}${v.slice(1)}` as Key)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('settings.panSpeed')}</span>
                <select value={panSpeed} onChange={(e) => setPanSpeed(e.target.value as PanSpeed)}>
                  {PAN_SPEEDS.map((v) => (
                    <option key={v} value={v}>
                      {t(`settings.pan${v[0].toUpperCase()}${v.slice(1)}` as Key)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field" role="group" aria-label={t('settings.progress')}>
                <span>{t('settings.progress')}</span>
                <div className="chips">
                  {CATEGORIES.map((c) => (
                    <button key={c} className="chip check" aria-pressed={progressCategories.includes(c)} onClick={() => setProgressCategories((cur) => toggleProgressCategory(cur, c))}>
                      {categoryLabel(c)}
                    </button>
                  ))}
                </div>
                <span className="muted">{t('settings.progressHelp')}</span>
              </div>
              <button className="chip check plain" aria-pressed={showLocation} onClick={() => setShowLocation(!showLocation)}>
                {t('settings.location')}
              </button>
              <button
                className="chip"
                onClick={() => {
                  setShowSettings(false);
                  if (mode === 'build') return;
                  setTour(true);
                }}
              >
                {t('tour.start')}
              </button>
              <BackupSection courses={courses} people={people} log={log} radiusM={radiusM} feedVersion={dataset.feedVersion} incoming={incoming} onConsumed={() => setIncoming(null)} onImported={openImported} onApply={applyImport} loadRecoveryCourses={async () => (await loadRecovery())?.courses ?? null} />
              <p className="muted">{t('settings.tiles')}</p>
              <p>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  {t('settings.repo')}
                </a>
              </p>
              <p className="muted">{t('settings.data', { version: dataset.feedVersion })} · {t('settings.dataDate', { date: dataset.generatedAt.slice(0, 10) })}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
