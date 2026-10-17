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

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
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
