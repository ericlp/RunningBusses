# Copilot instructions

Static, phone-first React + TypeScript + Vite + Leaflet site for planning runs along Gothenburg bus/tram lines ("courses"). No backend; user data lives in the browser (IndexedDB, localStorage). Deployed to GitHub Pages.

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
- `npm run data:validate -- --previous=old-lines.json` – validate a rebuilt dataset

There is no linter. CI (`deploy.yml`) runs typecheck, test, build, e2e, then deploys.

## Architecture

- `scripts/` (build-time, run with tsx): downloads the Västtrafik GTFS Regional feed, classifies lines using `config/lines.json` (categories by number range/pattern/colors, route-id prefix), and writes `public/data/lines.json` + `manifest.json`. The `refresh-transit-data` workflow runs this monthly, validates against the previously published data, commits and redeploys only if lines changed.
- `src/domain/`: pure logic (geo/distance, course building, overlap detection, filters, reconcile of courses against new data, backup, share links, GPX). **No React or Leaflet imports here**; this is where unit tests live (`*.test.ts` next to the source).
- `src/data/`: loading the published dataset, IndexedDB (`idb.ts`) and the store.
- `src/components/` + `src/App.tsx`: UI (map, course list/editor, backup, tour). `MapView.tsx` is the only place that touches Leaflet; geometry is lon/lat in data and converted for Leaflet there.
- `src/i18n/`: `sv.ts` is the source of truth (defines `Key`/`Dict`); `en.ts` and `fr.ts` must provide the same keys. Language follows the browser, Swedish fallback. `i18n.test.ts` checks the dictionaries.
- `public/sw.js`: service worker, network-first for fresh data, so monthly data changes need no cache bump.

## Conventions

- Vite `base: './'`: all asset/data paths must be relative so the site works under the GitHub Pages sub-path.
- A line is identified by its stable `key` (e.g. `59`, `62r` for a "retur" direction), never by line number alone. Lines carry a `category` (`stadsbuss | stombuss | express | industri | tram`) and `tags` (`call-ordered | loop | one-way | retur`). Trams have fixed colours.
- Each line belongs to at most one course. Route status (`NotPlanned`/`NotCompleted`/`Completed`) is derived from courses, never stored. Courses store a snapshot of each leg's route; totals are always recomputed, never trusted from imported files.
- Completed courses are locked; an unlocked course is pinned to its historical data until explicitly updated. Lines missing from new data stay in existing courses with a warning.
- Multi-record storage writes (split, import, update) must be atomic; show "saved" only after the write succeeds.
- Any user-visible string goes into all three i18n dictionaries.
- localStorage keys are prefixed `rb.` (e.g. `rb.filters`, `rb.sort`); stored values are validated on load and fall back to defaults. URL hash state: `#line=<key>`, `#mode=plan`, `#sync=` (share link, consumed first).
- Design lives in `plans/`: `PLAN.md` is frozen except for corrections; each change gets a small `plans/NNN-title.md` linked from PLAN.md's "Change plans". Read the relevant plan before changing a feature.
- Commit each feature or fix separately (one logical change per commit, with its plan, tests and i18n keys), not as one large commit. E2E journeys count as tests: before every commit run `npm run typecheck`, `npm test`, `npm run build` and `npm run e2e`, and commit only when all pass. New user-visible features get a journey in `e2e/` (added to `e2e/run.mjs`).
