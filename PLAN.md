# RunningBusses implementation plan

## Problem and outcome

Create a Swedish-language, mobile-first website for planning runs along Gothenburg city-bus lines. Show each line's main geographic path, combine nearby lines into ordered courses, and track group completion locally. Publish the app and periodically generated transit data as static files, with no runtime backend, accounts, or hosted database.

The visual direction is a clean, activity-focused interface inspired by Strava's information hierarchy, using a Västtrafik-inspired palette rather than copied branding or assets. Usability on phones takes priority over desktop fidelity.

## Current state and research

- `/home/ericc/git/eget/RunningBusses` is empty, including no hidden project files. There is no existing implementation, framework, package manifest, testing setup, or Git repository to preserve.
- The user's scope is the Gothenburg **Stadsbusslinjer** category, rather than every Västtrafik route numbered 22–99. Wikipedia identifies this category with that range; membership must be curated and checked against current transit data to avoid same-number lines elsewhere.
- Trafiklab's GTFS Regional documentation lists Västtrafik (`vt`) static data, updated daily, with API-key access. The documented Bronze quota is 50 calls/month, sufficient for a monthly download and occasional manual refreshes.
- GTFS is the preferred source for stops, service calendars, trips, and geographic shapes. Actual Västtrafik feed shape coverage, size, identity stability, and usable main paths are **not yet verified**. An authenticated feed inspection is the first implementation gate; do not promise geographic coverage from documentation alone.
- The documentation specifically says actual service dates come from `calendar_dates.txt`; `calendar.txt` only defines validity periods for this feed. Extended route types require handling beyond GTFS's basic bus value.
- Västtrafik's developer portal exists, but its browser-rendered documentation did not establish a better line-geometry source. No browser API/CORS support is assumed.
- OpenStreetMap data is free; OSM's public raster tiles are a best-effort hosted service with attribution, caching, referrer, and no bulk/offline-download requirements. Low-volume interactive use is a suitable initial choice, not a guaranteed service.

Sources:

- Scope: https://sv.wikipedia.org/wiki/Busstrafik_i_G%C3%B6teborg#Stadsbusslinjer
- GTFS availability, quotas, calendars, and extended types: https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/
- GTFS access specification: https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/static-specification/
- Developer portal: https://developer.vasttrafik.se/
- Dataset catalogue, to verify redistribution terms before publishing: https://trafficdata.se/dataset/gtfs-regional
- OSM tile policy: https://operations.osmfoundation.org/policies/tiles/

## Confirmed decisions

- One main path per city-bus number, reversible for running; official return-direction geometry does not count as a second achievement.
- Automatically select a representative full-length weekday service, with a user-selectable override from available variants.
- Each line belongs to at most one saved course. A draft cannot use a line twice or claim another course's lines.
- Display bus geography as a reference, not pedestrian routing. Prominent, unobtrusive Swedish guidance explains that bus roads, tunnels, and connectors may not be runnable.
- A single group progress record per browser; transfer/merge via JSON files, not live synchronization.
- Courses: `NotCompleted` or `Completed`. Routes derive `NotPlanned`, `NotCompleted`, or `Completed` from course membership; never persist a separate route completion flag.
- Completed courses cannot be edited. A confirmed action can mark one incomplete to unlock it.
- Include naming, deletion, reversing an incomplete course, draft undo, endpoint removal, and course splitting.
- Incomplete courses automatically adopt monthly route updates. Completed courses retain the geometry, endpoints, and distances that were completed.
- Missing/discontinued lines keep their last path in existing courses, with a visible warning, and cannot be added to new courses.
- Straight-line endpoint gaps contribute to total course distance. Show their summed distance in parentheses beside the total only when the **unrounded sum exceeds 100 m**; individual gaps remain visible in details.
- Default suggested connection radius: 500 m, configurable. Endpoint matching considers both ends of each eligible route.
- Include circular routes as full circuits; forward/reverse traversal and their common terminus are supported. Arbitrary mid-route entry is outside initial scope.
- Phone: full-screen map and collapsible bottom sheet. Desktop: left course sidebar. Draft sequence: horizontally scrollable top strip.
- React + TypeScript + Vite, Leaflet, IndexedDB, and monthly GitHub Actions data generation are approved.
- Azure Static Web Apps is an appropriate hosting target; the static output remains portable. Azure App Service and hosted SQLite add no necessary functionality here.
- Basic GPX export remains a stretch goal, not a first-release dependency.

## Proposed defaults awaiting approval

The final clarification was cancelled, so these two policies remain proposals rather than confirmed answers:

