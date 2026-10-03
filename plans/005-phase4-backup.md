# 005 – Phase 4: backup export and import

Status: done.

- **Export:** settings (⚙) → Exportera downloads `busslopning-YYYY-MM-DD.json` (format `running-busses-backup`, version 1) with all courses (self-contained line snapshots) and the connection radius. No keys, no tiles.
- **Import:** the whole file is validated first (size ≤ 25 MB, version, statuses, coordinates, unique ids, no line in two courses). Nothing is written if validation fails.
- **Replace all:** confirmation, then the current courses are saved as a recovery copy before the swap.
- **Merge:** identical courses are skipped. Same id but different content, or different courses claiming the same line, are conflicts; the user keeps one whole course per conflict. Choices are re-evaluated after each pick (a same-id replacement can reveal an ownership conflict). Import is disabled until no conflicts remain.
- **Recovery:** "Hämta kopia före senaste import" downloads the pre-import state as a backup file.
- A draft that edits a course which no longer exists or is completed after import is dropped.
- Code: `src/domain/backup.ts` (+ tests), `src/components/Backup.tsx`, `store.ts` (recovery).
- Not done (deliberately): settings other than the radius, since there are no variant overrides; reconciling imported incomplete courses to the current dataset belongs to Phase 5.
