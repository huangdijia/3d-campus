/* Offline access is limited to resources this browser has requested. */
const CACHE_PREFIX = 'shanhe-pwa-';
const VERSION = 'v1';
const MIB = 1024 * 1024;
const POLICIES = {
  pages: { entries: 4, bytes: 4 * MIB, itemBytes: 2 * MIB },
  static: { entries: 180, bytes: 40 * MIB, itemBytes: 12 * MIB },
  models: { entries: 6, bytes: 32 * MIB, itemBytes: 8 * MIB },
};
const cacheName = (bucket) => `${CACHE_PREFIX}${VERSION}-${bucket}`;
let writes = Promise.resolve();
const isPublicPage = (pathname) =>
  pathname === '/' ||
  /^\/university\/\d{5}\/campus\/[a-z0-9-]+\/?$/.test(pathname);

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const active = Object.keys(POLICIES).map(cacheName);
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && !active.includes(name)) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

function bucketFor(request) {
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    request.headers.has('range') ||
    request.headers.has('authorization') ||
    request.headers.has('rsc') ||
    request.headers.has('next-router-state-tree') ||
    request.headers.get('accept')?.includes('text/x-component') ||
    url.searchParams.has('_rsc') ||
    /(?:^|\/)(?:api|auth|login|logout|signin|signout|oauth|callback|__vite|@vite|@id|@fs|__vinext|_vinext)(?:\/|$)/.test(
      url.pathname,
    ) ||
    /(?:\.rsc$|hot-update|webpack-hmr|vite-hmr)/.test(url.pathname)
  ) {
    return null;
  }
  if (request.mode === 'navigate') {
    return isPublicPage(url.pathname) ? 'pages' : null;
  }
  if (url.pathname === '/models/national-map.glb') return 'static';
  if (/^\/models\/[^/]+\.glb$/.test(url.pathname)) return 'models';
  if (
    /^\/(?:_next\/static|assets|data|emblems|icons)\/.*\.(?:js|mjs|css|json|geojson|png|svg|webp|jpg|jpeg|woff2?)$/.test(
      url.pathname,
    ) ||
    ['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)
  ) {
    return 'static';
  }
  return null;
}

async function storeResponse(bucket, request, response) {
  if (
    !response.ok ||
    response.status !== 200 ||
    response.redirected ||
    response.type === 'opaque' ||
    /(?:no-store|private)/i.test(response.headers.get('cache-control') || '') ||
    response.headers.get('vary') === '*' ||
    response.headers.get('content-type')?.includes('text/x-component')
  ) {
    return;
  }
  const policy = POLICIES[bucket];
  const advertisedSize = Number(response.headers.get('content-length'));
  if (advertisedSize > policy.itemBytes) return;
  const body = await response.arrayBuffer();
  if (body.byteLength > policy.itemBytes) return;
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.set('content-length', String(body.byteLength));
  headers.set('x-shanhe-cache-bytes', String(body.byteLength));
  const cache = await caches.open(cacheName(bucket));
  // Reinsert to keep eviction order deterministic; serialized writes enforce limits.
  await cache.delete(request);
  await cache.put(request, new Response(body, { status: 200, headers }));
  const keys = await cache.keys();
  let total = 0;
  for (const key of keys) {
    const stored = await cache.match(key);
    total += Number(stored?.headers.get('x-shanhe-cache-bytes') || 0);
  }
  while (keys.length > policy.entries || total > policy.bytes) {
    const oldest = keys.shift();
    if (!oldest) break;
    const stored = await cache.match(oldest);
    total -= Number(stored?.headers.get('x-shanhe-cache-bytes') || 0);
    await cache.delete(oldest);
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'WARM_SHELL' || !event.source?.url) return;
  event.waitUntil(
    (async () => {
      const clientUrl = new URL(event.source.url);
      const pageUrl = new URL(event.data.page);
      if (
        clientUrl.origin !== self.location.origin ||
        pageUrl.origin !== self.location.origin ||
        !isPublicPage(clientUrl.pathname) ||
        !isPublicPage(pageUrl.pathname) ||
        pageUrl.pathname !== clientUrl.pathname ||
        pageUrl.searchParams.has('_rsc')
      ) {
        return;
      }
      // Warm only this page's already-requested resources, never a campus catalog.
      const urls = [pageUrl.href];
      if (Array.isArray(event.data.urls)) {
        for (const value of event.data.urls.slice(0, 180)) {
          if (typeof value !== 'string') continue;
          const url = new URL(value, self.location.origin);
          const bucket = bucketFor(new Request(url));
          const campusId = pageUrl.pathname.match(
            /^\/university\/(\d{5})\//,
          )?.[1];
          if (
            url.origin === self.location.origin &&
            (bucket === 'static' ||
              (bucket === 'models' &&
                url.pathname === `/models/${campusId}.glb`))
          ) {
            urls.push(url.href);
          }
        }
      }
      for (const [index, url] of [...new Set(urls)].entries()) {
        const request = new Request(url, { credentials: 'same-origin' });
        try {
          const response = await fetch(request);
          writes = writes
            .then(() =>
              storeResponse(
                index === 0 ? 'pages' : bucketFor(request),
                request,
                response,
              ),
            )
            .catch(() => {});
          await writes;
        } catch {
          // Installation remains usable when an optional shell resource fails.
        }
      }
    })().catch(() => {}),
  );
});

function offlineResponse(navigation) {
  if (!navigation) {
    return new Response('此资源尚未离线缓存，请联网后重试。', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="theme-color" content="#f5f7fb"><title>山河学府 · 暂时离线</title>' +
      '<body style="margin:0;padding:12vh 8vw;background:#f5f7fb;color:#22334a;font:18px system-ui">' +
      '<h1>山河学府</h1><h2>当前处于离线状态</h2>' +
      '<p>此页面尚未缓存。请联网打开一次，之后可复访已缓存的内容。</p>' +
      '<p>校园模型按访问情况缓存，并非全部高校都可离线浏览。</p>' +
      '<a href="/">重试打开地图</a></body></html>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

self.addEventListener('fetch', (event) => {
  const bucket = bucketFor(event.request);
  if (!bucket) return;
  const navigation = event.request.mode === 'navigate';
  const network = fetch(event.request);
  // Register cache work during dispatch, before the first asynchronous step.
  event.waitUntil(
    network
      .then((response) => {
        const copy = response.clone();
        writes = writes
          .then(() => storeResponse(bucket, event.request, copy))
          .catch(() => {
            // Quota pressure must never prevent ordinary online navigation.
          });
        return writes;
      })
      .catch(() => {}),
  );
  event.respondWith(
    network.catch(async () => {
      const cached = await caches.match(event.request, {
        cacheName: cacheName(bucket),
      });
      if (cached) return cached;
      if (navigation) {
        const root = await caches.match(new URL('/', self.location.origin), {
          cacheName: cacheName('pages'),
        });
        if (root) return root;
      }
      return offlineResponse(navigation);
    }),
  );
});
