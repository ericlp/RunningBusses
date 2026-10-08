# 058 - On-demand category data

**Status:** Implemented. Split publication and client loading/offline installation were delivered as separate commits. All six implementation groups below are complete.

## Problem

The expanded dataset loads every route before the default city-bus view is usable. It contains 13,855,413 bytes JSON / 3,324,481 bytes gzip. Category-based loading should reduce startup download, parsing and memory costs without changing coverage, course identities or historical snapshots.

Measurements from the current dataset:

| Proposed payload | JSON bytes | Gzip bytes |
| --- | ---: | ---: |
| Complete catalogue without route/stop coordinates | 416,850 | 84,500 |
| City-bus geometry | 437,369 | 99,692 |

Together these are approximately 184 KB gzip, plus a small manifest. This is a payload projection, not a promised page-load speedup.

## Confirmed decisions

- One geometry payload per existing category, including trams, with a complete lightweight catalogue.
- Geometry loads on demand; do not automatically fetch every category after startup.
- Cache used categories automatically and offer an explicit download-all action.
- City buses have default priority. Saved filters, direct route links and shared-course requirements determine priority when present.
- Download-all installs a coherent release for offline use. Refreshing that installation after new data arrives is explicit, not an automatic all-category download.
- Preserve automatic updates for open, unpinned courses by fetching their required categories after the initial view becomes usable.
- Preserve completed/pinned snapshots, route coverage, identities, defaults, backups, share formats and viewport rendering.

Out of scope: per-line/geographical shards, geometry simplification, route-selection changes, new categories, an all-buses shortcut, automatic all-category prefetch and map-tile prefetch.

## Data contract and compatibility

Publish a new versioned loading contract alongside existing schema-1 assets:

- `data/catalog-manifest.json`: release/feed metadata, complete route count and catalogue/category descriptors with content hashes, counts and byte sizes.
- `data/catalog.<hash>.json`: every route's identity, category, display fields, tags, length and ordered stop names; no route coordinates or stop positions.
- `data/categories/<category>.<hash>.json`: geometry keyed by route identity, containing coordinates and optional stop positions.

Use separate typed metadata and geometry records. Never represent an unloaded route as a full `Line` with empty coordinates. Construct full lines only after geometry is available.

Keep ordering deterministic and reconstruct existing records exactly, including optional fields and property ordering, so JSON-based snapshot comparison does not report false changes. Content hashes exclude volatile timestamps; unchanged geometry may be reused across releases.

Retain `lines.json` and its existing `manifest.json` for already-running clients and aggregate validation. The new client must not normally fetch or read the monolith. Existing cached data may provide a one-time offline migration/fallback; never migrate or delete courses, drafts or other user records.

## Loading and UI

1. Load the small manifest and complete catalogue, falling back to a coherent cached catalogue when needed.
2. Resolve the current context: city buses for a fresh default visit, saved filter categories for returning users, the linked category for a direct route link, or validated referenced categories for a share link.
3. Render search, list metadata, filter availability, sorting and progress from the complete catalogue. Unloaded categories remain discoverable and totals stay accurate.
4. Draw loaded, selected geometry. Pending categories have explicit loading/unavailable states, not misleading empty results. Unrelated categories do not block the initial view.
5. A row selection can prioritise its category. Preserve the selected hash while loading; fitting, navigation and new line legs wait for valid geometry.
6. Planning suggestions must not claim a complete nearest-route pool while selected planning categories are unavailable. Show what is missing and offer retry or an explicit filter change.
7. Deduplicate in-flight requests and honour the latest selection/filter intent. Late responses must not undo newer choices. Do not hydrate every cached category into memory.

Loading, error, retry and offline messages go into all three dictionaries. Preserve existing category-selection protection and stored preferences.

## Courses, shares and missing routes

- Display, export and edit saved snapshots without fetching their historical categories merely to draw them.
- After the initial view, fetch categories referenced by open, unpinned courses when needed for automatic reconciliation.
- Reconcile a course only after all its currently existing referenced routes are available. Avoid partial mixed-category updates and stale-state writes after asynchronous fetches.
- Do not downgrade courses when falling back to an older installed offline release. Completed/pinned courses never auto-update.
- Explicit refresh waits for complete required geometry and persists only after successful resolution.
- Determine real removals from catalogue keys, not loaded geometry. Retain historical snapshots and existing warnings for genuinely missing lines.
- Separate bounded share parsing/key discovery from reconstruction. Preserve compression limits, version checks, malformed-link errors and the wire format.
- Fetch categories for valid known share keys before rebuilding. Known but network-unavailable routes are retryable, not removed or silently skipped. Retain pending share intent until resolution; imports remain explicit and atomic.
- Preserve duplicate-number ownership, return keys, backups, GPX, participants and history.

