# 038 – People and participants

Status: done. Per-person tracking was out of scope in PLAN.md; it is now in.

- **List:** names stored in IndexedDB key `people`. Names are the identity (trimmed, case-insensitive, max 40 characters), so devices merge without ids. The list shown is the stored list plus everyone named on a course, so an import can never leave an unknown name.
- **Completing a course** asks who ran it: chips, and new names can be added inline. The picker starts from the course's earlier runners, otherwise from the latest completed course's. Stored on the course as optional `participants`.
- **Completed courses stay locked**, but "Ändra datum och deltagare" edits date and runners only.
- **Managing:** add and remove in the progress panel ([037](037-progress-panel.md)). A person named on a course cannot be removed. No renaming.
- **Backup:** `people` is added to the file (optional, so old backups load) and `participants` is validated. Courses are written first, the list second; the list is rebuilt from the courses, so a failed second write loses nothing. Replace takes the file's people, merge takes the union.
- **Share links** carry `participants` as an optional 8th course element; version stays 1 and older apps ignore it.
- Tests: `stats.test.ts` (names), `backup.test.ts`, `share.test.ts`, `e2e/people.mjs`.
