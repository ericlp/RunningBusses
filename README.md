# Do you wanna chase buses?

A static, phone-first site for planning runs along public Västtrafik bus routes and Gothenburg tram routes, with Gothenburg city buses shown by default. Chain routes into courses, mark them completed, and move your progress between devices with a link or a backup file. Live at https://ericlp.github.io/RunningBusses/ (sv / en / fr, follows the browser language).

The bus lines show where the bus drives. They are a reference only: roads, tunnels and busways may not be runnable.

## Develop

Node is managed with [mise](https://mise.jdx.dev): `mise install`, then `mise exec -- npm ci`.

| Command | What |
| --- | --- |
| `npm run dev` | dev server |
| `npm test` | unit tests |
| `npm run build` | typecheck and production build |
| `npm run e2e` | browser journeys at phone and desktop widths (needs `npm run build` and `npx playwright install chromium`) |
| `npm run data` | rebuild `public/data` from the Trafiklab feed |
| `npm run data:validate -- --previous=old-lines.json` | check a rebuilt dataset |

Copilot CLI loads this repository's Playwright MCP configuration from `.github/mcp.json`. After installing dependencies, run `npx playwright install chromium`. The launcher resolves the browser from the project's Playwright installation, without machine-specific paths. MCP browsers run headless with isolated storage, and output is saved under `.cache/playwright-mcp/`.

## Transit data

Source: Trafiklab *GTFS Regional Static* (Västtrafik). Put your key in `.env` (`TRAFIKLAB_API_KEY`, see `.env.example`; never commit it). The GitHub Action `Refresh transit data` runs monthly with the repository secret of the same name, validates the result and redeploys only when the lines changed. A manual run can accept removed lines.

The dataset includes public, timetabled Västtrafik buses across the feed's full service period: regional, night, weekend-only, seasonal, replacement and scheduled call-ordered services. Pupil-restricted school transport is excluded; public lines that run only on school days remain included. Existing Gothenburg categories and the default city-bus view are unchanged. Additional buses appear under **Other Västtrafik buses**; select it alongside the existing bus categories to see all buses. Trams remain separate.

The builder checks public-service classification against Västtrafik's [official line registry](https://www.vasttrafik.se/api/timetables/lines). Registry data is cached with the feed in `.cache/vt/`; `npm run data -- --download` refreshes both. Unclassified routes must be reviewed rather than silently included, except explicitly described replacement buses. Mixed public/restricted registry versions or a new nonempty `frequencies.txt` require a timetable audit before publication.

Existing route keys stay intact. Added lines use `vt.<route_id>` keys (plus `r` for a separate return route), so unrelated lines with the same displayed number do not merge. `config/route-aliases.json` contains verified normal/call-ordered pairings, sourced from matching numbers and descriptions in the official registry; aliases are rechecked on each build. Unverified pairings stay separate.

One representative path is published per line/direction, not every timetable variant. Existing categories prefer the reference Wednesday; other buses and Wednesday-absent lines use patterns weighted by operating days throughout the feed. `npm run data -- --date=YYYYMMDD` overrides the preferred reference day. An eligible timetabled line without usable geometry stops the build before the dataset is written. Regional routes may exceed 60 km; they retain geometry/length checks with a 200 km upper sanity limit.

Publication includes a schema-2 `data/catalog-manifest.json`, a content-addressed complete lightweight catalogue, and one content-addressed geometry file per category in `data/categories/`. SHA-256 descriptors include route counts and byte sizes; the stable release hash excludes generation timestamps. `lines.json` and the schema-1 `manifest.json` remain for existing clients and aggregate validation. Validation checks every split asset and exact aggregate reconstruction, including optional fields and property order. Builds remove only obsolete owned content-addressed files.

## Data on your device

Courses live in the browser (IndexedDB); filters and sort order are remembered in localStorage. Use ⚙ → Säkerhetskopia to share a link (courses only) or export a file, and open the link or import the file with merge or replace on another device. A copy from before the last import can be downloaded.

The app loads the complete lightweight catalogue and only the geometry needed by your filters, route link or shared courses. New visits load city buses only. Search, route counts and progress cover the full catalogue even before geometry is downloaded. Planning waits for all selected categories rather than suggesting from an incomplete pool. Open, unpinned courses fetch their current categories after the initial view; saved historical snapshots remain usable without those downloads.

Used categories are automatically saved in IndexedDB. Settings lists availability and offers **Download all categories** to install one complete offline release. Downloads can be retried; a failed or interrupted refresh preserves the previous installation. New online on-demand data does not automatically refresh a complete offline installation. Offline fallback uses one coherent saved release and identifies older data. Browser storage can be evicted, and downloading route data does not prefetch map tiles. Storage failures are reported even if fetched routes remain usable in memory.

The loader, not the service worker, caches split route data. Legacy cached aggregates are read only for an offline migration/fallback; courses and drafts are not migrated. Backups and share links retain their schema-1 formats.

For reproducible loading measurements, build and start `npx vite preview --port 4173 --strictPort`, then run `node e2e/category-performance.mjs`. It records request sets, gzip/transferred bytes, JSON parsing, IndexedDB reads and retained JS heap under controlled Chromium network/CPU throttling. The monolith comparison measures the old loader's data-ready path, not equivalent UI rendering; this is emulation, not physical-phone evidence. Results and limitations are recorded in plan 058.

## Links

The address shows the current view: `#line=<key>` selects a line and zooms to it, `#mode=plan` opens the course list. Copy the address to share or bookmark it.

## Plans

Design and decisions are in [`plans/`](plans/PLAN.md), with one small plan per change.
