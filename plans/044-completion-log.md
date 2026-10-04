# 044 – Completion log

Status: done.

- A persistent history of "completed" and "no longer completed" events, kept separately from courses so it survives un-completing and deleting courses (IndexedDB key `log`, max 500 entries).
- Undo removes the entry it created. Log write failures are non-fatal.
- Included in backup (`log`, optional for old files); merge import unions by id, replace takes the file's log.
- Shown as "Historik" in the progress panel (latest 30).
- `src/domain/log.ts`.
