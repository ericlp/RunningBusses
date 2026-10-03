# RunningBusses – master plan

**Status:** Draft. This file is edited freely until building starts. After that it is frozen, and each later change gets its own small plan, `plans/NNN-title.md`, listed in [Change plans](#change-plans).

The original request is in `../initial-pitch.md`.

## Goal

A Swedish, phone-first website for planning runs along Gothenburg city-bus lines (Stadsbuss). It shows each line's route on a map, chains lines whose ends are close into **courses**, and tracks which courses the group has completed. It is a static site with no backend or accounts. Courses are stored in the browser and can be moved between devices with a JSON file.

Look: Strava-style (clean, map-first, bold numbers, activity-style cards, one strong accent) in the Västtrafik colour palette. Light theme, plus a dark theme that follows the device setting.

## Current state

- The repository holds `initial-pitch.md` and this plan. There is no code, package manifest or tooling yet.
- The source of line data is Trafiklab's **GTFS Regional** feed for Västtrafik (`vt`). Its documentation says that this feed, unlike GTFS Sverige 2, includes `shapes.txt` (route geometry). It is updated daily and needs an API key; the owner already has one.
- The Bronze key allows 50 downloads per month, which is plenty for a monthly refresh.
- Not yet verified: that Västtrafik's feed has usable shapes for every city line, that line identities are stable, and the redistribution terms. A catalogue lists the feed as CC0, but this was only seen on a third-party site, so Phase 0 confirms it on Trafiklab's own terms.
- Map tiles come from OpenStreetMap's public tile server. This is fine for low-volume interactive use if we show attribution, keep browser caching and never prefetch. There is no guaranteed availability.

Sources: Scope list <https://sv.wikipedia.org/wiki/Busstrafik_i_G%C3%B6teborg#Stadsbusslinjer>, GTFS Regional <https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/>, GTFS overview <https://www.trafiklab.se/api/gtfs-datasets/overview/>, dataset catalogue <https://trafficdata.se/dataset/gtfs-regional>, OSM tile policy <https://operations.osmfoundation.org/policies/tiles/>.

## Decisions

### Scope and data
- In scope: every line categorised as **Stadsbuss** (22–99, Gothenburg city lines). This includes one-way lines and call-ordered lines (e.g. "måste förbeställas"), because the group runs the bus's intended route.
- One main route per line number. It can be run in either direction. **Exception (see plan 001):** when a line's two directions differ clearly in geometry, each direction is its own route (`62` and `62 retur`) and both count separately.
- Every line has a `category` (`stadsbuss` by default; `stombuss` and others may be in the data) and tags for special circumstances (`call-ordered`, `loop`, `one-way`, `retur`). The map filters on category, defaulting to `stadsbuss`, and can filter on tags.
- Phase 0 found 49 Gothenburg city lines (27–99) with shapes for all of them; see plan 001. The city lines are identified by the `route_id` pattern, not the line number.
- The main route is picked automatically as a representative full-length weekday pattern, with a manual override in settings.
- Loop lines (same start and end, e.g. "Heden – Gårdsten – Heden") are ordinary lines. They are no special case, and they are useful for adding distance without leaving a hub.
- **Manual list.** A line that is in scope but has no geometry we can fetch goes in a separate manual list.
  - Its start and end come from GTFS stop names and coordinates when available; otherwise only names are entered by hand.
  - Its distance is entered by hand. It may be edited at any time, except on a completed course.
  - It can only be a later leg of a course, never the first. It can follow any leg regardless of distance.
  - After a manual leg, suggest routes near its end when it has coordinates. With no coordinates, suggest nothing and allow free choice.
  - A manual leg with no distance entered counts as 0 and shows the course total as "minst" (at least).
  - It has the same derived statuses as other routes and the same one-course-per-line rule.
- Lines are never given invented geometry (for example, by joining stops).

### Courses and status
- Each line belongs to at most one course.
- A course is `NotCompleted` or `Completed`. A route's status (`NotPlanned`, `NotCompleted`, `Completed`) is derived from its course and never stored on its own.
- Completed courses cannot be edited. Marking one incomplete unlocks it, with a confirmation.
- **Unlocking keeps the course's historical data.** The unlocked course is pinned: it does not follow monthly updates, and an "Uppdatera till aktuell data" button (with a preview of changes) refreshes it.
- Other incomplete courses automatically adopt monthly updates, and completed courses keep their snapshot.
- A saved connection that is longer than the radius (because of an update or a radius change) stays valid with a warning. The radius only limits suggestions for new legs.
- A line that disappears from new data keeps its last route inside existing courses, with a warning, and cannot be added to new courses.
- Gaps between legs are measured as straight lines and added to the course total. Their sum is shown in parentheses next to the total only if it is more than 100 m, e.g. `9,7 km (200 m)`. Every gap is listed in the course details.
- Suggestion radius: 500 m by default, adjustable. Either end of a line may match.
- A course can be named, deleted, reversed (incomplete only), have its last added leg undone while drafting, have legs removed from either end, and be split between two legs.

### Sharing and hosting
- One shared progress record per browser. Devices are synced by exporting and importing a JSON backup. Import supports replace and merge, with a preview and an explicit choice on every conflict (no silent overwrite and no last-write-wins).
- Hosting: **GitHub Pages**, on a public repository. A scheduled GitHub Action downloads the feed with the Trafiklab key (a repository secret), builds the dataset and redeploys. The key is never in the site, the logs or the exports.
- The app's base path is the repository name, so asset paths and routing must work under it.
- Stack: React, TypeScript, Vite, Leaflet, IndexedDB (browser storage, no server database).

### Later and out of scope
- Stretch: GPX export of a course; archiving a whole set of lines when Västtrafik renumbers them (the user may want to "cry a bit" over the old numbers). No renumbering is expected soon.
- Out of scope: live bus positions or timetables, pedestrian routing, accounts, per-person completion, live sync between devices, offline map tiles.

## User experience

### Map (browse)
- Opens on the whole network, with all routes in a quiet style.
- Tapping a route highlights it above the rest and opens a popover (a bottom card on phones) with number, name, distance, start and end stop, status and course. Where routes overlap, tapping offers a short list of the lines under the finger. A searchable line list gives the same access.
- Filters: all, not planned, not completed (planned + unplanned), completed, and distance shorter or longer than a given value. Status is shown by label and line style as well as colour.
- Distances are path lengths, not travel times. A short notice says the bus route is a reference and may not be safe to run (roads, tunnels, bridges).
- The manual list is reachable from the same list view, marked as lacking a map path.

### Plan mode
- Phone: the course list sits in a bottom sheet over a full-screen map. Desktop: the same list is a left sidebar.
- "Skapa bana" is first. Each course row has name, the bus sequence, status, total distance (with the gap note), first start and last end stop, and an edit button.
- Selecting a course highlights all its routes on the map, in order, with dashed connectors for the gaps.

### Creating and editing a course
- The map focuses on routes not in a course. Tap a route and choose which end to start from.
- After each leg, the routes with an end within the radius of the current end are highlighted. Choose one; both orientations are offered when both ends qualify. Each shows its gap in metres.
- A strip at the top shows the start station, then cards (bus number, end station, distance) in order, with the total and a save button after the last card. On phones the strip scrolls horizontally and the total and save stay visible.
- Undo, cancel and rename are available. If nothing qualifies, say so and offer to widen the radius, add a manual-list route, or save.
- Editing opens the same view. The ends can be shortened, the course can be split between two legs (both halves are named and become incomplete), and the course can be reversed.
- One unsaved draft is kept in the browser so a closed tab doesn't lose work.

## Technical outline

- `src/domain/`: pure functions for distance, gaps, eligibility, status, split, reverse and truncate. No React or Leaflet in here, and these get the unit tests.
- `src/data/`: loading the published dataset, IndexedDB storage, backup import/export.
- `src/features/`: map, courses, manual routes, settings.
- `scripts/` and `.github/workflows/`: the data build and the monthly job.
- Dataset: `data/manifest.json` plus a versioned file per line set. Each line has a stable key, number, name, ordered stops, GeoJSON geometry (lon/lat; Leaflet conversion in one place), length in metres from the full geometry, and the chosen and alternative patterns. A line number alone is not a safe key; the feed's own IDs may change between releases.
- A course stores a copy (snapshot) of each leg's route, so it survives removed lines, export and import. Totals are always recalculated, never trusted from a file.
- Storage writes are atomic where they affect several records (split, import, update). "Saved" is only shown after the write succeeds.

## Phases

Each phase ends with something usable. A phase is built only after the previous one has been tried.

0. **Data check (spike).** Using the Trafiklab key locally, download the feed and check:
   - which lines make up the Stadsbuss scope, including one-way and call-ordered lines;
   - which have shapes, which don't (these become the manual list), and how the weekday main pattern is chosen;
   - identity stability, loops, and that the geometry matches the stops;
   - the redistribution terms on Trafiklab's own pages.

   Output: a short report, the line list, a small real fixture and the script. If most lines have no shapes, stop and agree on a different plan.
1. **Browse map.** Project setup, theme (Västtrafik palette, light and dark, Strava-style), map with real data, tap-to-select popover, line search and filters. Deploy to GitHub Pages as soon as it works. The first dataset is committed by hand from Phase 0.
2. **Courses.** Create, save, list, highlight, mark completed, delete, derived statuses. The manual list and its legs, and gap totals.
3. **Editing.** Edit view, remove from either end, split, reverse, rename, undo, unlock.
4. **Backup (done, see plan 005).** Export, then replace-import, then merge with conflict choices. A copy of the previous state is kept before an import.
5. **Monthly refresh (done, see plan 006).** The scheduled job, the update rules above (pinned unlocked courses, missing lines, warnings), a "data from" date in settings.
6. **Polish (done except the phone walkthrough, see plan 007).** Playwright checks on a phone and a desktop width for the main journeys, touch targets of at least 44 px, keyboard use, contrast, and a walkthrough on a real phone.
7. **Stretch.** GPX export; archiving renumbered line sets.
8. **Language (done).** Browser-preferred language with Swedish, English and French, see plan 003. Preferably done right after Phase 3, before more strings pile up.

Deliberately postponed: multi-tab write protection and anything else not needed to use the app yourselves. Add it when it proves necessary.

## Tests

- Unit tests (Vitest) for the domain: radius checks at 499, 500 and 501 m; 4,5 km + 5 km + 200 m gap = 9,7 km (200 m); exactly 100 m shows no parentheses; loops, reversal, split and truncate; status derivation; manual legs with and without distance.
- Backup round trip, conflict cases and invalid files are tested when Phase 4 is built.
- Browser checks: overlapping lines can be picked separately; mobile layout has no sideways scroll at 360 px.
- Typecheck and production build in CI.

## Change plans

Phase 0 has been done and building starts with Phase 1; this file is now frozen except for corrections. Each change gets `plans/NNN-title.md`, linked here.

- [001 – Phase 0 data findings](001-phase0-data-findings.md): feed structure, the 49 lines, direction-specific routes, categories and tags.
- [002 – Phase 2: courses](002-phase2-courses.md): what was built, manual legs, draft handling.
- [004 – Phase 3: editing](004-phase3-editing.md): edit view, remove from ends, split, reverse, draft rules.
- [005 – Phase 4: backup](005-phase4-backup.md): export, replace/merge import with conflict choices, recovery copy.
- [006 – Phase 5: monthly refresh](006-phase5-monthly-refresh.md): scheduled job, validation, update rules.
- [007 – Phase 6: polish](007-phase6-polish.md): touch targets, contrast, e2e suite, README.
- [003 – Preferred language](003-preferred-language.md): done, browser language with Swedish, English and French.
