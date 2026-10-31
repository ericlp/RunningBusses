import { useMemo, useState } from 'react';
import type { Course } from '../domain/course';
import { t } from '../i18n';
import { Icon } from './Icon';
import { canShareFile, downloadFile, makeGpxFile, sendShareFile } from './shareFile';

export function GpxActions({ course, onMessage }: { course: Course; onMessage: (message: string) => void }) {
  const file = useMemo(() => makeGpxFile(course), [course]);
  const supported = useMemo(() => canShareFile(file), [file]);
  const [sharing, setSharing] = useState(false);
  return (
    <div className="gpx-actions">
      <div className="actions">
        {supported && (
          <button className="chip" disabled={sharing} onClick={() => {
            setSharing(true);
            void sendShareFile(file, course.name).then((message) => {
              if (message) onMessage(message);
            }).finally(() => setSharing(false));
          }}>
            <Icon name="share" />
            {t('gpx.share')}
          </button>
        )}
        <button className="chip" onClick={() => {
          try {
            downloadFile(file);
            onMessage(t('fileShare.downloadStarted'));
          } catch (error) {
            console.warn('GPX download failed:', error);
            onMessage(t('fileShare.downloadFailed'));
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
