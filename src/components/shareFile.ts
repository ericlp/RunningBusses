import type { Course } from '../domain/course';
import { courseToGpx, gpxFileName } from '../domain/gpx';
import { t } from '../i18n';

export interface FileMessage {
  text: string;
  tone: 'info' | 'error';
}

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

export async function sendShareFile(file: File, title: string): Promise<FileMessage | null> {
  try {
    await navigator.share({ files: [file], title });
    return { text: t('fileShare.handoff'), tone: 'info' };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return null;
    console.warn('File sharing failed:', error);
    return { text: t('fileShare.failed'), tone: 'error' };
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
