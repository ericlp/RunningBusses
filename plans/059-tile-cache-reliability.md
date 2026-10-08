# 059 - Tile cache reliability

**Status:** Done.

## Scope

Fix caching of viewed OpenStreetMap tiles without increasing the 800-tile limit, changing provider, prefetching, adding retry loops, or changing the UI. Rate limiting is not confirmed.

## Behaviour

- Store local expiry metadata on successful cached tile responses; do not depend on cross-origin access to `Date`.
- Honour accessible server freshness headers; use seven days when usable expiry information is unavailable.
- Keep existing cache entries. Legacy entries without local expiry are stale, but remain available as fallback until a successful refresh.
- Use viewed stale tiles on network exceptions and unsuccessful HTTP responses, including 403, 429 and 503. Do not change their expiry or cache error responses.
- Return successful downloads even if Cache Storage opening, reading, writing or trimming fails. Log storage failures.
- Track asynchronous cache maintenance with the fetch event's `waitUntil`. Serialize saves and oldest-entry eviction so concurrent requests settle at no more than 800 tiles.
- Preserve same-origin network-first caching and the current Leaflet tile provider/options.

## Coverage and delivery

`scripts/sw.test.ts` exercises the actual shipped worker with controlled fetch, time and storage failures. `e2e/tiles.mjs` exercises the production worker with intercepted cross-origin image fixtures, including warm-cache reuse, stale HTTP/network fallback and legacy migration. It makes no real OSM requests.

Run typecheck, unit tests, production build and all browser journeys before committing. Keep the independent on-demand category-data proposal out of this fix's commit. Do not push or deploy without a request.

Validation: typecheck, all 160 unit tests, production build and every browser journey passed, including the new tile-cache journey.