1. A saved course whose connection exceeds the radius after data refresh or a radius change stays usable, with a warning. The radius limits newly suggested additions, not whether an existing course may be completed. Never remove/reorder lines automatically.
2. Marking a completed course incomplete previews changes against current route data. On confirmation it adopts current geometry and distances; unavailable lines retain historical geometry with warnings.

Approval of this plan adopts these defaults unless amended.

## User experience

### Browse map

- Open centered on the in-scope Gothenburg network. Render all available main paths with subdued styling and clear line identifiers where useful.
- Tap/click a path to highlight it over the others and show number, calculated reference distance, start/end stop, derived status, and assigned course if any.
- On shared road segments, show a compact chooser of all hit lines rather than selecting an arbitrary topmost polyline. Also provide a searchable line list as an accessible, precise alternative to map selection.
- Filters combine status (all, not planned, not completed, completed) with optional minimum/maximum route distance. "Not completed" includes both unplanned and planned-but-incomplete lines. Label this explicitly.
- Distances are path lengths, not timetable travel distances or durations. Use Swedish formatting and metres/kilometres consistently.
- Status, selection, and eligibility use labels plus stroke width/style as well as color.
- Expose data version/fetch date, freshness warnings, connection radius, backup/import, and main-path selection in a compact settings view.

### Course overview

- Toggle planning mode. Desktop shows the left list; phones show the same list in the bottom sheet.
- Place "Skapa bana" first. Course rows show name, bus sequence, status, total distance, connection subtotal when applicable, first start stop, and last end stop.
- Selecting a course highlights its complete ordered path, endpoints, and dashed connectors. Fit the map with padding for sheets/sidebar/top strip.
- Incomplete rows offer edit/complete. Completed rows show completion and offer confirmed unlock/delete, but no edit.
- Confirm completion-status changes and deletion because they change derived route statuses. Deleting a completed course explicitly warns that its lines become unplanned.

### Build or edit a course

- Start a separate draft without mutating saved courses or membership. Focus on unassigned lines; other assigned lines remain unavailable.
- For the first line, explicitly choose the starting endpoint/traversal. Show full stop names and direction arrows, not only number/color.
- After every addition, highlight eligible unassigned lines with an endpoint at or within the configured radius of the current end. Show gap distance and orient the chosen line from its connecting end.
- When both endpoints qualify, offer both orientations. For loops, offer both traversals without duplicating the line identity.
- The top strip contains the start stop followed by ordered cards with bus number, end stop, and path distance; display connector lengths between cards.
- Keep total and save reachable even when the sequence is long: desktop can place them after the final card, while mobile uses a sticky summary/save control alongside the scrollable strip.
- Provide undo, clear/cancel, naming, and configurable radius. If no next line qualifies, explain the empty state and allow saving or changing radius; do not invent a connection.
- Saving requires at least one line, valid geometry, and exclusive membership. Cancelling/back-navigation with changes offers discard or preserve draft.
- Editing releases only the current course's own lines for the draft. Other courses remain unavailable. Remove prefixes/suffixes, including multiple lines, but not arbitrary middle lines.
- Reverse flips order and each traversal; recompute all endpoints and connectors.
- Split only at a boundary between two lines of a course with at least two lines. Preview/name both nonempty results; remove the former inter-course connector from their totals and save atomically. Both results are incomplete.
- Removing every line cannot create an empty course; offer explicit deletion instead. Persist one recoverable draft locally so phone interruptions do not lose work.

## Architecture and data contracts

### Static frontend

- Suggested structure: `src/domain/` for course rules/distance/status, `src/data/` for validation and IndexedDB, `src/features/map/`, `src/features/courses/`, `src/features/settings/`, and shared UI.
- Keep domain operations pure and independent of React/Leaflet. Use ordinary React state/context and focused hooks; avoid adding a global state framework without need.
- Use Leaflet with OSM raster tiles initially. Tile URL/attribution are build configuration so hosting can switch providers without redesign. Retain standard browser caching and valid referrers; never prefetch tiles or bundle them in backups.
- Route geometry, course state, and draft state can be cached locally. This does not promise offline basemap availability or a full installable/offline PWA.

### Published transit data

