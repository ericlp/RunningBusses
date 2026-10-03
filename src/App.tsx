import { useEffect, useMemo, useState } from 'react';
import { MapView } from './components/MapView';
import { loadDataset } from './data/dataset';
import { applyFilters, categoryLabels, defaultFilters, formatKm, searchLines, sortLines, tagLabels, type Filters } from './domain/filter';
import type { Category, Dataset, Line, Tag } from './domain/types';

const ALL_TAGS: Tag[] = ['call-ordered', 'loop', 'one-way', 'retur'];

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [chooser, setChooser] = useState<Line[] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(true);

  useEffect(() => {
    loadDataset()
      .then((r) => {
        setDataset(r.dataset);
        setOffline(r.offline);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const visible = useMemo(() => (dataset ? applyFilters(dataset.lines, filters) : []), [dataset, filters]);
  const listed = useMemo(() => sortLines(searchLines(visible, query)), [visible, query]);
  const selected = useMemo(() => dataset?.lines.find((l) => l.key === selectedKey) ?? null, [dataset, selectedKey]);
  const mapLines = useMemo(() => (selected && !visible.includes(selected) ? [...visible, selected] : visible), [visible, selected]);

  const pick = (l: Line) => {
    setSelectedKey(l.key);
    setChooser(null);
  };
  const onTap = (hits: Line[]) => {
    if (hits.length === 0) {
      setSelectedKey(null);
      setChooser(null);
    } else if (hits.length === 1) pick(hits[0]);
    else setChooser(hits);
  };
  const toggleTag = (t: Tag) =>
    setFilters((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));
  const num = (v: string) => (v === '' ? null : Number(v.replace(',', '.')));

  return (
    <div className="app">
      <header className="topbar">
        <h1>Busslöpning Göteborg</h1>
        <button aria-pressed={showFilters} onClick={() => setShowFilters((s) => !s)}>
          Filter
        </button>
      </header>
      <main className="main">
        {error && !dataset ? (
          <div className="status">
            <div>
              <p>Kunde inte hämta linjedata.</p>
              <p className="muted">{error}</p>
              <button className="chip" onClick={() => location.reload()}>
                Försök igen
              </button>
            </div>
          </div>
        ) : !dataset ? (
          <div className="status">Laddar linjer…</div>
        ) : (
          <MapView lines={mapLines} selected={selected} onTap={onTap} />
        )}

        {noticeOpen && (
          <div className="notice" role="note">
            <span>
              Linjerna visar bussens väg och är bara en referens. Alla vägar, tunnlar och bussleder går inte att springa på.
              {offline && ' Du är offline – visar sparad data.'}
            </span>
            <button aria-label="Stäng" onClick={() => setNoticeOpen(false)}>
              ×
            </button>
          </div>
        )}

        {chooser && (
          <div className="chooser" role="dialog" aria-label="Välj linje">
            <p className="muted">Flera linjer här – välj en:</p>
            <ul className="list">
              {chooser.map((l) => (
                <li key={l.key}>
                  <button onClick={() => pick(l)}>
                    <span className="badge">{l.label}</span>
                    <span className="km">{formatKm(l.lengthM)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dataset && (
          <section className="sheet" aria-label="Linjer">
            <div className="sheet-handle" />
            <div className="sheet-body">
              {selected && <LineCard line={selected} onClose={() => setSelectedKey(null)} />}

              <div className="field">
                <input
                  type="search"
                  placeholder="Sök linje eller hållplats"
                  aria-label="Sök linje eller hållplats"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              {showFilters && (
                <div>
                  <div className="chips" role="group" aria-label="Kategori">
                    {(['stadsbuss', 'stombuss', 'all'] as const).map((c) => (
                      <button key={c} className="chip" aria-pressed={filters.category === c} onClick={() => setFilters((f) => ({ ...f, category: c }))}>
                        {c === 'all' ? 'Alla' : categoryLabels[c as Category]}
                      </button>
                    ))}
                  </div>
                  <div className="chips" role="group" aria-label="Egenskaper">
                    {ALL_TAGS.map((t) => (
                      <button key={t} className="chip" aria-pressed={filters.tags.includes(t)} onClick={() => toggleTag(t)}>
                        {tagLabels[t]}
                      </button>
                    ))}
                  </div>
                  <div className="field">
                    <input inputMode="decimal" placeholder="Min km" aria-label="Minsta sträcka i km" value={filters.minKm ?? ''} onChange={(e) => setFilters((f) => ({ ...f, minKm: num(e.target.value) }))} />
                    <input inputMode="decimal" placeholder="Max km" aria-label="Största sträcka i km" value={filters.maxKm ?? ''} onChange={(e) => setFilters((f) => ({ ...f, maxKm: num(e.target.value) }))} />
                  </div>
                </div>
              )}

              <p className="muted">
                {listed.length} av {dataset.lines.length} linjer · data {dataset.feedVersion}
              </p>
              <ul className="list">
                {listed.map((l) => (
                  <li key={l.key}>
                    <button onClick={() => pick(l)} aria-current={l.key === selectedKey}>
                      <span className="badge">{l.label}</span>
                      <span>
                        {l.from} → {l.to}
                        <br />
                        <span className="sub">{l.tags.map((t) => tagLabels[t]).join(' · ')}</span>
                      </span>
                      <span className="km">{formatKm(l.lengthM)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function LineCard({ line, onClose }: { line: Line; onClose: () => void }) {
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
