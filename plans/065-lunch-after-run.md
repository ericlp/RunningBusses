# 065 – Lunch after the run (cancelled)

Status: cancelled on 2026-10-31 at the user's request.

The group expects to use Google Maps directly instead. Do not implement lunch
recommendations, an Overpass client or a Google Places integration in this app.
No lunch functionality was implemented, so there is no application code to remove.
The research below is retained as history, not active requirements or pending work.

Former goal: from a course, show a few casual places to eat near where it ends, suited to a group that is sweaty and maybe wet: quick, informal and not posh.

## Archived decisions

- **Source:** live OSM queries via `https://overpass.private.coffee/api/interpreter`, only when Lunch is opened. Its own terms explicitly permit any project, including commercial apps, without registration. No key, billing account or backend. Do not silently fall back to FOSSGIS's main public Overpass instance: its operator warns against general app-backend dependency. Private.coffee is best-effort and can terminate service.
- **Request policy:** make one bounded POST form query for food POIs within 1 km, then filter/rank the 500 m area locally and widen to 1 km only if sparse. Include nodes, ways and relations (`nwr`, `out center tags`), deduplicate by element type/id, retain the source timestamp and bound response size/query timeout. One request at a time, no refresh on every map pan, no background polling and no immediate retry loops. Browser identity uses its normal User-Agent and the site's origin-only Referer; non-browser research/build clients must identify the project.
- **Privacy/cache:** send the public route endpoint, not GPS, names, course/share payloads or the selected finish time. The provider still receives network metadata; its published policy describes truncated IP/User-Agent/Referer logging for up to 48 hours. Link its service/privacy policy and OSM attribution. Cache validated POIs by endpoint/query version for 7 days and recompute hours/ranking for the chosen time without refetching. On failure, explicitly offer a labelled older cached result or retry; no-cache failure is an error, not "no restaurants".
- **Search area:** 500 m straight-line radius around the course finish, widened once to 1 km if fewer than three suitable places are found. Label distances as straight-line, not walking distance. If the final leg has no known endpoint, explain that the finish is unavailable rather than silently using an earlier leg's endpoint.
- **What counts as casual** (no reliable, consistently populated OSM price level was verified, so this is a heuristic, explained in the UI):
  - Included: fast food, cafes, food courts, bakeries and restaurants. Known everyday cuisines (pizza, burger, kebab, falafel, sushi, Thai, Vietnamese, Indian, Asian, sandwiches/noodles) are useful indicators, not a strict whitelist; untagged restaurants remain lower-confidence options. Bakeries with unknown seating are explicitly labelled takeaway/seating unknown.
  - Ranked up: casual counter-service/takeaway indicators, proximity and being open at the selected finish time.
  - Prefer inexpensive, informal venues. Exclude explicit fine-dining indicators where available; unknown prices or dress expectations must not be presented as verified. No firm dietary filter.
- **Opening hours:** allow an expected finish date/time, default now, explicitly in `Europe/Stockholm`. First version uses a strict, pure evaluator for `24/7`, weekday/day ranges, multiple daily intervals, `off` and overnight intervals, evaluated as Swedish civil date/time rather than the device's timezone. PH/SH, seasonal/date and sunrise/sunset expressions not supported by that evaluator are visibly unknown; retain the raw hours string. Missing/invalid hours never imply open. This bounded approach avoids introducing a large general parser with implicit local-device timezone semantics.
- **Library comparison:** `opening_hours` 3.15.0 provides ESM and TypeScript declarations but is LGPL-3.0-only, about 4.99 MB unpacked with dependencies on i18next/suncalc, and its documented configuration has no venue-timezone parameter. Do not assume its `Date` API evaluates in Stockholm on a phone abroad. A later full-syntax evaluator needs explicit timezone tests and licence/source compliance; do not monkeypatch global Date to make it work.
- **No weather ranking or forecast service.** Outdoor seating may be shown as factual information, but does not change ranking.
- **Each item:** name, type/cuisine, straight-line distance, open/closed/unknown at the selected time, known closing time, optional seating information and links to OSM/the phone's map app. Label recommendations as likely casual options: no reliable OSM price/dress-code field was verified, and cuisine alone is not proof of affordability. Use raw tags conservatively; hotel-style `stars` or required reservations alone are not proof of a posh restaurant.
- **First version:** no saved favourites and no backup/share schema changes.
- Out of scope: booking, menus, verified prices, ratings, weather integration, favourites and Google/Yelp data. Results are likely casual options, not guarantees of low prices or acceptance of wet running clothes.