## Caching and offline installation

Store catalogue/release metadata separately from category payloads in IndexedDB. Update payloads and availability metadata atomically so startup can inspect availability without reading large values.

The new loader owns new-data caching. Exclude its manifest/catalogue/category requests from service-worker fallback caching to avoid duplicate caches and concealed network failures. Preserve legacy data/app-shell behaviour, network-first freshness, relative GitHub Pages paths and the existing OSM tile policy.

If persistence fails, valid fetched geometry may remain usable in memory, but report that offline saving failed. Never claim data was saved merely because the fetch succeeded.

Settings shows cached-category availability and download-all, progress by completed categories, retry and an explicit refresh when the installed release is older. Download-all fetches missing payloads for one pinned release without adding every category to the active map or loading them all on later startup.

Stage validated saves and atomically promote the installed-release pointer only after the catalogue and every category are persisted. Failed, interrupted or quota-limited downloads remain incomplete; retain the previous installation and reuse valid staged work on retry.

Ordinary online browsing may use newer on-demand data while an older complete offline installation remains retained. Offline fallback activates one coherent release and identifies stale data. Do not combine incompatible older chunks with newer metadata.

For stale content-addressed URLs during deployment, refresh the manifest and restart resolution once; do not accept mismatched content or retry indefinitely.

Garbage-collect only owned, unreferenced transit-data entries, protecting the active release, installed offline release and an in-progress refresh. Browser storage may be evicted; do not promise permanent retention or offline map coverage.

## Implementation todos

### 1. Defining split assets

Update `src/domain/types.ts`, `scripts/build-transit-data.ts` and small split/reassembly helpers. Add deterministic descriptors, metadata and geometry payloads while preserving aggregate outputs. Test schema, hashes, membership, counts and exact reconstruction.

### 2. Implementing loading and caching

Replace the monolithic bootstrap in `src/data/dataset.ts`; add deduplicated category resolution, coherent release fallback and atomic cache helpers in `src/data/idb.ts`. Update `public/sw.js`. Test reuse, corruption, missing chunks, storage failures, legacy fallback and deployment races.

### 3. Wiring catalogue-backed workflows

Adapt `src/App.tsx`, filter/search/sort, progress helpers and component callers to metadata where coordinates are unnecessary. Wire pending selection, planning readiness, removal detection, deferred reconciliation and prepared share resolution. Add focused tests and i18n.

### 4. Adding offline installation controls

Implement staged durable downloads and atomic installation promotion. Add Settings availability, download/progress, retry and manual-refresh controls. Preserve the previous installation during failures, and avoid hydrating all cached geometry. Test interruption, quotas and release consistency.

### 5. Updating publication safeguards

Extend validation to verify every descriptor, hash and key and lossless aggregate reassembly. Update the monthly workflow to publish all generated assets and compare a stable release hash, while retaining prior-aggregate comparison and removal guards. Clean obsolete generated files only within explicitly owned paths. Regenerate assets and update README/Copilot guidance.

### 6. Verifying and delivering

Register `e2e/category-data.mjs` and adapt the regional fixture to the split contract. Cover startup requests, saved non-city filters, deep links, mixed-category shares, partial failure/retry, course updates, real removals, offline installation/refresh, service-worker behaviour and storage failure.

Dependencies: split assets precede loading and publication; loading precedes workflow integration and offline installation; integration, offline installation and publication precede final delivery.

Before each implementation commit, run typecheck, unit tests, build, all browser journeys and dataset validation. Commit coherent changes with tests/i18n/documentation and the required co-author trailer. Do not push without a request.

## Acceptance and performance verification

- Reconstruct all current routes unchanged; preserve identities, historical snapshots and schema-1 backups/shares.
- A clean default visit requests only the manifest, catalogue and city-bus geometry, not the monolith or unrelated category geometry.
- Combined default route-data gzip size is at most 10% of the current monolithic baseline; verify actual generated assets and request sets.
- Saved filters and links load their required categories without forcing city buses. Selecting every category remains complete.
- Search, tags, lengths, availability and progress are accurate before all geometry is loaded.
- Unloaded known routes never produce false removal warnings or skipped imports.
- Automatic updates wait for complete per-course data and never modify completed/pinned snapshots or partially update mixed courses.
- Offline success requires persistence; failed refreshes preserve a coherent installation.
- Warm city-only startup does not read/hydrate every cached category, even after download-all.
- Record bytes, cold/warm requests, transferred data, parsing/hydration, memory where available and usability under controlled network/CPU throttling. Compare against the monolith and distinguish emulation from physical-device evidence.

