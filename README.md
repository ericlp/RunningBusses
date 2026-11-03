# Do you wanna chase buses?

A static, phone-first site for planning runs along public Västtrafik bus routes and Gothenburg tram routes, with Västtrafik ferries available as a separate category and Gothenburg city buses shown by default. Chain routes into courses, mark them completed, and move your progress between devices with a link or a backup file. Live at https://ericlp.github.io/RunningBusses/ (sv / en / fr, follows the browser language).

The lines show public transport routes. They are a reference only: roads, tunnels and busways may not be runnable. Ferry paths cross water and cannot be run.

## Develop

Node is managed with [mise](https://mise.jdx.dev): `mise install`, then `mise exec -- npm ci`.
Local development and both CI workflows read the same exact Node version from `mise.toml`.
Install the lockfile's Chromium with `mise exec -- npx playwright install --with-deps chromium`,
then run `mise exec -- npm run check` for the same validation pipeline as deployment.
Linux browser system dependencies may require administrator access. OS and hardware
still differ between machines; test deadlines must not depend on their speed or clock alignment.

### Development container

With Docker and VS Code's **Dev Containers** extension installed, open this
repository and choose **Dev Containers: Reopen in Container**. Setup installs
the exact Node version from `mise.toml`, locked npm dependencies, Chromium and
its Linux dependencies. Run `npm run check` in the container terminal, or
`npm run dev -- --host 0.0.0.0` and open forwarded port 5173. Port 4173 is also
forwarded, but must remain free when starting browser journeys.

The container includes GitHub CLI, osmium and Docker-in-Docker for future
local runnable-GPX preparation. It uses a dedicated nested Docker daemon,
**not your host Docker socket**, but requires a privileged container and should
only be opened for trusted code. Routing images, OSM downloads and route
preparation are not started automatically. Secrets such as `.env` remain local
workspace files; they are not copied into the image.

Container `node_modules` lives in a separate named volume, so native packages
do not interfere with host installs. The nested Docker feature also retains its
own daemon volumes across rebuilds; deleting the container alone does not
remove these caches.

| Command | What |
| --- | --- |
| `npm run dev` | dev server |
| `npm run check` | deployment checks: typecheck, unit tests, dataset validation, build and all browser journeys with exactly two workers |
| `npm test` | unit tests, including browser-runner scheduling and published payload budgets |
| `npm run build` | typecheck and production build |
| `npm run e2e` | browser journeys at phone and desktop widths (needs `npm run build` and `npx playwright install chromium`) |
| `npm run data` | rebuild `public/data` from the Trafiklab feed |
| `npm run data:elevation` | build optional Copernicus GLO-30 profiles after `npm run data` |
| `npm run data:validate -- --previous=old-lines.json` | check a rebuilt dataset |

Browser journeys run with **two isolated workers** by default and print
per-journey durations. Use `npm run e2e -- --workers=1` for a serial run, or
`npm run e2e -- courses backup` for selected journeys. `--workers=1..4` (or
`E2E_WORKERS`) bounds concurrency. The runner starts its own preview on port
4173 on IPv4 loopback, waits for readiness, rejects an occupied port and cleans up its processes.
Build first after changing application code. Ordinary UI journeys use small
deterministic data and intercepted tiles; publication, offline and tile-cache
journeys retain their specialized fixtures. Timer-specific journeys advance
the browser clock rather than waiting in real time.

Copilot CLI loads this repository's Playwright MCP configuration from `.github/mcp.json`. After installing dependencies, run `npx playwright install chromium`. The launcher resolves the browser from the project's Playwright installation, without machine-specific paths. MCP browsers run headless with isolated storage, and output is saved under `.cache/playwright-mcp/`.

## Transit data

Source: Trafiklab *GTFS Regional Static* (Västtrafik). Put your key in `.env` (`TRAFIKLAB_API_KEY`, see `.env.example`; never commit it). The GitHub Action `Refresh transit data` runs monthly with the repository secret of the same name, validates the result and redeploys only when the lines changed. A manual run can accept removed lines.

The dataset includes public, timetabled Västtrafik buses across the feed's full service period: regional, night, weekend-only, seasonal, replacement and scheduled call-ordered services. Pupil-restricted school transport is excluded; public lines that run only on school days remain included. Existing Gothenburg categories and the default city-bus view are unchanged. Additional buses appear under **Other Västtrafik buses**; select it alongside the existing bus categories to see all buses. Trams remain separate.

**Ferry** / **Färja** includes public timetabled Västtrafik ferries throughout the same feed period, including archipelago and regional services. Their actual GTFS water paths and stops are retained, not replaced with running routes. Ferries can be selected in filters and progress settings; their geometry loads only when needed. The current feed includes 15 ferry lines represented by 17 routes, with separate return paths where applicable.

The builder checks public-service classification against Västtrafik's [official line registry](https://www.vasttrafik.se/api/timetables/lines). Registry data is cached with the feed in `.cache/vt/`; `npm run data -- --download` refreshes both. Unclassified routes must be reviewed rather than silently included, except explicitly described replacement buses. Mixed public/restricted registry versions or a new nonempty `frequencies.txt` require a timetable audit before publication.

Existing route keys stay intact. Added lines use `vt.<route_id>` keys (plus `r` for a separate return route), so unrelated lines with the same displayed number do not merge. `config/route-aliases.json` contains verified normal/call-ordered pairings, sourced from matching numbers and descriptions in the official registry; aliases are rechecked on each build. Unverified pairings stay separate.

One representative path is published per line/direction, not every timetable variant. Existing categories prefer the reference Wednesday; other buses, ferries and Wednesday-absent lines use patterns weighted by operating days throughout the feed. `npm run data -- --date=YYYYMMDD` overrides the preferred reference day. An eligible timetabled line without usable geometry stops the build before the dataset is written. Regional routes may exceed 60 km; they retain geometry/length checks with a 200 km upper sanity limit. Ferries allow short crossings down to 50 m (line 362 is approximately 151 m), while other categories retain the 300 m minimum and all geometry checks.

Publication includes a schema-2 `data/catalog-manifest.json`, a content-addressed complete lightweight catalogue, and one content-addressed geometry file per category in `data/categories/`. SHA-256 descriptors include route counts and byte sizes; the stable release hash excludes generation timestamps. `lines.json` and the schema-1 `manifest.json` remain for existing clients and aggregate validation. Validation checks every split asset and exact aggregate reconstruction, including optional fields and property order. Builds remove only obsolete owned content-addressed files.

Elevation profiles use the public Copernicus DEM GLO-30 Public surface model; they are approximate and may include building or vegetation heights. After rebuilding transit data, `npm run data:elevation` samples the public cloud-optimized GeoTIFFs at build time and writes optional, content-addressed assets under `data/extras/elevation/`. It needs no credentials. The app loads profiles only when requested, validates them against the exact route snapshot, and keeps missing spans unknown. Because a route is run along the road, the app smooths each profile (a short distance median, then a Gaussian-weighted local linear fit) to suppress building and tree spikes before computing climb; the published samples stay unsmoothed. The source and Copernicus DEM licence are shown with each profile; these heights are not mixed with other elevation sources.

## Data on your device

Courses live in the browser (IndexedDB); filters and sort order are remembered in localStorage. Use ⚙ → Säkerhetskopia to share a link (courses only) or export a file, and open the link or import the file with merge or replace on another device. A copy from before the last import can be downloaded.

Multiple tabs do not merge edits automatically. Saving checks a browser-local
revision atomically, including the shared draft, people and completion history.
A stale tab refuses writes and keeps its draft visible, with a persistent warning.
Close other tabs, then use **Reload saved data** to load the latest saved state;
the confirmation warns that unsaved edits in this tab will be lost. Tabs running
an older app version must be reloaded to participate in this protection.

The app loads the complete lightweight catalogue and only the geometry needed by your filters, route link or shared courses. New visits load city buses only. Search, route counts and progress cover the full catalogue even before geometry is downloaded. Planning waits for all selected categories rather than suggesting from an incomplete pool. Open, unpinned courses fetch their current categories after the initial view; saved historical snapshots remain usable without those downloads.

Used categories are automatically saved in IndexedDB. Settings lists availability and offers **Download all categories** to install one complete offline release. Downloads can be retried; a failed or interrupted refresh preserves the previous installation. New online on-demand data does not automatically refresh a complete offline installation. Offline fallback uses one coherent saved release and identifies older data. Browser storage can be evicted, and downloading route data does not prefetch map tiles. Storage failures are reported even if fetched routes remain usable in memory.

Offline releases saved before the ferry category remain valid with their original hashes and six category payloads. Ferries become available after loading a newer release; older offline releases do not invent ferry geometry or silently discard the previous installation.

The loader, not the service worker, caches split route data. Legacy cached aggregates are read only for an offline migration/fallback; courses and drafts are not migrated. Backups and share links retain their schema-1 formats.

For reproducible loading measurements, build and start `npx vite preview --port 4173 --strictPort`, then run `node e2e/category-performance.mjs`. It records request sets, gzip/transferred bytes, JSON parsing, IndexedDB reads and retained JS heap under controlled Chromium network/CPU throttling. The monolith comparison measures the old loader's data-ready path, not equivalent UI rendering; this is emulation, not physical-phone evidence. Results and limitations are recorded in plan 058.

## Links

The address shows the current view: `#line=<key>` selects a line and zooms to it, `#mode=plan` opens the course list. Copy the address to share or bookmark it.

## Course exports

Course details keep **Export GPX** available and show **Share GPX** beside it when the browser accepts the actual file. Choose Garmin Connect if offered, or open the downloaded file with Connect; course type, import and watch sync are user-controlled Garmin steps. Browser sharing does not confirm Garmin import. Exports retain snapshot directions and segment breaks, not verified pedestrian routes.

**Garmin limitation:** Connect may import only the first line of a multi-line course; this occurred in our iPhone Chrome / Files-to-Connect check. Inspect the whole imported route before using it. Importing each line as a separate GPX/course is a community-reported workaround, not verified on our test device; a GPX editor can split a copy of the export without changing your saved course. We do not merge segments, because that would imply unverified connections across gaps. There is no verified whole-course fix that preserves those breaks. [Plan 063](plans/063-gpx-to-watch.md) is closed with this limitation; [064](plans/064-runnable-gpx.md) separately plans continuous export with validated pedestrian connectors.

**Share image**, in course details or a line's course actions, prepares a 1080 × 1350 PNG in the app theme, including completed runners' names. Adjust the visible map preview first; capture uses only its loaded, visible tiles and embeds OSM attribution. Missing/unreadable tiles produce a labelled route-only image, including offline. Share or download the prepared PNG; changing the preview invalidates the old file.

## Plans

Design and decisions are in [`plans/`](plans/PLAN.md), with one small plan per change.
