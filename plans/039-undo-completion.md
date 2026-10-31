# 039 – Undo for completion

Status: done.

- Marking a course completed, or not completed, shows an "Ångra" toast for 8 seconds that restores the course exactly as it was before (only that course; others are untouched).
- Editing runners or date on a completed course shows no undo.
- No separate persistent history log: the latest-completed list in the progress panel ([037](037-progress-panel.md)) serves as the history. A log that survives un-completing was deliberately not built here; it was added later in [044](044-completion-log.md).
- Test: `e2e/people.mjs` (undo reverts completion).
