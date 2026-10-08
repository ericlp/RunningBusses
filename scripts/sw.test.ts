import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/sw.js', 'utf8');
const tileCache = 'runningbusses-tiles-v1';
const freshHeader = 'x-rb-tile-fresh-until';
const url = 'https://tile.openstreetmap.org/12/2184/1241.png';
const week = 7 * 24 * 60 * 60 * 1000;

function harness() {
  let now = 1_800_000_000_000;
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response.clone()); }),
    keys: vi.fn(async () => [...entries.keys()].map((key) => new Request(key))),
    delete: vi.fn(async (request: Request) => entries.delete(request.url)),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ['runningbusses-v1', tileCache, 'obsolete']),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => new Response('offline shell')),
  };
  const fetch = vi.fn(async (_request: Request) => new Response('new tile', { headers: { 'content-type': 'image/png' } }));
  const warn = vi.fn();
  const handlers = new Map<string, (event: unknown) => void>();
  const claim = vi.fn(async () => {});
  runInNewContext(source, {
    self: {
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
      location: { origin: 'https://example.test' },
      clients: { claim },
      skipWaiting: vi.fn(),
    },
    caches, fetch, Response, Request, Headers, URL,
    Date: class extends Date { static now() { return now; } },
    console: { warn },
  });
  function dispatch(request = new Request(url)) {
    let response: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers.get('fetch')!({
      request,
      respondWith: (value: Promise<Response>) => { response = value; },
      waitUntil: (value: Promise<unknown>) => waits.push(value),
    });
    return {
      response,
      waits,
      done: async () => {
        const result = await response!;
        await Promise.all(waits);
        return result;
      },
    };
  }
  return {
    entries, cache, caches, fetch, warn, claim, handlers, dispatch,
    now: () => now,
    advance: (ms: number) => { now += ms; },
  };
}

