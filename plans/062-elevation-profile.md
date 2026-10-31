# 062 – Elevation profile

Status: todo.

Goal: an x/y chart of altitude against distance for a selected line and for a whole course, with total climb and descent, so the group can see how hilly a course is before choosing it.

## Decisions

- **Source: Lantmäteriet "Markhöjdmodell Nedladdning"** (laser-scanned ground model, open data). Use grid 1+ (1 m) sampled at build time; grid 50+ is too coarse for short city climbs. Phase 0 of this plan confirms the licence (CC0 or CC BY 4.0) and download access (Geotorget account or STAC API) on Lantmäteriet's own pages, and adds attribution to About if required. Fallback if access fails: Copernicus GLO-30, a surface model that includes buildings, so it is noisier.
- **Computed at build time, not in the browser.** No runtime calls, works offline, nothing about the user is sent anywhere. `scripts/transit/` samples each route every 25 m along its geometry and stores heights rounded to 0.5 m.
- **Bridges and tunnels.** A ground model shows the water under a bridge (Älvsborgsbron, Hisingsbron) and the hill above a tunnel (Tingstadstunneln, Götatunneln). The build fetches OSM `bridge=*` / `tunnel=*` highway and railway ways for the feed's bounding box once (one Overpass query per data build, cached in `.cache/`) and, where a route runs within 15 m of one, interpolates linearly between the heights at its ends. A validation check flags any remaining 25 m step steeper than 20 % for review.
- **Publication:** separate content-addressed `elevation-<category>.<hash>.json` assets, listed in the catalogue manifest next to the geometry payloads and loaded only when a profile is opened (same on-demand and offline rules as 058). Format per route key: start height plus delta-encoded half-metre steps. Profiles are derived data, so a missing profile asset hides the chart; it never blocks planning.
- **Snapshots:** courses do not store profiles. The profile is looked up by route key and shown only when the current route geometry matches the leg's snapshot (same geometry hash); otherwise it says the profile is unavailable for this historical version.
- **Course profile:** the legs' profiles joined in running direction (reversed for reversed legs). Gaps between legs are drawn as breaks, and manual legs leave a labelled gap with no heights.
- **Numbers:** total climb and descent use a 2 m hysteresis so noise does not add up; also show the highest and lowest point and the steepest 200 m stretch.
- **Chart:** a plain SVG in the line card and course details, with no chart library. Touch or hover on the chart shows a marker at that point on the map (through `MapView`), and tapping the map route does not change the chart. Works in light and dark themes.

## Design sketch

- `src/domain/elevation.ts` (pure): decode, reverse, join legs, climb/descent with hysteresis, steepest stretch, distance→coordinate lookup for the map marker, chart scaling.
- `scripts/transit/elevation.ts`: raster sampling (GeoTIFF/COG reader as a dev dependency only), bridge/tunnel interpolation, encoding, validation.
- `src/data/dataset.ts`: load elevation assets on demand with the same IndexedDB ownership and release coherence as the category payloads.
- i18n: chart labels, climb/descent, "no profile" and attribution text in sv/en/fr.

## Tests

- Unit: encoding round trip, reversal, joining with gaps and manual legs, hysteresis, bridge interpolation on a synthetic dip, steepness validation.
- Data validation: every published route has a profile and samples match its length.
- e2e `e2e/elevation.mjs`: open a line and a course, check the chart and numbers, touch the chart and see the map marker, offline fallback hides the chart without errors.
