import {
  canRemoveFirst,
  canRemoveLast,
  canSplitAt,
  courseStats,
  formatDistance,
  formatTotal,
  legLabel,
  legStartName,
  legEndName,
  routeStatusLabel,
  type Course,
  type Leg,
  type Option,
  type RouteInfo,
} from '../domain/course';
import { courseStart, directionsUrl } from '../domain/navigate';
import { missingLineKeys } from '../domain/reconcile';
import { categoryLabel, formatKm, tagLabel } from '../domain/filter';
import { lineLabel, t, tn } from '../i18n';
import { badgeStyle } from '../domain/color';
import type { Line } from '../domain/types';
import { useState } from 'react';

export function LineCard({ line, info, onClose, onShareCourse }: { line: Line; info: RouteInfo; onClose: () => void; onShareCourse?: () => void }) {
  const [lon, lat] = line.coordinates[0];
  return (
    <article className="line-card" aria-label={t('card.aria', { label: lineLabel(line) })}>
      <div className="card-title">
        <span className="badge" style={badgeStyle(line)}>{lineLabel(line)}</span>
        <span className="name">
          {line.from} → {line.to}
        </span>
        <b className="card-km">{formatKm(line.lengthM)}</b>
        <button className="chip" onClick={onClose} aria-label={t('card.close')}>
          ×
        </button>
      </div>
      <div className="stats">
        <div className="stat">
          <b>{formatKm(line.lengthM)}</b>
          <span>{t('card.distance')}</span>
        </div>
        <div className="stat">
          <b>{line.via.length}</b>
          <span>{t('card.stops')}</span>
        </div>
      </div>
      <div className="chips">
        <span className={`tag status-${info.status}`}>{routeStatusLabel(info.status)}</span>
        {info.courseName && <span className="tag">{t('card.course', { name: info.courseName })}</span>}
        <span className="tag">{categoryLabel(line.category)}</span>
        {line.tags.map((tag) => (
          <span className="tag" key={tag}>
            {tagLabel(tag)}
          </span>
        ))}
      </div>
      <div className="actions">
        <a className="chip" href={directionsUrl({ lat, lon })} target="_blank" rel="noreferrer">
          {t('courses.navigate')}
        </a>
        {info.courseId && onShareCourse && (
          <button className="chip" onClick={onShareCourse}>
            {t('courses.share')}
          </button>
        )}
      </div>
      <p className="via">{t('card.via', { stops: line.via.filter((_, i) => i % Math.ceil(line.via.length / 6) === 0).join(', ') })}</p>
    </article>
  );
}

interface CourseListProps {
  courses: Course[];
  selectedId: string | null;
  draftLegs: number;
  /** Name of the course being edited in the saved draft, if the draft is an edit. */
  draftEditingId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onEdit: (c: Course) => void;
  onToggleComplete: (c: Course) => void;
  onDelete: (c: Course) => void;
  onRefresh: (c: Course) => void;
  onExportGpx: (c: Course) => void;
  onShare: (c: Course) => void;
  onEditRun: (c: Course) => void;
  /** Line keys currently in the dataset, to warn about lines that have disappeared. */
  lines: Line[];
}

