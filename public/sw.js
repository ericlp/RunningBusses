// Same-origin GETs: network-first, falling back to the last cached copy offline.
// Fresh data is always preferred, so monthly line refreshes need no cache versioning.
// Map tiles: only tiles the user has actually viewed are kept (no prefetching, as the OSM tile policy requires),
// served from cache while fresh and bounded in number.
const CACHE = 'runningbusses-v1';
const TILE_CACHE = 'runningbusses-tiles-v1';
const TILE_HOST = 'tile.openstreetmap.org';
const TILE_MAX = 800;
const TILE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimTiles(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - TILE_MAX)).map((k) => cache.delete(k)));
}

async function tile(request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request);
  const age = hit ? Date.now() - (Date.parse(hit.headers.get('date') || '') || 0) : Infinity;
  if (hit && age < TILE_FRESH_MS) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) {
      await cache.put(request, res.clone());
      void trimTiles(cache);
    }
    return res;
  } catch {
    return hit || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.hostname === TILE_HOST) {
    event.respondWith(tile(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(request, { ignoreSearch: request.mode === 'navigate' })
          .then((hit) => hit || caches.match('./', { ignoreSearch: true }))
          .then((hit) => hit || Response.error()),
      ),
  );
});
