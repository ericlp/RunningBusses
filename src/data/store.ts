import type { Course, Leg } from '../domain/course';
import { isLogEntry } from '../domain/log';
import { idbGet, idbRead, idbUpdate } from './idb';

export interface Draft {
  name: string;
  legs: Leg[];
  /** Set when the draft is an edit of this saved course rather than a new course. */
  editingId?: string;
}

export const DEFAULT_RADIUS_M = 500;

interface Revision {
  state: string | null;
  draft: string | null;
}

export class WriteConflict extends Error {
  constructor() { super('Saved data changed in another tab.'); }
}

export class UserStore {
  private revision: Revision = { state: null, draft: null };
  private loaded = false;
  private conflicted = false;
  private queue: Promise<void> = Promise.resolve();

  async load() {
    const [courses, draft, people, log, revision] = await idbRead(['courses', 'draft', 'people', 'log', 'user.revision']);
    if (revision !== undefined && (typeof revision !== 'object' || revision === null ||
        !('state' in revision) || !('draft' in revision) ||
        (revision.state !== null && typeof revision.state !== 'string') ||
        (revision.draft !== null && typeof revision.draft !== 'string'))) {
      throw new Error('Invalid saved user revision.');
    }
    this.revision = (revision as Revision | undefined) ?? { state: null, draft: null };
    this.loaded = true;
    return {
      courses: (courses as Course[] | undefined) ?? [],
      draft: (draft as Draft | undefined) ?? null,
      people: Array.isArray(people) ? people.filter((x): x is string => typeof x === 'string') : [],
      log: Array.isArray(log) ? log.filter(isLogEntry) : [],
    };
  }

  save(entries: [string, unknown][], kind: 'state' | 'draft' = 'state'): Promise<void> {
    const state = this.revision.state;
    const write = this.queue.then(async () => {
      if (!this.loaded) throw new Error('User data has not been loaded.');
      if (this.conflicted) throw new WriteConflict();
      const next: Revision = { ...this.revision, [kind]: crypto.randomUUID() };
      try {
        await idbUpdate<Revision>('user.revision', (previous) => {
          const current = previous ?? { state: null, draft: null };
          if (current.state !== this.revision.state || current.draft !== this.revision.draft ||
              (kind === 'state' && state !== this.revision.state)) throw new WriteConflict();
          return { value: next, entries };
        });
        this.revision = next;
      } catch (error) {
        if (error instanceof WriteConflict) this.conflicted = true;
        throw error;
      }
    });
    this.queue = write.catch(() => {});
    return write;
  }
}

export function loadRadius(): number {
  const v = Number(localStorage.getItem('radiusM'));
  return Number.isFinite(v) && v >= 50 && v <= 5000 ? v : DEFAULT_RADIUS_M;
}

export function saveRadius(m: number): void {
  localStorage.setItem('radiusM', String(m));
}

export interface Recovery {
  savedAt: string;
  courses: Course[];
}

/** The state from just before the last import, so a wrong import can be undone from a file. */
export async function loadRecovery(): Promise<Recovery | null> {
  return (await idbGet<Recovery>('recovery')) ?? null;
}
