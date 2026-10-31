# 064 – Runnable GPX

Status: todo.

Goal: a GPX that follows the bus route as closely as a runner legally and pleasantly can, on pavements, cycle/foot paths and crossings, avoiding motorways, bus-only tunnels and other places pedestrians may not go. The bus route itself stays the reference for courses, distances and completion.

PLAN.md listed pedestrian routing as out of scope. This plan brings in only this narrow case: snapping an existing route to the walking network for export. It does not add free routing.

## Decisions

- **Engine: Valhalla map matching** (`trace_route`, `costing: pedestrian`, `shape_match: map_snap`) on OpenStreetMap data. It moves the trace to parallel footways where they are mapped and goes around sections closed to pedestrians.
- **Where it runs:** the public FOSSGIS server `valhalla1.openstreetmap.de`, called from the browser (it allows CORS). It is fair-use only, so requests are made only when the user asks for a runnable GPX for one course. Never prefetch or batch every route. Requests carry `X-Client-Id` with the site name, and we tell the maintainers about the app as their policy asks. Only the public route coordinates are sent; nothing about the user.
- **Per leg, cached:** each line leg is matched separately (long legs in chunks with overlap, within the server's trace limits) and cached in IndexedDB by route key + geometry hash + direction, so other courses reuse them and they work offline once fetched. Entries live in their own IndexedDB store, separate from user records and transit data.
- **Review before export:** the map shows the runnable line next to the bus route, with stretches that differ by more than 50 m highlighted, and the runnable distance next to the bus distance. If matching fails for a leg, that leg falls back to the bus geometry and is flagged. The user then exports (or shares, 063) the runnable GPX.
- **Course distance and completion are unchanged.** Runnable geometry is never stored in course snapshots, backups or share links.
- **Attribution:** "© OpenStreetMap contributors (ODbL), routing by Valhalla/FOSSGIS" in the GPX metadata and in About.
- **Fallback / later:** if the public server is unreliable or the policy does not fit, a later plan can precompute at data-build time with a local Valhalla and a Sweden OSM extract and publish runnable geometry as another on-demand asset. Not part of this plan.

## Design sketch

- `src/domain/runnable.ts` (pure): chunking with overlap, joining matched chunks, deviation detection against the bus route, distance, GPX writing (reuses `gpx.ts`).
- `src/data/valhalla.ts`: thin client with mockable `fetch`, timeouts, one request at a time, cache.
- `MapView.tsx`: draws the runnable overlay and the deviation highlights.
- i18n: button, progress, deviation note, failure and attribution text in sv/en/fr.

## Open questions (defaults assumed until answered)

1. Is using the public FOSSGIS Valhalla server (fair use, sends route coordinates only) acceptable, or should we go straight to self-hosted build-time matching?
2. May we contact the Valhalla maintainers about the app (their policy asks public apps to), and what client id/contact should be used?
3. Should the runnable line be shown on the map only on request (default) or whenever a course is selected?
4. Deviation threshold for highlighting: 50 m (default)?

## Tests

- Unit: chunking, joining, deviation detection, fallback per leg, GPX output.
- e2e `e2e/runnable.mjs` with a mocked Valhalla response: overlay drawn, distances shown, export contains the matched points, offline uses cache, failure falls back and flags the leg. No real server calls in CI.
