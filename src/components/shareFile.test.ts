import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '../domain/course';
import { courseToGpx } from '../domain/gpx';
import { canShareFile, makeGpxFile, sendShareFile } from './shareFile';
import { t } from '../i18n';

const course: Course = {
  id: 'c', name: 'Bana 1/2: Ö', status: 'NotCompleted', createdAt: '', updatedAt: '', completedAt: null,
  legs: [{ kind: 'manual', id: 'm', label: 'Bridge', lengthM: null }],
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('prepared file sharing', () => {
  it('prepares the real exporter bytes, name and MIME without altering the course', async () => {
    const before = structuredClone(course);
    const file = makeGpxFile(course);
    expect(file.name).toBe('bana-12-o.gpx');
    expect(file.type).toBe('application/gpx+xml');
    expect(await file.text()).toBe(courseToGpx(course));
    expect(course).toEqual(before);
  });

  it('feature-detects the actual file rather than a browser name', () => {
    const file = makeGpxFile(course);
    const canShare = vi.fn(() => false);
    vi.stubGlobal('navigator', { share: vi.fn(), canShare });
    expect(canShareFile(file)).toBe(false);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    vi.stubGlobal('navigator', {});
    expect(canShareFile(file)).toBe(false);
  });

  it('logs a broken capability API and retains the download fallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => { throw new TypeError('Unsupported'); } });
    expect(canShareFile(makeGpxFile(course))).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('calls share synchronously with a prepared file, before its promise settles', async () => {
    const file = makeGpxFile(course);
    let finish!: () => void;
    const share = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    vi.stubGlobal('navigator', { share });
    const result = sendShareFile(file, course.name);
    expect(share).toHaveBeenCalledWith({ files: [file], title: course.name });
    finish();
    expect(await result).toEqual({ text: t('fileShare.handoff'), tone: 'info' });
  });

  it('treats cancellation as silence, but logs and reports other failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('navigator', { share: () => Promise.reject(new DOMException('Cancelled', 'AbortError')) });
    expect(await sendShareFile(makeGpxFile(course), course.name)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', { share: () => Promise.reject(new Error('No target')) });
    expect(await sendShareFile(makeGpxFile(course), course.name)).toEqual({ text: t('fileShare.failed'), tone: 'error' });
    expect(warn).toHaveBeenCalled();
  });
});
