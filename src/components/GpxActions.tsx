import { useMemo, useState, type ReactNode } from 'react';
import type { Course } from '../domain/course';
import { t } from '../i18n';
import { Icon } from './Icon';
import { canShareFile, downloadFile, makeGpxFile, sendShareFile, type FileMessage } from './shareFile';

export function GpxActions({ course, onMessage, children }: { course: Course; onMessage: (message: string, tone: FileMessage['tone']) => void; children?: ReactNode }) {
  const file = useMemo(() => makeGpxFile(course), [course]);
  const supported = useMemo(() => canShareFile(file), [file]);
  const [sharing, setSharing] = useState(false);
  return (
    <div className="gpx-actions">
      <div className="actions">
        {children}
        {supported && (
          <button className="chip" disabled={sharing} onClick={() => {
            setSharing(true);
            void sendShareFile(file, course.name).then((message) => {
              if (message) onMessage(message.text, message.tone);
            }).finally(() => setSharing(false));
          }}>
            <Icon name="share" />
            {t('gpx.share')}
          </button>
        )}
        <button className="chip" onClick={() => {
          try {
            downloadFile(file);
            onMessage(t('fileShare.downloadStarted'), 'info');
          } catch (error) {
            console.warn('GPX download failed:', error);
            onMessage(t('fileShare.downloadFailed'), 'error');
          }
        }}>
          <Icon name="download" />
          {t('courses.gpx')}
        </button>
      </div>
      <p className="muted">{t('gpx.garminHelp')}</p>
    </div>
  );
}
