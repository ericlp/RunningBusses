import type { Course } from '../domain/course';
import { encodeShare, shareUrl, SHARE_WARN_CHARS } from '../domain/share';
import { t } from '../i18n';

/** Shares or copies a link to the given courses. Returns a message to show, or null when there is nothing to say. */
export async function sendShareLink(courses: Course[], feedVersion: string, how: 'share' | 'copy', partial = false): Promise<string | null> {
  const url = shareUrl(await encodeShare(courses, feedVersion, partial));
  const warn = url.length > SHARE_WARN_CHARS ? ' ' + t('share.long') : '';
  try {
    if (how === 'share' && navigator.share) {
      await navigator.share({ title: t('app.title'), url });
      return warn.trim() || null;
    }
    await navigator.clipboard.writeText(url);
    return t('share.copied') + warn;
  } catch (e) {
    return (e as Error).name === 'AbortError' ? null : t('share.failed');
  }
}
