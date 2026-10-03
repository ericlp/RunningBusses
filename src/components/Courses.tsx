import { courseStats, formatDistance, formatTotal, legLabel, legStartName, legEndName, routeStatusLabels, type Course, type Leg, type Option, type RouteInfo } from '../domain/course';
import { categoryLabels, formatKm, tagLabels } from '../domain/filter';
import type { Line } from '../domain/types';
import { useState } from 'react';

export function LineCard({ line, info, onClose }: { line: Line; info: RouteInfo; onClose: () => void }) {
  return (
    <article aria-label={`Linje ${line.label}`}>
      <div className="card-title">
        <span className="badge">{line.label}</span>
        <span className="name">
          {line.from} → {line.to}
        </span>
        <button className="chip" onClick={onClose} aria-label="Stäng linjekort">
          ×
        </button>
      </div>
      <div className="stats">
        <div className="stat">
          <b>{formatKm(line.lengthM)}</b>
          <span>Sträcka</span>
        </div>
        <div className="stat">
          <b>{line.via.length}</b>
          <span>Hållplatser</span>
        </div>
      </div>
      <div className="chips">
        <span className={`tag status-${info.status}`}>{routeStatusLabels[info.status]}</span>
        {info.courseName && <span className="tag">Bana: {info.courseName}</span>}
        <span className="tag">{categoryLabels[line.category]}</span>
        {line.tags.map((t) => (
          <span className="tag" key={t}>
            {tagLabels[t]}
          </span>
        ))}
      </div>
      <p className="via">Via {line.via.filter((_, i) => i % Math.ceil(line.via.length / 6) === 0).join(', ')}</p>
    </article>
  );
}

interface CourseListProps {
  courses: Course[];
  selectedId: string | null;
  draftLegs: number;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onToggleComplete: (c: Course) => void;
  onDelete: (c: Course) => void;
}

