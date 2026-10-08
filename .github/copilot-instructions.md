# Copilot instructions

Static, phone-first React + TypeScript + Vite + Leaflet site for planning runs along Västtrafik bus/tram lines ("courses"), with ferries as a separate reference category. No backend; user data lives in the browser (IndexedDB, localStorage). Deployed to GitHub Pages.

## Commands

Node 24 via mise (`mise install`, `mise exec -- npm ci`).

- `npm run dev` – dev server
- `npm run typecheck` – `tsc --noEmit`
- `npm test` – Vitest (`src/**/*.test.ts`, `scripts/**/*.test.ts`)
  - Single file: `npx vitest run src/domain/course.test.ts`; single test: `npx vitest run -t "name"`
- `npm run build` – typecheck + production build to `dist/`
- `npm run e2e` – Playwright journeys against `vite preview` on port 4173. Requires `npm run build` first and `npx playwright install chromium`.
  - Single journey: start `npx vite preview --port 4173 --strictPort`, then `node e2e/courses.mjs`. The journeys listed in `e2e/run.mjs` are plain scripts, not a test framework; add new ones to that list.
- `npm run data` – rebuild `public/data/` from the Trafiklab GTFS feed (needs `TRAFIKLAB_API_KEY` in `.env`; never commit it)
  - Reuses `.cache/vt/` when present; `npm run data -- --download` fetches a fresh feed. `--date=YYYYMMDD` selects the reference service day.
- `npm run data:validate -- --previous=old-lines.json` – validate a rebuilt dataset

There is no linter. CI (`deploy.yml`) runs typecheck, test, dataset validation, build, e2e, then deploys.

Playwright MCP is configured for this repository in `.github/mcp.json`. Its launcher uses the project's installed Chromium, so run `npm ci` and `npx playwright install chromium` before using it. Browsers are headless and isolated; MCP output goes to `.cache/playwright-mcp/`.

## Architecture

- `scripts/` (build-time, run with tsx): downloads the Västtrafik GTFS Regional feed and the official public-line registry. Includes public timetabled buses and ferries across the feed period, excluding pupil-restricted school transport; public school-day lines remain eligible. `config/lines.json` scopes the original Gothenburg categories; additional buses use `other-bus` and ferries use `ferry`. Ferries retain water geometry and allow short crossings down to 50 m. `config/route-aliases.json` holds verified normal/call-ordered pairings. Publishes schema-2 `catalog-manifest.json`, a content-addressed catalogue and category geometry payloads, plus legacy `lines.json` + `manifest.json`. Monthly refresh validates split hashes/counts/membership and exact aggregate reconstruction against published data; deployment compares the stable release hash.
- `src/domain/`: pure logic (geo/distance, course building, overlap detection, filters, reconcile of courses against new data, backup, share links, GPX). **No React or Leaflet imports here**; this is where unit tests live (`*.test.ts` next to the source).
- `src/data/`: `dataset.ts` loads the complete lightweight catalogue and requested category geometry only. Owned `transit.*` IndexedDB entries keep release metadata/availability separate from payloads; writes and complete offline installation promotion are atomic. Keep active/installed/staged releases coherent and never hydrate every cached category on startup. `idb.ts` and the store also persist user records.
- `src/components/` + `src/App.tsx`: UI (map, course list/editor, backup, tour). `MapView.tsx` is the only place that touches Leaflet; geometry is lon/lat in data and converted for Leaflet there.
- `src/i18n/`: `sv.ts` is the source of truth (defines `Key`/`Dict`); `en.ts` and `fr.ts` must provide the same keys. Language follows the browser, Swedish fallback. `i18n.test.ts` checks the dictionaries.
- `public/sw.js`: service worker, network-first for app-shell/legacy data. Split manifest/catalogue/category requests bypass it; the IndexedDB loader owns their fallback and upgrade activation removes accidental duplicate split entries. OSM tiles are cached only after being viewed (no prefetch), with local expiry metadata honouring accessible server freshness headers (7-day fallback) and an 800-tile limit. Stale viewed tiles survive HTTP/network failures; storage failures cannot discard successful downloads.

## Conventions

- Vite `base: './'`: all asset/data paths must be relative so the site works under the GitHub Pages sub-path.
- A line is identified by its stable `key`, never by line number alone. Preserve legacy keys (`59`, `62r`); additional buses and ferries use `vt.<route_id>` with an optional `r`. Lines carry a `category` (`stadsbuss | stombuss | express | industri | other-bus | tram | ferry`) and `tags` (`call-ordered | loop | one-way | retur`). Trams have fixed colours.
- Route geometries are immutable. Cached extents support map hit testing and buffered-viewport rendering; offscreen routes remain in the dataset and list and must render when panned or selected.
- Catalogue `LineMetadata` is separate from `LineGeometry`; never invent a full `Line` with empty coordinates. Preserve optional fields and property ordering on reassembly so historical snapshot comparisons stay exact.
- Pre-ferry schema-2 manifests may lack the ferry descriptor; preserve their original release hashes and offline installations. New publication includes all seven categories. Install/retain only descriptors present in a release, and report absent geometry as unavailable.
- Use catalogue keys for removals, lists, search, filtering and progress. Planning waits for every selected category. Resolve validated share keys before rebuilding; unavailable known geometry is retryable, not missing. Automatic reconciliation waits for all current route categories per course and never downgrades snapshots on an older offline fallback.
- Each line belongs to at most one course. Route status (`NotPlanned`/`NotCompleted`/`Completed`) is derived from courses, never stored. Courses store a snapshot of each leg's route; totals are always recomputed, never trusted from imported files.
- Completed courses are locked; an unlocked course is pinned to its historical data until explicitly updated. Lines missing from new data stay in existing courses with a warning.
- Backups retain route snapshots; share links encode route keys and rebuild legs from the recipient's dataset. Courses with unknown keys are skipped and reported; partial-course links must merge, not replace.
- Completion history is separate from current course state: uncompleting or deleting a course does not erase its log. Log entries merge by event ID and are capped at 500.
- Multi-record storage writes (split, import, update) must be atomic; show "saved" only after the write succeeds.
- Any user-visible string goes into all three i18n dictionaries.
- New localStorage keys use the `rb.` prefix (e.g. `rb.filters`, `rb.sort`); preserve existing unprefixed `lang` and `radiusM` keys for compatibility. Stored preferences are validated on load and fall back to defaults. URL hash state: `#line=<key>`, `#mode=plan`, `#sync=` (share link, consumed first).
- Design lives in `plans/`: `PLAN.md` is frozen except for corrections; each change gets a small `plans/NNN-title.md` linked from PLAN.md's "Change plans". Read the relevant plan before changing a feature.
- Commit each feature or fix separately (one logical change per commit, with its plan, tests and i18n keys), not as one large commit. E2E journeys count as tests: before every commit run `npm run typecheck`, `npm test`, `npm run build` and `npm run e2e`, and commit only when all pass. New user-visible features get a journey in `e2e/` (added to `e2e/run.mjs`).