## Archived design sketch

- `src/domain/lunch.ts` (pure): Overpass query builder, tag classification, ranking, opening-hours evaluation for a time.
- `src/data/overpass.ts`: thin client with mockable `fetch`, timeouts and cache.
- UI: a "Lunch nära målet" chip on the course row and line card that opens a sheet with the list; selecting a place shows it on the map (`MapView`).
- i18n: all labels, the "casual places" explanation, attribution and errors in sv/en/fr.

## Archived choices and technical checks

- Include cafes, bakeries, fast food and casual restaurants; avoid pricey/fancy places, with no firm dietary filter.
- Expected finish date/time selectable, default now; 500 m radius expanding to 1 km.
- No weather ranking and no favourites in the first version.
- User explicitly prefers live queries. After comparing Google, the user confirmed no billing account or charge risk, so Private.coffee is selected.
- User confirmed weekly/overnight schedules first, with complex or missing hours visibly unknown rather than requiring a full-syntax parser in the first version.
- OSM coverage research at central Gothenburg (one 500 m query) returned 130 food venues: all named, 66 with cuisine, 66 with opening hours, 26 with outdoor seating, 15 with takeaway and 7 with reservation. None had `stars` or `lunch`. This small central sample is not representative of every route finish, but demonstrates that unknown-hours/atmosphere states are essential.
- Private.coffee's landing-page terms/privacy were retrieved. Its actual API status and bounded query requests timed out from this environment, including an alternate client. A final cross-origin Chromium POST for a 100 m food-venue query also reached its 20-second abort limit. This does not distinguish provider unavailability from network restrictions; CORS and successful query delivery are not claimed verified. Verify a live browser request before enabling the feature; if unavailable, show a clear service error and retain cached results. Do not describe a community service as having a reliability guarantee.

## Archived Google comparison and zero-cost decision

Google does have official Places services with ratings, price levels and hours where supplied. As checked on 2026-10-31, basic Places UI Kit queries have 10,000 free monthly events; advanced Places UI Kit has 5,000. Production still requires billing, overages cost money, and budget alerts do not stop charges. Its documented UI Kit quotas are per minute, so an enforceable project-specific cap would have to be verified before promising zero spend; a no-billing demo key is not for production.

For a new Swedish/EEA billing integration, Google directs place information associated with any map through Places UI Kit, not an arbitrary Places API overlay on Leaflet. API content storage/reuse is restricted; an OSM-style 7-day POI cache cannot simply be assumed permitted. These account/UI/cache changes and residual billing risk do not fit the confirmed no-billing first version. No Google or Geoapify account/key was requested or created.

## Archived sources (checked 2026-10-31)

- [Private.coffee: explicit application-use terms and privacy](https://overpass.private.coffee/).
- [Main Overpass operator's usage cautions, comparison only](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).
- [Hours library API and licence](https://github.com/opening-hours/opening_hours.js); [published package metadata](https://registry.npmjs.org/opening_hours/latest).
- [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [UI Kit billing](https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview), [EEA restrictions](https://developers.google.com/maps/comms/eea/faq), [cost-control guidance](https://developers.google.com/maps/billing-and-pricing/manage-costs).

## Former test plan

- Unit: casual classification, unknown prices, ranking, weekday/overnight/closed intervals, unsupported hours syntax, Swedish civil dates with device timezones abroad and DST boundaries, missing finish and local widening from 500 m to 1 km. Validate malformed data, HTTP-200 Overpass `remark` errors, timeout/429 handling and stale cache.
- e2e `e2e/lunch.mjs` with mocked provider responses: request only on explicit action, one-query widening, no polling/weather requests, list order, finish-time selection, Swedish timezone, unknown-hours/raw-hours labels, offline/stale-cache provenance and service failure without misleading empty results. No real Overpass calls in CI.
