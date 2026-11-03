# 062 – Elevation profile

Status: implementation in progress. The pure profile model, validation, exact snapshot matching, course assembly, elevation summaries, on-demand sidecar loading and public Copernicus COG sampler are implemented. The user chose Copernicus GLO-30 Public because Geotorget access was unavailable. Sidecar UI and e2e remain pending.

Goal: an x/y chart of altitude against distance for a selected line and for a whole course, with total climb and descent, so the group can see how hilly a course is before choosing it.

## Decisions

- **Selected source:** Copernicus DEM GLO-30 Public (2021 release), a roughly 30 m digital surface model that includes buildings, infrastructure and vegetation. The public AWS COG is readable without credentials and permits byte-range requests. The user selected this instead of Lantmäteriet because Geotorget access was unavailable. It is lower-detail and is not a ground-only terrain model; charts and metadata must say so. Use only this source per sidecar. Do not silently fall back to, or mix heights with, Lantmäteriet's differently referenced terrain data.
- **Initial coverage:** Gothenburg categories first (`stadsbuss`, `stombuss`, `express`, `industri`, `tram`), not `other-bus` or `ferry`. Show profiles for both individual routes and courses; clearly identify uncovered legs.
- **Computed at build time, not in the browser.** Select the 1° COG tile by route sample coordinates and read only required 1024 × 1024 COG blocks via HTTP ranges; never download the whole tile. Cache opened tiles and a bounded number of decoded blocks by tile identity. Sample every 25 m plus the exact endpoint; round heights to 0.5 m, while retaining actual sample distances. Bound concurrency. Preserve missing/no-data samples as unknown.
- **Bridges and tunnels:** the surface model does not provide verified road-deck elevation. Do not infer bridge or tunnel heights from nearby cells. Leave questionable spans labelled as surface estimates or unknown; any future structure correction needs validated span association. Review suspicious grades, including the Göta älv crossings.
- **Publication:** add a separate `data/route-extras-manifest.json` and content-addressed `extras/elevation/<category>.<hash>.json` payloads, also reusable by 064. The sidecar identifies the transit release, source/build version and per-route geometry hashes. Do not modify the existing schema-2 transit release-hash calculation or category counts: current `parseManifest` reconstructs the hash and discards unknown fields. Load extras only on request, validate hashes/bytes/membership, persist manifest+payload availability atomically in owned `transit.extras.*` entries, and add their paths to the service-worker split-data bypass. Retain existing transit/offline installations unchanged when extras are absent.
- **Missing data:** show source/availability and retry for fetch/storage errors. Never count unknown ranges as flat or zero climb. Profiles are optional and cannot block ordinary planning.
- **Snapshots:** match both stable route key and SHA-256 of `JSON.stringify(coordinates)` against the leg's snapshot. Cached profiles may be used only for that exact geometry. Do not redraw historical courses from current geometry. If no matching profile is cached/published, state that the historical version is unavailable; no course/backup/share schema change.
- **Course profile:** join available legs in running direction, reversing elevation samples for reversed legs. Use the same cumulative distance convention as `courseStats`, including its straight-line inter-leg gaps and known manual distances; these ranges are blank, not connected by elevation lines. Unknown-length manual legs make the x axis and totals explicitly incomplete. Show covered distance and do not present partial climb as a complete-course total.
- **Numbers:** total climb and descent use a 2 m hysteresis so noise does not add up; also show the highest and lowest point and the steepest 200 m stretch.
- **Smoothing:** the surface model includes buildings and trees beside the road, which made raw profiles climb about 26 m/km on average across the 116 covered routes. Since the route is run along the road, each route profile is smoothed in the app before course assembly: a ±50 m distance median removes short spikes, then a Gaussian-weighted (σ 50 m, ±150 m) local linear fit removes 30 m raster steps. Both are symmetric, so a reversed leg gets the same profile; the linear fit keeps steady grades exact up to the run ends; smoothing never crosses missing data. Published raw samples are unchanged, so tuning needs no data rebuild. With smoothing the average climb is about 9 m/km. The panel states that the profile is smoothed.
- **Chart:** a plain SVG in the line card and course details, with no chart library. Touch or hover on the chart shows a marker at that point on the map (through `MapView`), and tapping the map route does not change the chart. Works in light and dark themes.

## Design sketch

- `src/domain/elevation.ts` (pure): decode, reverse, join legs, climb/descent with hysteresis, steepest stretch, distance→coordinate lookup for the map marker, chart scaling.
- `scripts/transit/elevation.ts`: raster sampling (GeoTIFF/COG reader as a dev dependency only), bridge/tunnel interpolation, encoding, validation.
- `src/data/routeExtras.ts`: shared optional sidecar loader for elevation and runnable assets, using the existing atomic IndexedDB helpers without hydrating every category.
- i18n: chart labels, climb/descent, "no profile" and attribution text in sv/en/fr.

## Confirmed choices and technical checks

- Confirmed: Gothenburg categories first; profiles for individual routes and courses; Copernicus GLO-30 Public selected when Geotorget access could not be obtained.
- Verified: official AWS registry and bucket documentation describe public GLO-30 COG access, DSM coverage, 2021 release and citation; the Gothenburg `N57_00_E011_00` tile accepts unauthenticated byte ranges. A real sample near Gothenburg returned 5 m. This single probe does not establish route-wide accuracy or completeness.
- Attribution: cite “Copernicus Digital Elevation Model (DEM) was accessed on [date] from https://registry.opendata.aws/copernicus-dem.” Include the Copernicus DEM licence and label heights as processed DSM estimates. The sample heights use the Copernicus vertical reference; do not mix with RH2000.
- Hilliness sorting/filtering is outside this first version.

## Sources (checked 2026-10-31)

- [Authoritative 1 m collection and linked licence](https://api.lantmateriet.se/stac-hojd/v1/collections/dtm-cog).
- [Product-specific CC BY 4.0 conditions](https://www.lantmateriet.se/globalassets/geodata/geodataprodukter/anvandningsvillkor_for_vardefulla_datamangder.pdf).
- [Geotorget access/account guide](https://www.lantmateriet.se/sv/geotorget-produktstod/guider/komma-igang-i-geotorget/).
- [Copernicus public COG source, surface-model description and licence link](https://copernicus-dem-30m.s3.amazonaws.com/readme.html).

## Tests

- Unit: encoding round trip, endpoint sample distances, coordinate transformation, NoData, reversal, course-gap/manual distance alignment, partial coverage, hysteresis (counted from the first height and from valley floors), smoothing (spike removal, exact steady grades, stair steps, gaps, direction symmetry) and uncertain bridge spans. Sidecar tests cover hash corruption, failed writes, release mismatches, old offline releases, stale snapshots and no startup prefetch.
- Data validation: every covered route has a profile and samples match its length; uncovered routes remain valid and show unavailable profiles. The optional builder is `npm run data:elevation` and expects `npm run data` to have generated the transit dataset first.
- e2e `e2e/elevation.mjs`: open a line and a course, check the chart and numbers, touch the chart and see the map marker. Matching cached profiles work offline; missing profiles show explicit availability/coverage, and fetch/storage failures show errors and retry without blocking ordinary planning.