describe('shipped service worker tile caching', () => {
  it('persists freshness without Date and fetches only at the seven-day boundary', async () => {
    const h = harness();
    const first = h.dispatch();
    expect(first.waits).toHaveLength(1);
    expect(await (await first.done()).text()).toBe('new tile');
    expect(h.entries.get(url)!.headers.get(freshHeader)).toBe(String(h.now() + week));
    h.advance(week - 1);
    expect(await (await h.dispatch().done()).text()).toBe('new tile');
    expect(h.fetch).toHaveBeenCalledTimes(1);
    h.advance(1);
    await h.dispatch().done();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ 'cache-control': 'public, max-age=3600', age: '120' }, 3480_000],
    [{ 'cache-control': 'max-age="3600"', date: new Date(1_800_000_000_000 - 300_000).toUTCString() }, 3300_000],
    [{ expires: new Date(1_800_000_000_000 + 600_000).toUTCString() }, 600_000],
    [{ 'cache-control': 'no-cache, max-age=3600' }, 0],
    [{ 'cache-control': 'max-age=60', age: '120' }, 0],
    [{ 'cache-control': 'max-age=invalid', expires: 'invalid' }, week],
  ])('honours readable server freshness %j', async (headers, lifetime) => {
    const h = harness();
    h.fetch.mockResolvedValue(new Response('tile', { headers }));
    await h.dispatch().done();
    expect(Number(h.entries.get(url)!.headers.get(freshHeader))).toBe(h.now() + lifetime);
  });

  it('does not store no-store responses', async () => {
    const h = harness();
    h.fetch.mockResolvedValue(new Response('tile', { headers: { 'cache-control': 'no-store' } }));
    expect(await (await h.dispatch().done()).text()).toBe('tile');
    expect(h.cache.put).not.toHaveBeenCalled();
  });

  it.each([null, '', 'invalid', 'Infinity', '0'])('refreshes legacy/invalid metadata %s without losing the old tile', async (expiry) => {
    const h = harness();
    const headers = new Headers();
    if (expiry !== null) headers.set(freshHeader, expiry);
    h.entries.set(url, new Response('old tile', { headers }));
    h.fetch.mockRejectedValueOnce(new Error('offline'));
    expect(await (await h.dispatch().done()).text()).toBe('old tile');
    expect(h.entries.get(url)!.headers.get(freshHeader)).toBe(expiry);
    await h.dispatch().done();
    expect(h.entries.get(url)!.headers.get(freshHeader)).toBe(String(h.now() + week));
  });

  it.each([429, 403, 503])('uses a stale tile on HTTP %s without updating it', async (status) => {
    const h = harness();
    h.entries.set(url, new Response('old tile', { headers: { [freshHeader]: String(h.now() - 1) } }));
    h.fetch.mockResolvedValue(new Response('failure', { status }));
    expect(await (await h.dispatch().done()).text()).toBe('old tile');
    expect(h.entries.get(url)!.headers.get(freshHeader)).toBe(String(h.now() - 1));
    expect(h.cache.put).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalled();
  });

  it.each([429, 403, 503])('preserves uncached HTTP %s failures', async (status) => {
    const h = harness();
    h.fetch.mockResolvedValue(new Response('failure', { status }));
    expect((await h.dispatch().done()).status).toBe(status);
    expect(h.cache.put).not.toHaveBeenCalled();
  });

  it('returns a network error without a cached tile', async () => {
    const h = harness();
    h.fetch.mockRejectedValue(new Error('offline'));
    expect((await h.dispatch().done()).type).toBe('error');
  });

  it.each(['open', 'read', 'put', 'trim', 'delete'] as const)('keeps successful downloads when %s fails', async (operation) => {
    const h = harness();
    const failure = new Error('storage failed');
    if (operation === 'open') h.caches.open.mockRejectedValue(failure);
    if (operation === 'read') h.cache.match.mockRejectedValue(failure);
    if (operation === 'put') h.cache.put.mockRejectedValue(failure);
    if (operation === 'trim') h.cache.keys.mockRejectedValue(failure);
    if (operation === 'delete') {
      for (let i = 0; i < 800; i++) h.entries.set(`${url}?old=${i}`, new Response('old'));
      h.cache.delete.mockRejectedValue(failure);
    }
    expect(await (await h.dispatch().done()).text()).toBe('new tile');
    expect(h.warn).toHaveBeenCalled();
  });

  it('returns the downloaded tile, not its stale predecessor, when a save fails', async () => {
    const h = harness();
    h.entries.set(url, new Response('old tile', { headers: { [freshHeader]: String(h.now() - 1) } }));
    h.cache.put.mockRejectedValue(new Error('quota'));
    expect(await (await h.dispatch().done()).text()).toBe('new tile');
    expect(await h.entries.get(url)!.text()).toBe('old tile');
    expect(h.warn).toHaveBeenCalled();
  });

  it('does not delay display for cache maintenance, and recovers after a failed write', async () => {
    const h = harness();
    let finish: (() => void) | undefined;
    h.cache.put.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const event = h.dispatch();
    expect(await (await event.response!).text()).toBe('new tile');
    await vi.waitFor(() => expect(finish).toBeDefined());
    finish!();
    await event.done();
    h.cache.put.mockRejectedValueOnce(new Error('quota'));
    await h.dispatch().done();
    await h.dispatch().done();
    expect(h.cache.put).toHaveBeenCalledTimes(3);
    expect(h.entries.has(url)).toBe(true);
  });

  it('serializes concurrent saves and trims the oldest entries to 800', async () => {
    const h = harness();
    for (let i = 0; i < 800; i++) h.entries.set(`${url}?old=${i}`, new Response('old'));
    await Promise.all(Array.from({ length: 12 }, (_, i) => h.dispatch(new Request(`${url}?new=${i}`)).done()));
    expect(h.entries.size).toBe(800);
    expect(h.entries.has(`${url}?old=0`)).toBe(false);
    for (let i = 0; i < 12; i++) expect(h.entries.has(`${url}?new=${i}`)).toBe(true);
  });

  it('preserves same-origin network-first and offline fallback behaviour', async () => {
    const h = harness();
    const request = new Request('https://example.test/data/lines.json');
    expect(await (await h.dispatch(request).done()).text()).toBe('new tile');
    expect(h.caches.open).toHaveBeenCalledWith('runningbusses-v1');
    h.fetch.mockRejectedValue(new Error('offline'));
    expect(await (await h.dispatch(request).done()).text()).toBe('offline shell');
    expect(h.dispatch(new Request('https://other.test/image.png')).response).toBeUndefined();
    expect(h.dispatch(new Request(url, { method: 'POST' })).response).toBeUndefined();
  });

  it('activation retains both existing caches and claims clients', async () => {
    const h = harness();
    let wait: Promise<unknown> | undefined;
    h.handlers.get('activate')!({ waitUntil: (value: Promise<unknown>) => { wait = value; } });
    await wait;
    expect(h.caches.delete).toHaveBeenCalledExactlyOnceWith('obsolete');
    expect(h.claim).toHaveBeenCalledOnce();
  });

  it.each(['catalog-manifest.json', 'catalog.ab12.json', 'categories/other-bus.ab12.json', 'categories/ferry.ab12.json'])('leaves split asset %s to the IndexedDB loader', (file) => {
    const h = harness();
    const dispatched = h.dispatch(new Request(`https://example.test/RunningBusses/data/${file}`));
    expect(dispatched.response).toBeUndefined();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.caches.open).not.toHaveBeenCalled();
  });

  it('cleans accidental split-data entries during upgrade without deleting legacy data or tiles', async () => {
    const h = harness();
    const split = 'https://example.test/RunningBusses/data/categories/stadsbuss.ab12.json';
    const ferry = 'https://example.test/RunningBusses/data/categories/ferry.ab12.json';
    const legacy = 'https://example.test/RunningBusses/data/lines.json';
    h.entries.set(split, new Response('obsolete duplicate'));
    h.entries.set(ferry, new Response('obsolete ferry duplicate'));
    h.entries.set(legacy, new Response('legacy dataset'));
    h.entries.set(url, new Response('tile'));
    let wait: Promise<unknown> | undefined;
    h.handlers.get('activate')!({ waitUntil: (value: Promise<unknown>) => { wait = value; } });
    await wait;
    expect(h.entries.has(split)).toBe(false);
    expect(h.entries.has(ferry)).toBe(false);
    expect(h.entries.has(legacy)).toBe(true);
    expect(h.entries.has(url)).toBe(true);
    expect(h.claim).toHaveBeenCalledOnce();
  });
});