export function CourseList({ courses, selectedId, draftLegs, onSelect, onCreate, onToggleComplete, onDelete }: CourseListProps) {
  return (
    <div>
      <button className="primary" onClick={onCreate}>
        {draftLegs > 0 ? `Fortsätt utkast (${draftLegs} ${draftLegs === 1 ? 'etapp' : 'etapper'})` : 'Skapa bana'}
      </button>
      {courses.length === 0 && <p className="muted">Inga banor än. Skapa en bana genom att koppla ihop linjer.</p>}
      <ul className="courses">
        {courses.map((c) => {
          const s = courseStats(c.legs);
          const selected = c.id === selectedId;
          return (
            <li key={c.id} className={`course ${selected ? 'selected' : ''}`}>
              <button className="course-main" aria-pressed={selected} onClick={() => onSelect(selected ? null : c.id)}>
                <span className="course-head">
                  <b>{c.name}</b>
                  <span className={`tag ${c.status === 'Completed' ? 'status-Completed' : ''}`}>{c.status === 'Completed' ? 'Genomförd' : 'Ej genomförd'}</span>
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
              </button>
              {selected && (
                <div className="details">
                  <ol className="legs">
                    {c.legs.map((l, i) => (
                      <li key={i}>
                        <b>{legLabel(l)}</b>: {legStartName(l)} → {legEndName(l)}, {l.kind === 'manual' && l.lengthM === null ? 'okänd sträcka' : formatKm(l.kind === 'manual' ? (l.lengthM ?? 0) : l.line.lengthM)}
                        {s.gaps.find((g) => g.afterIndex === i) && <div className="gap">Glapp till nästa: {formatDistance(s.gaps.find((g) => g.afterIndex === i)!.m)}</div>}
                      </li>
                    ))}
                  </ol>
                  <div className="actions">
                    <button className="chip" onClick={() => onToggleComplete(c)}>
                      {c.status === 'Completed' ? 'Markera som ej genomförd' : 'Markera som genomförd'}
                    </button>
                    <button className="chip danger" onClick={() => onDelete(c)}>
                      Ta bort
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
}

/** The top strip of a draft: start stop, one card per leg, and a sticky total with the save button. */
export function BuilderStrip({ name, legs, onName, onSave, onCancel, saving, canSave }: StripProps) {
  const s = courseStats(legs);
  return (
    <div className="strip">
      <div className="strip-head">
        <input value={name} placeholder="Namn på banan" aria-label="Namn på banan" onChange={(e) => onName(e.target.value)} />
        <span className="strip-total">{legs.length ? formatTotal(s) : '0,0 km'}</span>
        <button className="primary compact" disabled={!canSave || saving} onClick={onSave}>
          {saving ? 'Sparar…' : 'Spara'}
        </button>
        <button className="chip" onClick={onCancel} aria-label="Stäng och behåll utkastet">
          Stäng
        </button>
      </div>
      <div className="strip-cards" role="list" aria-label="Etapper">
        <div className="start" role="listitem">
          <span className="muted">Start</span>
          <b>{s.startName ?? 'Välj första linje'}</b>
        </div>
        {legs.map((l, i) => {
          const gap = s.gaps.find((g) => g.afterIndex === i - 1);
          return (
            <div className="leg-wrap" key={i} role="listitem">
              {gap && <span className="connector">↔ {formatDistance(gap.m)}</span>}
              <div className="leg-card">
                <span className="badge small">{legLabel(l)}</span>
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
}

export function BuilderPanel({ options, hasLegs, radiusM, onRadius, onPick, onUndo, onAddManual, onDiscard }: PanelProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [km, setKm] = useState('');
  const submit = () => {
    const v = km.trim() === '' ? null : Number(km.replace(',', '.'));
    if (v !== null && (!Number.isFinite(v) || v < 0)) return;
    onAddManual(label.trim() || 'Manuell sträcka', v === null ? null : Math.round(v * 1000));
    setLabel('');
    setKm('');
    setManualOpen(false);
  };
  return (
    <div>
      <div className="actions">
        <button className="chip" onClick={onUndo} disabled={!hasLegs}>
          Ångra senaste
        </button>
        {hasLegs && (
          <button className="chip" onClick={() => setManualOpen((o) => !o)} aria-expanded={manualOpen}>
            + Manuell sträcka
          </button>
        )}
        <button className="chip danger" onClick={onDiscard}>
          Förkasta utkast
        </button>
        <label className="radius">
          Radie
          <input type="number" inputMode="numeric" min={50} max={5000} step={50} value={radiusM} onChange={(e) => onRadius(Number(e.target.value))} aria-label="Radie i meter" />
          m
        </label>
      </div>
      {manualOpen && (
        <div className="field manual">
          <input placeholder="Namn (t.ex. Linje 14)" aria-label="Namn på manuell sträcka" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input inputMode="decimal" placeholder="km" aria-label="Sträcka i km" value={km} onChange={(e) => setKm(e.target.value)} />
          <button className="chip" onClick={submit}>
            Lägg till
          </button>
        </div>
      )}
      <p className="muted">{hasLegs ? `Nästa linje – ${options.length} inom ${radiusM} m:` : 'Tryck på en linje på kartan eller välj här. Välj också vilken ände du startar från.'}</p>
      {hasLegs && options.length === 0 && <p>Ingen ledig linje inom {radiusM} m. Öka radien, lägg till en manuell sträcka eller spara banan.</p>}
      <ul className="list">
        {options.map((o) => (
          <li key={`${o.line.key}-${o.reversed}`}>
            <button onClick={() => onPick(o)}>
              <span className="badge">{o.line.label}</span>
              <span>
                {o.reversed ? o.line.to : o.line.from} → {o.reversed ? o.line.from : o.line.to}
                {o.gapM !== null && (
                  <>
                    <br />
                    <span className="sub">Glapp {formatDistance(o.gapM)}</span>
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
