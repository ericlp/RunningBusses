# 064 – Runnable GPX

Status: implementation started, then paused at the user's request on 2026-11-01. Unfinished foundations are stashed; no runnable feature or assets are published.

Goal: a GPX that follows the bus route as closely as a runner legally and pleasantly can, on pavements, cycle/foot paths and crossings, avoiding motorways, bus-only tunnels and other places pedestrians may not go. The bus route itself stays the reference for courses, distances and completion.

PLAN.md listed pedestrian routing as out of scope. This plan brings in only this narrow case: snapping an existing route to the walking network for export and preparing pedestrian connections between its course legs. It does not add free routing.

## Decisions

- **Engine:** local Valhalla pedestrian map matching on OSM. Use `trace_attributes` with `shape_match: map_snap` to obtain geometry, matched/interpolated/unmatched points, discontinuity flags and edge attributes. `trace_route` is useful for narrative output but can put disconnected continuations in alternate routes; never assume the first returned shape represents the complete input.
- **Where it runs:** the user chose local build-time Valhalla, not the FOSSGIS demo service. Use a pinned container version/digest and a cached Geofabrik Sweden PBF, approximately 901 MB on the investigation date. Crop with osmium only with a generous connected corridor around all required routes and detours; per-route narrow crops can create false routing failures. Bound CPU/memory/concurrency, benchmark the covered region before adding the full build to monthly CI, and record PBF hash/date, engine and policy version. No running routing backend, API key, public-server notification or route-coordinate upload is needed in the deployed app.
- **Both directions:** match each route direction independently. Pedestrian access/crossings and matching can produce different paths; reversing a generated forward path is not sufficient. Cache builds by reference geometry hash, PBF hash, engine/policy and direction.
- **Initial coverage (confirmed 2026-11-01):** Gothenburg categories first: `stadsbuss`, `stombuss`, `express`, `industri` and `tram`. Other public buses and ferries are not covered by this first implementation.
- **Pedestrian access policy:** favour footways/sidewalks, use explicit highway/ferry exclusions, and post-validate every edge. A low `use_ferry` value is only a preference, not a ban; even exclusion options may permit endpoint exceptions. Reject ferries, motorways and non-pedestrian/private or unsupported edges including at the endpoints. Inspect source OSM tags by returned way ID when normalised edge attributes are insufficient. Do not claim that a road-centreline match automatically models its sidewalk.
- **Detours:** matching points inside a prohibited tunnel/highway can fail rather than discover the correct long detour. Generate a candidate pedestrian route between bracketing safe anchors for unmatched spans, then validate continuity, access and deviation against the reference. Keep unresolved spans explicitly unavailable; do not enlarge matching radii indefinitely or accept unrelated shortcuts merely to obtain a result.
- **Publication/client:** use [062's optional route-extras sidecar](062-elevation-profile.md), with `extras/runnable/<category>.<hash>.json` assets and per-route/direction `available` or reasoned `unavailable` records. Load only when requested and promote manifest/payload availability atomically. Bind to exact snapshot geometry; do not use current generated geometry for historical legs with a different hash.
- **Review before export:** the map shows the runnable line next to the bus route, with stretches that differ by more than 50 m highlighted, and the runnable distance next to the bus distance. If a leg cannot be routed for pedestrians, block runnable export and identify the failed leg; the original bus-reference GPX remains available as a separate action. Never label bus-geometry fallback as runnable. Mapped pedestrian access is not a safety guarantee; review remains necessary. Manual legs and ferry crossings must be reported explicitly rather than silently omitted from a supposedly complete runnable course.
- **Course distance and completion are unchanged.** Runnable geometry is never stored in course snapshots, backups or share links.
- **Inter-leg gaps:** per-line assets do not supply a verified pedestrian connection between course legs. Add the connector subtask below to investigate continuous runnable-course export. Until validated connectors exist, preserve gaps as track breaks and label them in the review; never draw/export invented straight-line connectors as runnable paths or promise complete Garmin import. Manual legs and ferry legs block a complete runnable-course export unless separately resolved.
- **Attribution:** "© OpenStreetMap contributors, ODbL; routing by Valhalla" in GPX metadata, review and About. Include source/provenance and the ODbL obligations for published derived route data. Do not credit FOSSGIS for a locally generated result.

## Design sketch

- `scripts/transit/runnable.ts`: local engine calls, source-edge validation, safe-anchor detour candidates, build cache and publication.
- `src/domain/runnable.ts` (pure): direction/geometry identity, discontinuity and deviation validation, review distances and GPX assembly reusing `gpx.ts`.
- `src/data/routeExtras.ts`: the shared optional loader from 062; no production browser Valhalla client.
- `MapView.tsx`: draws the runnable overlay and the deviation highlights.
- i18n: button, progress, deviation note, failure and attribution text in sv/en/fr.

## Subtask: pedestrian connections between legs

- Motivation: the real-device check in [063](063-gpx-to-watch.md) found that Garmin's imported map showed only the first route of a two-segment GPX, although the downloaded file contained both segments. Investigate a single continuous runnable track, not a change to the existing bus-reference export.
- Route from the actual end of one direction-specific runnable leg to the actual start of the next, using the same pedestrian access checks as the legs. Validate endpoint continuity and every connector edge; merely joining endpoint coordinates is not sufficient.
- **Preparation scope (confirmed 2026-11-01):** prepare independently oriented pairs within a 500 m straight-line endpoint radius, plus explicitly configured longer pairs. Other connections are explicitly unavailable and block continuous runnable export; do not expand this scope implicitly when the user's suggestion radius changes.
- Implement connector configuration, preparation and publication within the local build-time, static-site architecture. Bind both endpoints to their route geometry identities, including historical geometry. Do not assume that per-line assets cover these connections or introduce a runtime routing service without a separate decision.
- Show connector geometry and distance in the export review and include that distance in the runnable total. Keep stored course totals, completion, snapshots, backups and share links unchanged.
- Enable a continuous export only when every leg and connector is validated. An unavailable connector blocks that action with an explicit reason; retain the separate bus-reference export without silently bridging gaps.
- Acceptance: a single-track-segment GPX containing all legs and validated connectors, in running order, imports completely into Garmin Connect and reaches the watch. Real-device testing must verify the whole shape, direction and distance; a syntactically valid GPX alone is insufficient.

## Confirmed choices and technical checks

- Confirmed after comparison: local build-time engine and published prepared routes.
- Confirmed: any failed leg blocks runnable export; original GPX stays available.
- Proposed first-version defaults: show the overlay on request and highlight deviations over 50 m.
- A pinned Valhalla 3.9.1 container built a 1.83 MB Gothenburg OSM research extract and served a responsive local `/status`. Digest used: `sha256:4fd114eb1d26b8fc2f43bcb3df234c1b63a0bf13c277405e5943d5361dc575de` (recheck architecture/version when implementing).
- Real line 18's 74-point central section matched with zero unmatched points and zero discontinuity flags in both directions. Outputs were approximately 1.984 km and 1.995 km, with maximum trace offset 12.91 m, using roads, footways, paths and pedestrian crossings; no motorway/ferry edges were returned. This proves a local candidate workflow, not whole-network or safety correctness.
- An uncovered/distant trace returned explicit HTTP 400/error 172 ("Exceeded breakage distance"), confirming failure must be represented rather than replaced with bus geometry.
- FOSSGIS comparison: its terms cap routing to one request/second, restrict high-traffic/commercial-core use, require public contact/attribution, and its project asks for notification plus `X-Client-Id`. No notification was sent. These constraints are irrelevant to the selected local runtime-free architecture.

## Paused implementation checkpoint (2026-11-01)

- Stash: `6679f17fb6b8d65fdf5132add6cc381cff2a0e4b`, created as `stash@{0}` with message `WIP plan 064 runnable GPX foundations (paused 2026-11-01)`. It includes all four new implementation files, including untracked files. Restore this specific stash with `git stash apply 6679f17fb6b8d65fdf5132add6cc381cff2a0e4b`; the plan update remains outside the stash.
- `src/domain/runnable.ts`: draft directional geometry identities, sidecar/payload parsing, explicit unavailable reasons, deviation review, exact connector endpoint checks and single-segment GPX assembly. Not wired into the app.
- `src/data/routeExtras.ts`: draft on-request loader, bounded downloads, hash validation, atomic payload/availability persistence and historical cached assets. Not wired into the app or the service-worker bypass.
- `scripts/transit/runnable.ts`: draft local-only Valhalla client, conservative source-way access checks, continuity validation, safe-anchor detour candidates, polyline decoding and local PBF tag extraction. No build orchestrator, connector enumeration or publication command yet.
- `scripts/runnable-tools/Dockerfile`: isolated tools image based on the previously investigated pinned Valhalla digest, with osmium installed. Host osmium was unavailable; privileged package installation could not proceed, and the host has no `apt-get`. The Docker tools image `runningbusses-runnable-tools:v1` was built instead.
- Local ignored assets: `.cache/runnable/sweden.osm.pbf` exists (approximately 902 MB) and the tools image exists. The PBF's integrity, source timestamp and hash have not been validated or recorded; do not treat it as a verified build input. Ignored caches and Docker images are not part of the stash.
- The background tools/download command was stopped on pause; no running Docker containers remained. No tile build, new real-engine route validation or dataset publication was performed during this implementation attempt.
- Validation is incomplete: the first typecheck found a narrowing error in `src/domain/runnable.ts`. That code was revised before stashing, but typecheck was not rerun. No new unit tests, build or browser journeys were run. The stashed code is WIP, not a validated implementation.

### Remaining work

- Restore and review the draft contracts; validate category/key/direction membership, cache input guards and historical-release precedence with focused tests.
- Verify osmium export IDs and Valhalla response/filter semantics against the real isolated tools; validate the downloaded PBF and bind tile/build caches to source hash/date, pinned engine and policy.
- Add the bounded tile/service lifecycle and build orchestrator, both-direction preparation, 500 m connector enumeration, explicit longer-pair configuration, unavailable records and content-addressed publication. Benchmark the covered region before monthly CI integration.
- Wire the optional sidecar into the service-worker bypass without changing transit release hashes or existing offline installations.
- Add line/course review UI, bus/runnable overlays, deviation highlights, leg/connector distances and separate prepared runnable download/capability-based share actions. Translate all user-visible strings in sv/en/fr and retain the existing reference GPX unchanged.
- Add domain, build and storage tests plus `e2e/runnable.mjs` in the journey runner; document source attribution and ODbL publication obligations.
- Before a feature commit, run typecheck, all unit tests, build and the full browser journey suite. Complete regional checks and the separate whole-track Garmin/watch acceptance before claiming those outcomes.

## Sources (checked 2026-10-31)

- [Valhalla matching: discontinuities, matched points and edge attributes](https://valhalla.github.io/valhalla/api/map-matching/).
- [Pedestrian options and exclusion endpoint caveats](https://valhalla.github.io/valhalla/api/route/api-reference/).
- [Official container/build instructions](https://github.com/valhalla/valhalla/blob/3.9.1/docker/README.md).
- [Sweden source extract](https://download.geofabrik.de/europe/sweden.html).
- [FOSSGIS service terms, comparison only](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/).

## Tests

- Unit/build: independent directions, matched/interpolated/unmatched inputs, alternate/disconnected output, access restrictions at endpoints, parallel sidewalks, long motorway/tunnel detours, stale cache identity, historical snapshots and explicit unavailable records. Include manual/ferry legs, gap-preserving reference GPX, connector endpoint/access validation, unavailable connectors and continuous runnable assembly without omitted legs or invented connections.
- e2e `e2e/runnable.mjs` with static extra-asset fixtures: overlay, leg/connector distances, exact exported points, offline cached results, a failed leg or connector blocking continuous runnable export while original GPX remains available, and no runtime routing requests. Fixture tests must not call public routing servers.
- Manual: import a connected two-leg runnable GPX through the Files-to-Garmin path from 063, inspect both legs and the connector, and verify the saved course on a watch.