- `public/data/manifest.json`: schema version, dataset version/content hash, fetch timestamp, effective reference service dates, available line keys, and immutable dataset file location.
- Versioned normalized JSON/GeoJSON: stable app line key, public line number, source identities, selected variant, available variants, ordered stops, actual endpoint coordinates, geometry, precise length in metres, bounds, loop indication, and path hash.
- GeoJSON coordinates use longitude/latitude; Leaflet conversion is centralized and tested.
- A curated inclusion configuration maps scoped city lines to operator/local service identity. A line number alone is not a safe key within the regional feed; raw GTFS IDs alone are not assumed stable across feed releases.
- Deduplicate equivalent shape/stop patterns. Preserve enough variant information for a compact manual selector showing termini and length, not all timetable trips.
- Compute lengths from full-resolution geometry before display simplification. Preserve connection endpoint fidelity and retain full-resolution paths for course snapshots/future GPX.

### Local persistence

- IndexedDB stores the active normalized dataset, courses, route-variant overrides, settings, one draft, and a pre-import recovery backup. Tiny UI preferences may use localStorage only if useful.
- A saved course has a UUID, name, status, creation/update/completion metadata, ordered directed line entries, and the applied dataset version. Each entry carries a self-contained route snapshot sufficient to survive feed removal, completion, export, and import.
- Derive totals, connectors, start/end, and route statuses from validated entries; do not trust redundant imported totals.
- Variant overrides are local, exported preferences. Applying an override to an incomplete course recalculates it with a preview; completed snapshots do not change.
- Storage writes, migrations, merge commits, and data reconciliations use transactions. Surface quota, corruption, and write errors; do not show "saved" until persistence succeeds.
- Multiple tabs must not silently overwrite each other: notify/reload local changes and recheck membership in the write transaction.

### Monthly ingestion and publication

- Suggested files: `scripts/build-transit-data.ts`, `scripts/transit/`, `config/city-lines.json`, and `.github/workflows/refresh-transit-data.yml`.
- Use a streaming/bounded-memory GTFS reader. Download with a secret Trafiklab key in the CI job; never put credentials into Vite variables, static files, logs, or exports. SQLite is optional ingestion tooling only if the real feed warrants it.
- Resolve actual active weekdays using feed-specific calendar rules. Group trips by termini/ordered stops/shape. Choose a recurring full-length weekday pattern, not the single longest outlier. Make ranking deterministic and explain it in generated metadata; flag ambiguous/branch selections for review.
- Inspect bus extended route types and geographic/service identity before inclusion. Surface in-scope lines without usable shapes in a data-quality report; never fabricate road-following paths by joining stops.
- Verify loop coverage and geometry/stop alignment. Flag gaps, invalid coordinates, implausible lengths, unexpected line removals, and major shifts. Publication rejects malformed/incomplete data; deliberate removals need an explicit review/override mechanism.
- Publish validated dataset and manifest atomically with the static deployment. Run monthly plus manual dispatch. Keep the previous deployment intact if ingestion/validation fails.
- GitHub scheduled jobs are best-effort. The app checks the lightweight manifest at startup and offers manual refresh, displays stale data, and continues using a valid cache if fetching fails.
- Retain dataset files referenced by a deployed manifest; local course snapshots avoid needing an indefinite server archive.
- Deployment authentication is a separate least-privilege secret. Do not provision Azure resources until deployment is explicitly requested.

## Updates and import/export

### Dataset reconciliation

- Stage and validate a new dataset before switching active data. Reconcile incomplete course entries by stable line key and retained variant intent; if the selected variant disappeared, apply the main path and visibly report the change.
- Update incomplete snapshots and calculated distances automatically in one transaction; show a change summary for affected courses, including endpoint/gap changes.
- Completed snapshots remain unchanged, while current-network browsing uses current main paths. Selecting a completed course renders its historical paths.
- Preserve unavailable entries with warnings. Missing lines cannot become new-course suggestions.
- Keep a changed draft recoverable and require a refresh preview before saving it against a newer dataset.

### Backup replacement and merge

- Versioned JSON contains settings, overrides, courses and their self-contained snapshots; excludes API keys and map tiles. Validate schema, coordinates, statuses, references, uniqueness, and bounded file size before any writes.
- Export must round-trip all planning/progress data without relying on the source device's cache.
- Import preview offers replace or merge and a clear summary. Keep a pre-import recovery backup; provide a way to download it before destructive replacement.
- UUIDs identify the same course. Identical copies deduplicate; changed same-ID courses require explicit local/imported choice. Do not silently select by timestamp.
- Different course IDs claiming the same line form an ownership conflict. Resolve by keeping one whole conflicting course, rather than silently removing its interior routes. Re-evaluate conflicts after every choice and validate the final collection.
- Resolve settings/variant overrides explicitly when differing. Completed imported snapshots remain historical; incomplete imported courses are reconciled to the receiving device's active dataset with a preview.
- Commit the entire accepted result atomically, or leave current state unchanged. Report failures and unsupported newer formats plainly.

