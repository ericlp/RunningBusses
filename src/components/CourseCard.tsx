import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppearance } from '../appearance';
import { courseCardModel } from '../domain/card';
import type { Course } from '../domain/course';
import { gpxFileName } from '../domain/gpx';
import { t, useLang } from '../i18n';
import { CourseMapPreview, type CardMapSnapshot } from './MapView';
import { renderCourseCard } from './renderCourseCard';
import { canShareFile, downloadFile, sendShareFile } from './shareFile';

export function CourseCard({ course, onClose }: { course: Course; onClose: () => void }) {
  const { lang } = useLang();
  const { resolved, mapStyle } = useAppearance();
  const model = useMemo(() => courseCardModel(course), [course, lang]);
  const dialog = useRef<HTMLDialogElement>(null);
  const serial = useRef(0);
  const [snapshot, setSnapshot] = useState<CardMapSnapshot | null>(null);
  const [prepared, setPrepared] = useState<{ file: File; routeOnly: boolean } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const onSnapshot = useCallback((next: CardMapSnapshot | null) => {
    serial.current++;
    setSnapshot(next);
  }, []);

  useLayoutEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current!;
    node.showModal();
    return () => {
      serial.current++;
      node.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    serial.current++;
    setPrepared(null);
    setMessage(null);
  }, [model, resolved, mapStyle]);
  useEffect(() => {
    if (!prepared) { setUrl(null); return; }
    const next = URL.createObjectURL(prepared.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [prepared]);
  const supported = useMemo(() => prepared ? canShareFile(prepared.file) : false, [prepared]);

  const prepare = async () => {
    const version = serial.current;
    setPreparing(true);
    setMessage(null);
    try {
      await document.fonts.ready;
      const result = await renderCourseCard(model, snapshot);
      if (version !== serial.current) { setMessage(t('courseCard.viewChanged')); return; }
      setPrepared({ file: new File([result.blob], gpxFileName(course).replace(/\.gpx$/, '.png'), { type: 'image/png' }), routeOnly: result.routeOnly });
    } catch (error) {
      console.warn('Course card preparation failed:', error);
      setMessage(t('courseCard.failed'));
    } finally {
      setPreparing(false);
    }
  };

  return (
    <dialog className="modal course-card-dialog" ref={dialog} aria-label={t('courseCard.title')}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
      <div className="modal-head">
        <h2>{t('courseCard.title')}</h2>
        <button className="chip" onClick={onClose} aria-label={t('common.close')}>×</button>
      </div>
      {!prepared ? (
        <>
          <p className="muted">{t('courseCard.help')}</p>
          <CourseMapPreview paths={model.paths} start={model.start} end={model.end} onSnapshot={onSnapshot} />
          {snapshot?.pending && <p role="status">{t('courseCard.loading')}</p>}
          <button className="primary" disabled={!snapshot || snapshot.pending || preparing} onClick={() => void prepare()}>
            {t(preparing ? 'courseCard.preparing' : 'courseCard.prepare')}
          </button>
        </>
      ) : (
        <>
          {url && <img className="course-card-image" src={url} alt={t('courseCard.alt', {
            name: model.name, distance: model.distance, start: model.startName, end: model.endName, status: model.status, runners: model.runners,
          })} />}
          {prepared.routeOnly && <p role="status">{t('courseCard.routeOnly')}</p>}
          <p className="muted"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{t('courseCard.attribution')}</a></p>
          <div className="actions">
            {supported && (
              <button className="chip" disabled={sharing} onClick={() => {
                setSharing(true);
                void sendShareFile(prepared.file, course.name).then(setMessage).finally(() => setSharing(false));
              }}>{t('courseCard.share')}</button>
            )}
            <button className="chip" onClick={() => {
              try { downloadFile(prepared.file); setMessage(t('fileShare.downloadStarted')); }
              catch (error) { console.warn('Course card download failed:', error); setMessage(t('fileShare.downloadFailed')); }
            }}>{t('courseCard.download')}</button>
            <button className="chip" disabled={sharing} onClick={() => { serial.current++; setSnapshot(null); setPrepared(null); setMessage(null); }}>
              {t('courseCard.change')}
            </button>
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </dialog>
  );
}
