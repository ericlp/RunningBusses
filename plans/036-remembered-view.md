# 036 – Remembered view and links

- Filters (`rb.filters`) and sort order (`rb.sort`) are saved in localStorage and restored on load. Stored values are validated; anything invalid falls back to the defaults, and unavailable storage is ignored. The search text is not saved.
- The address bar hash reflects the view: `#mode=plan` and `#line=<key>`. Opening such a link (or reloading) restores the mode and selects the line; a link to a line also fits the map to it once. The build mode is never written, since an unsaved draft cannot be linked.
- A `#sync=` share link (plan 033) is consumed first and wins; the view hash is not written while one is pending.
- A view link pasted into an already open tab (hash change only) applies the same way, unless a draft is being built.
- Side effect: a reload in plan mode now stays in plan mode.
- Tests: `src/domain/filter.test.ts` (load/save, invalid and unavailable storage) and `e2e/links.mjs` (filters survive reload, line and plan links).