## Remaining trade-offs

The regional category is still large when requested. Splitting does not remove the cost of rendering every category, so the existing viewport optimization remains necessary. Legacy compatibility temporarily duplicates published geometry assets, without requiring the new client to download both formats.

## Implementation results

The existing aggregate was used to generate the new assets without changing the feed, route selection or geometry. All 805 routes reassemble byte-for-byte at the JSON line-record level, including optional fields and property ordering. Both refresh and deployment workflows validate the generated assets before publication.

The client uses the catalogue for lists, searches, filters, availability, progress and removal detection. Geometry resolution deduplicates requests and retries a deployment race once. Pending links retain their selection; prepared shares retain their intent until all known referenced geometry resolves. Planning waits for its complete selected pool while snapshot editing controls remain usable. Automatic reconciliation waits for complete per-course geometry, skips completed/pinned courses and older offline fallback, and explicit asynchronous refreshes reject stale course state.

Owned IndexedDB release metadata and category payloads are persisted atomically. Offline installation stages one pinned release, reuses durable work on retry and promotes its pointer only when all categories are saved. The previous installation remains through failed refreshes. On-demand browsing can use a newer release independently; warm startup reads only requested category payloads. Missing/corrupt/evicted chunks are validated and reported rather than treated as removed routes. Garbage collection protects active, installed and staged releases and never touches user records. Split assets bypass service-worker fallback caching; activation also removes accidental duplicate split entries left by an older worker. Course imports now atomically persist recovery, courses, participants and history.

### Actual generated payload sizes

| Payload | JSON bytes | Gzip bytes |
| --- | ---: | ---: |
| Manifest | 2,011 | 683 |
| Complete catalogue | 416,755 | 84,434 |
| City-bus geometry | 437,420 | 99,630 |
| Default total | 856,186 | 184,747 |
| Legacy aggregate baseline | 13,855,413 | 3,324,481 |

Default route data is **5.56%** of the monolithic gzip baseline, below the 10% acceptance threshold. A cold default visit makes exactly three transit requests: manifest, catalogue and city geometry. Warm city startup after download-all requests only the manifest and does not read/hydrate other category payloads.

### Controlled browser measurements

Run on 2026-10-08 with `e2e/category-performance.mjs`: headless Chromium, 360 x 740 viewport, CDP 4x CPU slowdown, 50 ms latency and 10 Mbit/s download. Vite preview served gzip; tile requests were blocked to isolate route loading. The following is one controlled sample, not a promised load-speed improvement.

| Loader / state | Transit requests | Transferred route bytes, including resource overhead | JSON parse time | Readiness | Retained JS heap (decimal MB) |
| --- | ---: | ---: | ---: | --- | ---: |
| Split / cold | 3 | 185,647 | 14.2 ms | Visible city route canvas: 1,436 ms | 14.4 |
| Split / warm after download-all | 1 | 983 | 9.9 ms | Visible city route canvas: 981 ms | 15.0 |
| Previous monolith loader / cold | 2 | 3,325,283 | 198.6 ms | Data-ready only: 3,231 ms | 31.1 |
| Previous monolith loader / warm | 1 | 502 | No JSON parse; full IndexedDB object hydration | Data-ready only: 524 ms | 42.1 |

The warm split geometry IndexedDB read took 5.7 ms; the warm baseline read/materialisation of the full cached dataset took 22.9 ms. These asynchronous request timings include scheduling, not isolated storage microbenchmarks. Split readiness includes application loading/rendering, whereas the baseline emulates the previous loader without UI rendering; the readiness columns are therefore **not an equivalent end-to-end speed comparison**. Heap was sampled after forced garbage collection and is not peak or total device memory. This is emulation, not physical-phone evidence.

### Verification

Typechecking, all 187 unit tests, the production build, all 16 registered browser journeys and dataset validation passed before delivery. The category journey covers default/warm request sets, saved non-city filters, deep links, mixed shares, incomplete planning pools, late selections, deferred mixed-course updates, pinned/completed snapshots, true removals, stale explicit-refresh writes, service-worker offline startup, installation refresh/retry and storage failures. Unit tests additionally cover lossless publication, owned-file cleanup, cache corruption, eviction, deployment races, deduplication, interrupted installations, legacy offline migration and bounded share preparation.