export function CourseList({ courses, lines, onRefresh, onExportGpx, onShare, onEditRun, selectedId, draftLegs, draftEditingId, onSelect, onCreate, onEdit, onToggleComplete, onDelete }: CourseListProps) {
  const editing = courses.find((c) => c.id === draftEditingId);
  return (
    <div>
      <button className="primary" onClick={onCreate}>
        {editing ? t('courses.resumeEdit', { name: editing.name }) : draftLegs > 0 ? tn('courses.resumeDraft', draftLegs) : t('courses.create')}
      </button>
      {courses.length === 0 && <p className="muted">{t('courses.empty')}</p>}
      <ul className="courses">
        {courses.map((c) => {
          const s = courseStats(c.legs);
          const selected = c.id === selectedId;
          return (
            <li key={c.id} className={`course ${selected ? 'selected' : ''}`}>
              <button className="course-main" aria-pressed={selected} onClick={() => onSelect(selected ? null : c.id)}>
                <span className="course-head">
                  <b>{c.name}</b>
                  {c.pinned && <span className="tag">{t('courses.pinned')}</span>}
                  <span className={`tag ${c.status === 'Completed' ? 'status-Completed' : ''}`}>{c.status === 'Completed' ? `${t('courses.statusDone')}${c.completedAt ? ` ${c.completedAt.slice(0, 10)}` : ''}` : t('courses.statusOpen')}</span>
                </span>
                <span className="seq">
                  {c.legs.map((l, i) => (
                    <span className="badge small" key={i}>
                      {legLabel(l)}
                    </span>
                  ))}
                </span>
                <span className="muted">
                  {s.startName} → {s.endName}
                </span>
                <span className="total">{formatTotal(s)}</span>
                {c.status === 'Completed' && c.participants && c.participants.length > 0 && <span className="muted">{t('courses.runBy', { names: c.participants.join(', ') })}</span>}
              </button>
              {selected && (
                <div className="details">
                  <ol className="legs">
                    {c.legs.map((l, i) => (
                      <li key={i}>
                        <b>{legLabel(l)}</b>: {legStartName(l)} → {legEndName(l)}, {l.kind === 'manual' && l.lengthM === null ? t('courses.unknownDistance') : formatKm(l.kind === 'manual' ? (l.lengthM ?? 0) : l.line.lengthM)}
                        {s.gaps.find((g) => g.afterIndex === i) && <div className="gap">{t('courses.gapNext', { dist: formatDistance(s.gaps.find((g) => g.afterIndex === i)!.m) })}</div>}
                      </li>
                    ))}
                  </ol>
                  {missingLineKeys(c, lines).length > 0 && c.status !== 'Completed' && <p className="gap">{t('courses.missing', { keys: missingLineKeys(c, lines).join(', ') })}</p>}
                  <div className="actions">
                    {c.pinned && (
                      <button className="chip" onClick={() => onRefresh(c)}>
                        {t('courses.update')}
                      </button>
                    )}
                    {c.status !== 'Completed' && (
                      <button className="chip" onClick={() => onEdit(c)}>
                        {t('courses.edit')}
                      </button>
                    )}
                    {courseStart(c.legs) && (
                      <a className="chip" href={directionsUrl(courseStart(c.legs)!)} target="_blank" rel="noreferrer">
                        {t('courses.navigate')}
                      </a>
                    )}
                    {c.status === 'Completed' && (
                      <button className="chip" onClick={() => onEditRun(c)}>
                        {t('courses.editRun')}
                      </button>
                    )}
                    <button className="chip" onClick={() => onShare(c)}>
                      {t('courses.share')}
                    </button>
                    <button className="chip" onClick={() => onExportGpx(c)}>
                      {t('courses.gpx')}
                    </button>
                    <button className="chip" onClick={() => onToggleComplete(c)}>
                      {c.status === 'Completed' ? t('courses.markUndone') : t('courses.markDone')}
                    </button>
                    <button className="chip danger" onClick={() => onDelete(c)}>
                      {t('courses.delete')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface StripProps {
  name: string;
  legs: Leg[];
  onName: (n: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  canSave: boolean;
  editing: boolean;
  onRemoveFirst: () => void;
  onRemoveLast: () => void;
  onSplit: (index: number) => void;
}

/** The top strip of a draft: start stop, one card per leg, and a sticky total with the save button. */
export function BuilderStrip({ legs, onSave, onCancel, saving, canSave, editing, onRemoveFirst, onRemoveLast, onSplit }: StripProps) {
  const s = courseStats(legs);
  return (
    <div className="strip">
      <div className="strip-head">
        <span className="strip-total">{legs.length ? formatTotal(s) : '0,0 km'}</span>
        <button className="primary compact" disabled={!canSave || saving} onClick={onSave}>
          {saving ? t('strip.saving') : editing ? t('strip.saveChanges') : t('strip.save')}
        </button>
        <button className="chip" onClick={onCancel} aria-label={t('strip.closeAria')}>
          {t('strip.close')}
        </button>
      </div>
      <div className="strip-cards" role="list" aria-label={t('strip.legs')}>
        <div className="start" role="listitem">
          <span className="muted">{t('strip.start')}</span>
          <b>{s.startName ?? t('strip.pickFirst')}</b>
        </div>
        {legs.map((l, i) => {
          const gap = s.gaps.find((g) => g.afterIndex === i - 1);
          return (
            <div className="leg-wrap" key={i} role="listitem">
              {gap && <span className="connector">↔ {formatDistance(gap.m)}</span>}
              {editing && canSplitAt(legs, i) && (
                <button className="chip split" onClick={() => onSplit(i)} aria-label={t('strip.splitAria', { label: legLabel(l) })}>
                  ✂ Dela
                </button>
              )}
              <div className="leg-card">
                <span className="leg-top">
                  <span className="badge small">{legLabel(l)}</span>
                  {i === 0 && canRemoveFirst(legs) && (
                    <button className="x" onClick={onRemoveFirst} aria-label={t('strip.removeFirst', { label: legLabel(l) })}>
                      ×
                    </button>
                  )}
                  {i === legs.length - 1 && canRemoveLast(legs) && (
                    <button className="x" onClick={onRemoveLast} aria-label={t('strip.removeLast', { label: legLabel(l) })}>
                      ×
                    </button>
                  )}
                </span>
                <b>{legEndName(l)}</b>
                <span className="muted">{l.kind === 'manual' && l.lengthM === null ? '? km' : formatKm(l.kind === 'manual' ? (l.lengthM ?? 0) : l.line.lengthM)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PanelProps {
  options: Option[];
  hasLegs: boolean;
  radiusM: number;
  onRadius: (m: number) => void;
  onPick: (o: Option) => void;
  onUndo: () => void;
  onAddManual: (label: string, lengthM: number | null) => void;
  onDiscard: () => void;
  canReverse: boolean;
  onReverse: () => void;
  editing: boolean;
}

export function BuilderPanel({ options, hasLegs, radiusM, onRadius, onPick, onUndo, onAddManual, onDiscard, canReverse, onReverse, editing }: PanelProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [km, setKm] = useState('');
  const submit = () => {
    const v = km.trim() === '' ? null : Number(km.replace(',', '.'));
    if (v !== null && (!Number.isFinite(v) || v < 0)) return;
    onAddManual(label.trim() || t('panel.manualDefault'), v === null ? null : Math.round(v * 1000));
    setLabel('');
    setKm('');
    setManualOpen(false);
  };
  return (
    <div>
      <div className="actions">
        <button className="chip" onClick={onUndo} disabled={!hasLegs}>
          {t('panel.undo')}
        </button>
        {canReverse && (
          <button className="chip" onClick={onReverse}>
            ⇄ {t('panel.reverse')}
          </button>
        )}
        {hasLegs && (
          <button className="chip" onClick={() => setManualOpen((o) => !o)} aria-expanded={manualOpen}>
            + {t('panel.manual')}
          </button>
        )}
        <button className="chip danger" onClick={onDiscard}>
          {editing ? t('panel.discardChanges') : t('panel.discardDraft')}
        </button>
        <label className="radius">
          Radie
          <input type="number" inputMode="numeric" min={50} max={5000} step={50} value={radiusM} onChange={(e) => onRadius(Number(e.target.value))} aria-label={t('panel.radiusAria')} />
          m
        </label>
      </div>
      {manualOpen && (
        <div className="field manual">
          <input placeholder={t('panel.manualName')} aria-label={t('panel.manualNameAria')} value={label} onChange={(e) => setLabel(e.target.value)} />
          <input inputMode="decimal" placeholder={t('panel.manualKm')} aria-label={t('panel.manualKmAria')} value={km} onChange={(e) => setKm(e.target.value)} />
          <button className="chip" onClick={submit}>
            {t('panel.add')}
          </button>
        </div>
      )}
      <p className="muted">{hasLegs ? t('panel.next', { n: options.filter((o) => !o.outside).length, radius: radiusM }) : t('panel.first')}</p>
      {hasLegs && options.length > 0 && options[0].outside && <p>{t('panel.none', { radius: radiusM })}</p>}
      {canReverse && hasLegs && !options.some((o) => !o.outside) && (
        <button className="chip" onClick={onReverse}>
          ⇄ {t('panel.reverseHint')}
        </button>
      )}
      <ul className="list">
        {options.map((o) => (
          <li key={`${o.line.key}-${o.reversed}`}>
            <button onClick={() => onPick(o)}>
              <span className="badge" style={badgeStyle(o.line)}>{lineLabel(o.line)}</span>
              <span>
                {o.reversed ? o.line.to : o.line.from} → {o.reversed ? o.line.from : o.line.to}
                {o.gapM !== null && (
                  <>
                    <br />
                    <span className="sub">{t(o.outside ? 'panel.nearest' : 'panel.gap', { dist: formatDistance(o.gapM) })}</span>
                  </>
                )}
              </span>
              <span className="km">{formatKm(o.line.lengthM)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SplitProps {
  first: Leg[];
  second: Leg[];
  name1: string;
  name2: string;
  onName1: (n: string) => void;
  onName2: (n: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}

/** Preview of a split: two new, not completed courses, each with its own name and total. */
export function SplitDialog({ first, second, name1, name2, onName1, onName2, onConfirm, onCancel, saving }: SplitProps) {
  const parts = [
    { legs: first, name: name1, set: onName1, label: t('split.part1') },
    { legs: second, name: name2, set: onName2, label: t('split.part2') },
  ];
  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('split.title')}>
        <h2>{t('split.title')}</h2>
        <p className="muted">{t('split.note')}</p>
        {parts.map((p) => {
          const s = courseStats(p.legs);
          return (
            <div key={p.label} className="split-part">
              <input value={p.name} aria-label={t('split.nameAria', { label: p.label })} onChange={(e) => p.set(e.target.value)} />
              <div className="seq">
                {p.legs.map((l, i) => (
                  <span className="badge small" key={i}>
                    {legLabel(l)}
                  </span>
                ))}
              </div>
              <span className="muted">
                {s.startName} → {s.endName}
              </span>
              <b>{formatTotal(s)}</b>
            </div>
          );
        })}
        <div className="actions">
          <button className="primary compact" onClick={onConfirm} disabled={saving || !name1.trim() || !name2.trim()}>
            {saving ? t('strip.saving') : t('split.confirm')}
          </button>
          <button className="chip" onClick={onCancel}>
            {t('split.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
