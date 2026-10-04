import { useMemo, useState } from 'react';
import type { Course } from '../domain/course';
import { formatDistance } from '../domain/course';
import { categoryLabel } from '../domain/filter';
import { cleanName, computeProgress, MAX_PERSON_NAME, unusedPeople, type CategoryProgress } from '../domain/stats';
import type { LogEntry } from '../domain/log';
import type { Category, Line } from '../domain/types';
import { t, tn } from '../i18n';

const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

function Bar({ done, planned, total, label }: { done: number; planned: number; total: number; label: string }) {
  return (
    <div className="bar" role="img" aria-label={label}>
      <span className="bar-done" style={{ width: `${pct(done, total)}%` }} />
      <span className="bar-planned" style={{ width: `${pct(planned, total)}%` }} />
    </div>
  );
}

function Row({ p, title }: { p: CategoryProgress; title: string }) {
  const label = t('stats.lineRow', { title, done: p.doneLines, total: p.lines, pct: pct(p.doneLines, p.lines) });
  return (
    <li className="stat-row">
      <span className="stat-name">{title}</span>
      <span>
        {t('stats.ofLines', { done: p.doneLines, total: p.lines })} · {formatDistance(p.doneM)} / {formatDistance(p.lengthM)}
      </span>
      <Bar done={p.doneLines} planned={p.plannedLines} total={p.lines} label={label} />
    </li>
  );
}

interface Props {
  courses: Course[];
  lines: Line[];
  people: string[];
  log: LogEntry[];
  categories: Category[];
  onAddPerson: (name: string) => void;
  onRemovePerson: (name: string) => void;
}

/** Overall progress, per-person totals, the latest completed courses, and the people list. */
export function StatsPanel({ courses, lines, people, log, categories, onAddPerson, onRemovePerson }: Props) {
  const p = useMemo(() => computeProgress(courses, lines, people, 5, categories), [courses, lines, people, categories]);
  const removable = useMemo(() => new Set(unusedPeople(people, courses)), [people, courses]);
  const [name, setName] = useState('');
  const submit = () => {
    if (!cleanName(name)) return;
    onAddPerson(name);
    setName('');
  };
  const summary = t('stats.summary', { done: p.total.doneLines, total: p.total.lines, pct: pct(p.total.doneLines, p.total.lines) });
  return (
    <details className="stats-panel">
      <summary>
        <b>{t('stats.title')}</b> <span className="muted">{summary}</span>
      </summary>
      <Bar done={p.total.doneLines} planned={p.total.plannedLines} total={p.total.lines} label={summary} />
      <div className="stats">
        <div className="stat">
          <b>{formatDistance(p.total.doneM)}</b>
          <span>{t('stats.doneDistance')}</span>
        </div>
        <div className="stat">
          <b>{formatDistance(Math.max(0, p.total.lengthM - p.total.doneM))}</b>
          <span>{t('stats.remaining')}</span>
        </div>
        <div className="stat">
          <b>{formatDistance(p.runM)}</b>
          <span>{tn('stats.run', p.completedCourses)}</span>
        </div>
      </div>
      {p.total.plannedLines > 0 && <p className="muted">{tn('stats.planned', p.total.plannedLines)}</p>}
      {p.byCategory.length > 1 && (
        <ul className="stat-rows" aria-label={t('stats.byCategory')}>
          {p.byCategory.map((c) => (
            <Row key={c.category} p={c} title={categoryLabel(c.category)} />
          ))}
        </ul>
      )}

      <h3>{t('stats.people')}</h3>
      {p.people.length === 0 && <p className="muted">{t('stats.peopleEmpty')}</p>}
      <ul className="stat-rows">
        {p.people.map((x) => (
          <li className="stat-row person" key={x.name}>
            <span className="stat-name">{x.name}</span>
            <span>{tn('stats.personRow', x.courses, { dist: formatDistance(x.distanceM) })}</span>
            {removable.has(x.name) && (
              <button className="chip" onClick={() => onRemovePerson(x.name)} aria-label={t('stats.removePerson', { name: x.name })}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="field person-add">
        <input
          value={name}
          maxLength={MAX_PERSON_NAME}
          placeholder={t('stats.personName')}
          aria-label={t('stats.personName')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="chip" onClick={submit} disabled={!cleanName(name)}>
          {t('stats.addPerson')}
        </button>
      </div>
      {p.people.some((x) => !removable.has(x.name)) && <p className="muted">{t('stats.inUse')}</p>}

      <h3>{t('stats.recent')}</h3>
      {p.recent.length === 0 && <p className="muted">{t('stats.recentEmpty')}</p>}
      <ul className="stat-rows">
        {p.recent.map((r) => (
          <li className="stat-row" key={r.id}>
            <span className="stat-name">
              {r.date} · {r.name}
            </span>
            <span>
              {formatDistance(r.distanceM)}
              {r.participants.length > 0 && ` · ${r.participants.join(', ')}`}
            </span>
          </li>
        ))}
      </ul>

      <h3>{t('stats.history')}</h3>
      {log.length === 0 && <p className="muted">{t('stats.historyEmpty')}</p>}
      <ul className="stat-rows history" aria-label={t('stats.history')}>
        {log.slice(0, 30).map((e) => (
          <li className="stat-row" key={e.id}>
            <span className="stat-name">
              {(e.date ?? e.at).slice(0, 10)} · {e.name}
            </span>
            <span>
              {e.kind === 'completed' ? t('stats.logCompleted') : t('stats.logUncompleted')}
              {e.kind === 'completed' && ` · ${formatDistance(e.distanceM)}`}
              {e.kind === 'completed' && e.participants.length > 0 && ` · ${e.participants.join(', ')}`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