## Ordered implementation work

1. **Verify transit-data feasibility.** Obtain a free Trafiklab key, inspect a real `vt` feed, verify redistribution terms, city-line coverage, shapes, calendars, variants, loops, and identity mapping. Produce a small real-data fixture and actionable quality report. If adequate shapes are unavailable, stop and agree on an alternative source/manual geometry workflow before implementing a misleading map.
2. **Scaffold frontend and interaction shell.** Initialize React/TypeScript/Vite, styling tokens, Leaflet, Vitest, and Playwright. Build responsive browse/planning shells with a clearly marked fixture. Review the phone and desktop interaction before deep integration.
3. **Build ingestion and versioned dataset.** Implement curated scope, representative variant selection, geometry validation, length computation, manifest publishing, and monthly/manual generation.
4. **Implement domain rules and persistence.** Add typed schemas, derived status/distance, eligibility, drafts, editing/splitting/reversal, snapshots, transactions, and update reconciliation.
5. **Implement browse-map behavior.** Integrate real data, overlapping-path chooser, details, search, filters, stateful styling, endpoint markers, and provider/loading/error states.
6. **Implement course workflows.** Wire mobile/desktop overview, endpoint-directed builder, candidate suggestions, save/cancel/recovery, editing, split/remove/reverse, completion, unlock, and delete.
7. **Implement settings and backups.** Wire radius, variants, freshness/update summaries, validated replacement/merge import, conflict preview/resolution, recovery backup, and export.
8. **Validate and prepare static deployment.** Finish targeted domain/integration/E2E coverage, production build, responsive/accessibility checks, static-host configuration, CI, and directly related README instructions. Document account/key setup, data maintenance, backup limitations, and approximate-path warnings. Configure Azure deployment only when requested.
9. **Stretch: GPX.** Export oriented full-resolution course snapshots with explicitly approximate straight connectors, valid GPX 1.1/XML escaping, and a pedestrian-safety warning. No walking-route engine implied.

Dependencies: 2 and 3 require 1; 4 requires 2 and 3; 5 requires 2, 3, and 4; 6 requires 4 and 5; 7 requires 4 and 6; 8 requires 3, 5, 6, and 7; 9 follows 8.

## Acceptance and verification

- A production build runs as static files without API secrets, a database service, or any application backend. Static-host navigation/assets work under the configured deployment base.
- Use real in-scope data, not mocked example distances, for the final route catalogue. An unavailable line is reported instead of rendered from invented geometry.
- Test endpoint eligibility at 499 m, exactly 500 m, and 501 m with a 500 m radius; either endpoint qualifies, orientation is correct, and assigned/duplicate lines never qualify.
- Test a 4,500 m route plus a 5,000 m route plus a 200 m gap: total 9,700 m, parenthesized summed connectors shown. At exactly 100 m no parentheses; above 100 m parentheses appear regardless of rounded label.
- Use controlled full-resolution geometries to verify distance and endpoint preservation. Test GeoJSON/Leaflet coordinate conversion and forward/reverse loops.
- Save, reload, edit, reverse, split, truncate, complete, unlock, and delete courses; verify membership/status invariants and connector totals after every operation.
- Verify overlapping real map paths are independently selectable, line search is equivalent to map selection, and filter intersections match the labelled semantics.
- Verify monthly updates change incomplete paths/totals, never change completed snapshots, retain discontinued paths, expose broken connections, and do not destroy drafts.
- Export/import round-trip, replace, deduplication, same-ID conflict, cross-course ownership conflict, differing overrides, malformed files, unsupported versions, aborted choices, quota failures, and transaction rollback all receive focused tests.
- Mobile E2E at 360 px width and desktop at 1280 px: no page-level horizontal overflow; sequence scrolling is contained; endpoint choice, total/save, map attribution, dialogs, and bottom-sheet controls remain reachable.
- Target at least 44 px touch controls, keyboard-accessible list/dialog alternatives, visible focus, adequate text contrast, and no color-only statuses.
- Exercise offline/transient data-fetch and tile failures separately: cached progress remains usable; unavailable basemap is explicitly indicated; no forbidden tile prefetch occurs.
- Initial delivery runs typecheck, relevant unit/integration tests, a production build, and key Playwright journeys. Use a physical phone/browser walkthrough for sheet/gesture behavior before declaring the phone UX finished.

## Out of scope for the first release

Live bus positions/timetables, pedestrian-safe routing, live collaboration, user accounts, individual friend completion, route membership in multiple courses, arbitrary intermediate-stop starts, offline tile packs, and GPX export.
