// Same-origin GETs: network-first, falling back to the last cached copy offline.
// Fresh data is always preferred, so monthly line refreshes need no cache versioning.
// Map tiles: only tiles the user has actually viewed are kept (no prefetching, as the OSM tile policy requires),
// served from cache while fresh and bounded in number.
const CACHE = 'runningbusses-v1';
const TILE_CACHE = 'runningbusses-tiles-v1';
const TILE_HOST = 'tile.openstreetmap.org';
const TILE_MAX = 800;
const TILE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const TILE_FRESH_UNTIL = 'x-rb-tile-fresh-until';
let tileWrites = Promise.resolve();

self.addEventListener('install', () => self.skipWaiting());

const splitData = (url) => url.origin === self.location.origin &&
  /\/data\/(?:catalog-manifest\.json|catalog\.[a-f0-9]+\.json|categories\/(?:stadsbuss|stombuss|express|industri|other-bus|tram|ferry)\.[a-f0-9]+\.json)$/.test(url.pathname);

async function clearSplitData() {
  try {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.filter((key) => splitData(new URL(key.url))).map((key) => cache.delete(key)));
  } catch (error) { console.warn('Legacy split-data cache cleanup failed:', error); }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))))
      .then(clearSplitData)
      .then(() => self.clients.claim()),
  );
});

async function trimTiles(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - TILE_MAX)).map((k) => cache.delete(k)));
}

function tileExpiry(response) {
  const now = Date.now();
  const control = response.headers.get('cache-control') || '';
  if (/(?:^|,)\s*no-cache\b/i.test(control)) return now;
  const maxAge = control.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)"?\s*(?:,|$)/i);
  if (maxAge) {
    const date = Date.parse(response.headers.get('date') || '');
    const age = Number(response.headers.get('age'));
    const elapsed = Math.max(Number.isFinite(age) && age >= 0 ? age * 1000 : 0, Number.isFinite(date) ? now - date : 0);
    return now + Math.max(0, Number(maxAge[1]) * 1000 - elapsed);
  }
  const expires = Date.parse(response.headers.get('expires') || '');
  return Number.isFinite(expires) ? expires : now + TILE_FRESH_MS;
}

async function tile(request, maintenance) {
  let cache;
  let hit;
  try {
    cache = await caches.open(TILE_CACHE);
    hit = await cache.match(request);
  } catch (error) {
    console.warn('Map tile cache read failed:', request.url, error);
  }
  const expiry = Number(hit?.headers.get(TILE_FRESH_UNTIL));
  if (hit && Number.isFinite(expiry) && expiry > Date.now()) return hit;
  let res;
  try {
    res = await fetch(request);
  } catch (error) {
    console.warn('Map tile request failed:', request.url, error);
    return hit || Response.error();
  }
  if (!res.ok) {
    console.warn('Map tile HTTP error:', request.url, res.status);
    return hit || res;
  }
  if (cache && !/(?:^|,)\s*no-store\b/i.test(res.headers.get('cache-control') || '')) {
    const copy = res.clone();
    const headers = new Headers(copy.headers);
    headers.set(TILE_FRESH_UNTIL, String(tileExpiry(copy)));
    const saved = new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers });
    // Serialize writes and trimming so overlapping requests cannot race eviction.
    tileWrites = tileWrites.then(async () => {
      await cache.put(request, saved);
      await trimTiles(cache);
    }).catch((error) => {
      console.warn('Map tile cache save/trim failed:', request.url, error);
    });
    maintenance.push(tileWrites);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (splitData(url)) return;
  if (url.hostname === TILE_HOST) {
    const maintenance = [];
    const response = tile(request, maintenance);
    event.respondWith(response);
    event.waitUntil(response.then(() => Promise.all(maintenance)));
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
