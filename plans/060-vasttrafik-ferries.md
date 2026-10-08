# 060 - Västtrafik ferries

**Status:** Implemented.

## Scope

Add public timetabled Västtrafik ferries from the existing GTFS Regional Static feed as a separate `ferry` category. Include regional and archipelago services, not just Gothenburg river crossings. Keep default filters and progress city-bus-only.

Use the existing route selection, direction splitting, stops, immutable snapshots and collision-safe `vt.<route_id>` identities. Weight ferry patterns across the full service period, like regional buses. Require public registry classification and usable timetabled geometry; do not invent land routes. The reference warning explicitly states that ferry paths cross water and cannot be run.

## Data and compatibility

- Feed 2026-10-03 contains 15 public ferry identities, all using route type 1000. Also recognize standard ferry types 4 and 1200. The registry confirms every identity is public.
- Publish 17 representative ferry routes, including two return paths, in their own content-addressed payload. All 805 pre-existing line records remain JSON-equivalent; the aggregate now has 822 routes.
- The 151 m Kyrkesund-Härön crossing requires a ferry-only 50 m minimum. Keep the 60 km upper limit and coordinate/distance checks; bus/tram lower limits remain unchanged.
- Extend filters, progress and all three dictionaries using the shared category collection. Saved ferry preferences, course ownership, backups, share links and reconciliation keep existing semantics.
- Pre-ferry schema-2 releases remain valid without a ferry descriptor. Verify their original release hash and require all six original descriptors. Installation and garbage collection operate on descriptors actually present; absent ferry geometry is explicitly unavailable, never fabricated. New publication always includes all seven categories.
- Default browsing still fetches only city geometry. Offline installation includes ferries in a new release but preserves older complete installations during upgrades.
- Ferry split requests bypass the service worker, just like all other category payloads. Activation removes accidental duplicate ferry cache entries.

## Coverage

Unit coverage includes ferry classification and public-service guards, independent identities, filtering/progress persistence, snapshots/shares, short-crossing validation, lazy/offline ferry geometry and pre-ferry installation/hash compatibility.

The registered `e2e/ferries.mjs` journey exercises phone and desktop filters, short/return geometry, persisted courses, opt-in progress and sharing to a fresh browser. Existing category-data journeys continue to check coherent seven-category installation.

Verification: typecheck, all 202 unit tests, production build, all 17 browser journeys and split/aggregate dataset validation passed. Comparison with the previous publication confirms all 805 existing records are unchanged.
