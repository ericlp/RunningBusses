# 041 – Offline map tiles

Status: done.

- `public/sw.js` keeps OpenStreetMap tiles the user has actually viewed, in a separate cache. No prefetching, as the OSM tile policy requires.
- A cached tile is served until its locally recorded expiry, respecting accessible server freshness headers or using seven days as fallback. Legacy entries without local expiry are refreshed on viewing, but retained as fallback.
- Network errors and HTTP failures use previously viewed stale tiles. Storage failures are logged and cannot discard a successful download. Maintenance is tracked by the worker's fetch event.
- At most 800 tiles are kept; the oldest are dropped. The tile cache survives the service worker's cleanup of old caches.
- The tile layer uses `crossOrigin` so tile responses are not opaque (opaque entries count much larger against storage quota).
- Settings shows a one-line note about it.
- Worker tests and the `tiles` browser journey cover cache freshness and stale fallback without requesting real OSM tiles; see plan 059.
- Not done: clearing the cache from the UI.
