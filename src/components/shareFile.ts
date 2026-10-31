import type { Course } from '../domain/course';
import { courseToGpx, gpxFileName } from '../domain/gpx';
import { t } from '../i18n';

export const makeGpxFile = (course: Course): File =>
  new File([courseToGpx(course)], gpxFileName(course), { type: 'application/gpx+xml' });

export function canShareFile(file: File): boolean {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch (error) {
    console.warn('File-sharing capability check failed:', error);
    return false;
  }
}

export async function sendShareFile(file: File, title: string): Promise<string | null> {
  try {
    await navigator.share({ files: [file], title });
    return t('fileShare.handoff');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return null;
    console.warn('File sharing failed:', error);
    return t('fileShare.failed');
  }
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
