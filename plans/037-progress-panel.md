# 037 – Progress panel

Status: done.

A collapsible panel at the top of plan mode (`components/Stats.tsx`, logic in `src/domain/stats.ts`).

- Shows lines done / planned / total with a bar, distance done and remaining, distance run (whole completed courses, gaps included), and a per-category split when more than one category is present.
- Per-person totals (courses and distance) and the five latest completed courses. The latest-completed list doubles as the completion history (see [039](039-undo-completion.md)).
- Everything is derived from courses and the current line data; nothing new is stored for the panel itself.
- Lines missing from new data still count toward distance run, but not toward the line totals.
- Tests: `src/domain/stats.test.ts` (`computeProgress`).
