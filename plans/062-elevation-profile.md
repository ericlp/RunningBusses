# 062 – Elevation profile

Status: investigated; implementation pending. The user will set up authorised detailed-raster access later; credentialed sampling remains pending.

Goal: an x/y chart of altitude against distance for a selected line and for a whole course, with total climb and descent, so the group can see how hilly a course is before choosing it.

## Decisions

- **Preferred source:** Lantmäteriet's `dtm-cog` STAC collection: a 1 m ground-height raster, specifically licensed **CC BY 4.0**, not CC0. The user is willing to create free access. Include product name, © Lantmäteriet, CC BY 4.0 and a statement that profiles are processed estimates in the chart's source note and published metadata. Do not inherit the generic CC0 statement from Lantmäteriet's separate open-data page.
- **Account-free comparison:** Copernicus GLO-30 Public provides roughly 30 m surface heights, including buildings/vegetation, as public COGs. A Gothenburg-area raster returned HTTP 206 for an unauthenticated range request; the object was approximately 30 MB. It is a technically viable lower-detail alternative, but not a silently interchangeable source. RH2000 terrain heights and Copernicus's vertical reference must not be mixed within a profile. Use detailed terrain data once access is ready; retain Copernicus as a separately labelled alternative, not an automatic error fallback.
- **Initial coverage:** Gothenburg categories first (`stadsbuss`, `stombuss`, `express`, `industri`, `tram`), not `other-bus` or `ferry`. Show profiles for both individual routes and courses; clearly identify uncovered legs.
- **Computed at build time, not in the browser.** Query STAC for raster footprints intersecting the covered routes, transform lon/lat to SWEREF99 TM (horizontal EPSG:3006; the published compound CRS is EPSG:5845 with RH2000 height), and read only required COG blocks via HTTP ranges. Cache by asset identity/checksum rather than downloading all Sweden. The observed Gothenburg tile is 10,000 × 10,000 pixels and about 320 MB if downloaded whole. Sample every 25 m plus the exact endpoint; round heights to 0.5 m, while retaining actual sample distances. Coalesce block reads and bound concurrency.
- **Bridges and tunnels:** terrain data is not road-deck elevation. Reuse the locally downloaded OSM extract from [064](064-runnable-gpx.md), not a national Overpass query. Only associate structure spans with sustained, direction-consistent route overlap; a neighbouring bridge within 15 m is insufficient evidence. Interpolate between credible span endpoints and label those ranges as estimates. If endpoints/association are uncertain, leave the range unknown rather than inventing heights. Review suspicious grades, including the Göta älv crossings; a 20 % step is a review trigger, not proof of a bad sample.
- **Publication:** add a separate `data/route-extras-manifest.json` and content-addressed `extras/elevation/<category>.<hash>.json` payloads, also reusable by 064. The sidecar identifies the transit release, source/build version and per-route geometry hashes. Do not modify the existing schema-2 transit release-hash calculation or category counts: current `parseManifest` reconstructs the hash and discards unknown fields. Load extras only on request, validate hashes/bytes/membership, persist manifest+payload availability atomically in owned `transit.extras.*` entries, and add their paths to the service-worker split-data bypass. Retain existing transit/offline installations unchanged when extras are absent.
- **Missing data:** show source/availability and retry for fetch/storage errors. Never count unknown ranges as flat or zero climb. Profiles are optional and cannot block ordinary planning.
- **Snapshots:** match both stable route key and SHA-256 of `JSON.stringify(coordinates)` against the leg's snapshot. Cached profiles may be used only for that exact geometry. Do not redraw historical courses from current geometry. If no matching profile is cached/published, state that the historical version is unavailable; no course/backup/share schema change.
- **Course profile:** join available legs in running direction, reversing elevation samples for reversed legs. Use the same cumulative distance convention as `courseStats`, including its straight-line inter-leg gaps and known manual distances; these ranges are blank, not connected by elevation lines. Unknown-length manual legs make the x axis and totals explicitly incomplete. Show covered distance and do not present partial climb as a complete-course total.
- **Numbers:** total climb and descent use a 2 m hysteresis so noise does not add up; also show the highest and lowest point and the steepest 200 m stretch.
- **Chart:** a plain SVG in the line card and course details, with no chart library. Touch or hover on the chart shows a marker at that point on the map (through `MapView`), and tapping the map route does not change the chart. Works in light and dark themes.

## Design sketch

- `src/domain/elevation.ts` (pure): decode, reverse, join legs, climb/descent with hysteresis, steepest stretch, distance→coordinate lookup for the map marker, chart scaling.
- `scripts/transit/elevation.ts`: raster sampling (GeoTIFF/COG reader as a dev dependency only), bridge/tunnel interpolation, encoding, validation.
- `src/data/routeExtras.ts`: shared optional sidecar loader for elevation and runnable assets, using the existing atomic IndexedDB helpers without hydrating every category.
- i18n: chart labels, climb/descent, "no profile" and attribution text in sv/en/fr.

## Confirmed choices and technical checks

- Confirmed: investigate both source approaches before choosing; Gothenburg categories first; profiles for individual routes and courses.
- Verified: public STAC search finds Gothenburg `dtm-cog` assets; collection and linked product-specific terms both say CC BY 4.0. The data URL returned HTTP 401 with Basic authentication, while public catalogue/metadata do not require credentials.
- Access instructions: create a private/organisation Geotorget account and request permission for Markhöjdmodell Nedladdning. The official guide says private users authenticate with their Geotorget credentials; organisation users use an authorised system account. Keep credentials in a private local file/CI secrets, not source, logs, command-line arguments or `VITE_*` browser variables. Only send them to the authorised Lantmäteriet download host; do not forward auth across redirects.
- Still required: a credentialed range read and representative terrain/deck validation. The user confirmed that access setup is deferred; do not request or invent credentials before it is ready. No claim of measured bridge elevations or completed full-coverage build.
- Hilliness sorting/filtering is outside this first version.

## Sources (checked 2026-10-31)

- [Authoritative 1 m collection and linked licence](https://api.lantmateriet.se/stac-hojd/v1/collections/dtm-cog).
- [Product-specific CC BY 4.0 conditions](https://www.lantmateriet.se/globalassets/geodata/geodataprodukter/anvandningsvillkor_for_vardefulla_datamangder.pdf).
- [Geotorget access/account guide](https://www.lantmateriet.se/sv/geotorget-produktstod/guider/komma-igang-i-geotorget/).
- [Copernicus public COG source, surface-model description and licence link](https://copernicus-dem-30m.s3.amazonaws.com/readme.html).

## Tests

- Unit: encoding round trip, endpoint sample distances, coordinate transformation, NoData, reversal, course-gap/manual distance alignment, partial coverage, hysteresis and uncertain bridge spans. Sidecar tests cover hash corruption, failed writes, release mismatches, old offline releases, stale snapshots and no startup prefetch.
- Data validation: every covered route has a profile and samples match its length; uncovered routes remain valid and show unavailable profiles.
- e2e `e2e/elevation.mjs`: open a line and a course, check the chart and numbers, touch the chart and see the map marker. Matching cached profiles work offline; missing profiles show explicit availability/coverage, and fetch/storage failures show errors and retry without blocking ordinary planning.
