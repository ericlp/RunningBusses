import { useEffect, useMemo, useState } from 'react';
import { choiceKey, makeBackup, mergeCourses, parseBackup, type Backup, type Choice } from '../domain/backup';
import type { Course } from '../domain/course';
import { encodeShare, shareUrl, SHARE_WARN_CHARS, type ShareError, type Shared } from '../domain/share';
import { t, tn } from '../i18n';

interface Props {
  courses: Course[];
  radiusM: number;
  feedVersion: string;
  /** A courses link that was opened: the result of reading it. Handled like an imported file. */
  incoming: { shared: Shared | null; error: ShareError | null } | null;
  /** Persists the result (recovery copy first). Resolves false if it could not be saved. */
  onApply: (courses: Course[], radiusM: number | null) => Promise<boolean>;
  loadRecoveryCourses: () => Promise<Course[] | null>;
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function BackupSection({ courses, radiusM, feedVersion, incoming, onApply, loadRecoveryCourses }: Props) {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromLink, setFromLink] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);

  useEffect(() => {
    if (!incoming) return;
    setChoices({});
    setMode('merge');
    setFromLink(true);
    if (incoming.shared) {
      setSkipped(incoming.shared.skipped);
      setBackup(incoming.shared.backup.courses.length ? incoming.shared.backup : null);
      setMsg(incoming.shared.backup.courses.length ? null : t('share.allSkipped'));
    } else {
      setBackup(null);
      setSkipped([]);
      setMsg(t(`share.err.${incoming.error ?? 'badLink'}`));
    }
  }, [incoming]);

  const shareLink = async (how: 'share' | 'copy') => {
    if (!courses.length) {
      setMsg(t('share.none'));
      return;
    }
    const url = shareUrl(await encodeShare(courses, feedVersion));
    const warn = url.length > SHARE_WARN_CHARS ? ' ' + t('share.long') : '';
    try {
      if (how === 'share' && navigator.share) {
        await navigator.share({ title: t('app.title'), url });
        setMsg(warn.trim() || null);
        return;
      }
      await navigator.clipboard.writeText(url);
      setMsg(t('share.copied') + warn);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg(t('share.failed'));
    }
  };

  const merge = useMemo(() => (backup ? mergeCourses(courses, backup.courses, choices) : null), [backup, courses, choices]);

  const onFile = async (file: File | undefined) => {
    setMsg(null);
    setBackup(null);
    setChoices({});
    setFromLink(false);
    setSkipped([]);
    if (!file) return;
    const r = parseBackup(await file.text());
    if (!r.ok) {
      setMsg(t(`backup.err.${r.error}`) + (r.detail ? ` (${r.detail})` : ''));
      return;
    }
    setBackup(r.backup);
  };

  const apply = async () => {
    if (!backup || !merge) return;
    if (mode === 'replace' && !confirm(t('backup.confirmReplace', { n: courses.length }))) return;
    setBusy(true);
    const ok = await onApply(mode === 'replace' ? backup.courses : merge.courses, mode === 'replace' && !fromLink ? backup.radiusM : null);
    setBusy(false);
    if (ok) {
      setMsg(t('backup.done'));
      setBackup(null);
    } else setMsg(t('backup.saveFailed'));
  };

  const pending = mode === 'merge' && merge ? merge.conflicts.length : 0;

  return (
    <section className="backup">
      <h3>{t('backup.title')}</h3>
      <p className="muted">{t('backup.help')}</p>
      <div className="chips">
        <button className="chip" onClick={() => download(`busslopning-${stamp()}.json`, makeBackup(courses, radiusM))}>
          {t('backup.export')}
        </button>
        {typeof navigator.share === 'function' && (
          <button className="chip" onClick={() => void shareLink('share')}>
            {t('share.share')}
          </button>
        )}
        <button className="chip" onClick={() => void shareLink('copy')}>
          {t('share.copy')}
        </button>
        <label className="chip file">
          {t('backup.import')}
          <input type="file" accept="application/json,.json" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button
          className="chip"
          onClick={async () => {
            const r = await loadRecoveryCourses();
            if (r) download(`busslopning-fore-import-${stamp()}.json`, makeBackup(r, radiusM));
            else setMsg(t('backup.noRecovery'));
          }}
        >
          {t('backup.recovery')}
        </button>
      </div>
      {msg && <p role="status">{msg}</p>}
      {backup && merge && (
        <div className="import-preview">
          <p>{fromLink ? tn('share.preview', backup.courses.length) : tn('backup.preview', backup.courses.length, { date: backup.exportedAt.slice(0, 10) })}</p>
          {skipped.length > 0 && <p role="alert">{tn('share.skipped', skipped.length, { names: skipped.map((n) => `"${n}"`).join(', ') })}</p>}
          <div className="chips" role="group" aria-label={t('backup.mode')}>
            <button className="chip" aria-pressed={mode === 'merge'} onClick={() => setMode('merge')}>
              {t('backup.merge')}
            </button>
            <button className="chip" aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>
              {t('backup.replace')}
            </button>
          </div>
          {mode === 'replace' ? (
            <p className="muted">{t('backup.replaceNote', { n: courses.length })}</p>
          ) : (
            <>
              <p className="muted">{t('backup.mergeSummary', { added: merge.added, skipped: merge.skipped })}</p>
              {merge.conflicts.map((c) => {
                const key = choiceKey(c.kind, c.imported.id);
                const names = c.local.map((x) => `"${x.name}"`).join(', ');
                return (
                  <div className="conflict" key={key} role="group" aria-label={c.imported.name}>
                    <p>{c.kind === 'sameId' ? t('backup.conflictSame', { name: c.imported.name }) : t('backup.conflictOwn', { name: c.imported.name, local: names })}</p>
                    <div className="chips">
                      <button className="chip" onClick={() => setChoices((x) => ({ ...x, [key]: 'local' }))}>
                        {t('backup.keepLocal')}
                      </button>
                      <button className="chip" onClick={() => setChoices((x) => ({ ...x, [key]: 'imported' }))}>
                        {t('backup.keepImported')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
          <div className="chips">
            <button className="primary compact" disabled={busy || pending > 0} onClick={() => void apply()}>
              {pending > 0 ? tn('backup.resolveFirst', pending) : t('backup.apply')}
            </button>
            <button className="chip" onClick={() => setBackup(null)}>
              {t('split.cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
