// The service worker. vite.config.ts fills in VERSION and PRECACHE at build time and writes it to dist/sw.js.
// - The page itself: network first, so a new version shows up as soon as you are online; the cached copy offline.
// - Bundled files (hashed names), the engine and the piece sets: cache first.
// - /api/: never cached.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `chess-trainer-${VERSION}`;
const RUNTIME = 'chess-trainer-runtime';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
});

// a new version waits until the page asks it to take over ("Reload" in the update bar)
self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('chess-trainer-') && k !== CACHE && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Something shared with the app from another app's share menu (manifest "share_target"):
// kept in the "share-inbox" cache, then the app opens on #games/shared and imports it (src/share.ts).
async function receiveShare(request) {
  const form = await request.formData();
  const parts = [];
  for (const file of form.getAll('pgn')) if (file && typeof file !== 'string') parts.push(await file.text());
  for (const field of ['text', 'title', 'url']) {
    const value = form.get(field);
    if (typeof value === 'string' && value.trim()) parts.push(value);
  }
  const inbox = await caches.open('share-inbox');
  await inbox.put('/__shared', new Response(JSON.stringify({ parts }), { headers: { 'Content-Type': 'application/json' } }));
  return Response.redirect('/#games/shared', 303);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-target') {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/', { cacheName: CACHE }).then(hit => hit || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      hit =>
        hit ||
        fetch(request).then(response => {
          if (response.ok && /^\/(assets|engine|pieces|icons)\//.test(url.pathname)) {
            const copy = response.clone();
            caches.open(RUNTIME).then(cache => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
