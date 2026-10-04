# 041 – Offline map tiles

Status: done.

- `public/sw.js` keeps OpenStreetMap tiles the user has actually viewed, in a separate cache. No prefetching, as the OSM tile policy requires.
- A cached tile is served for 7 days (by its `date` header), then refetched; if the network fails, the stale copy is used.
- At most 800 tiles are kept; the oldest are dropped. The tile cache survives the service worker's cleanup of old caches.
- The tile layer uses `crossOrigin` so tile responses are not opaque (opaque entries count much larger against storage quota).
- Settings shows a one-line note about it.
- Not done: clearing the cache from the UI, and offline testing in e2e.
