// v3: cache-version bump so browsers holding a v2 cache full of stale dev chunks (Turbopack
// dev chunk URLs are path-derived, not content-hashed — cache-first kept serving old JS
// against fresh HTML => hydration mismatches). skipWaiting + clients.claim make the updated
// worker take over on the next load instead of waiting for every tab to close, so the stale
// cache is dropped promptly and the dev-side eviction in SWRegister can reach the page.
const CACHE = 'clearview-v3';
const PRECACHE = ['/offline', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];

// install: precache ONLY the offline page + app icons (never role-specific HTML).
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

// activate: drop any old versioned caches, take over open clients immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // (1) non-GET → do not touch (login POST + server actions must reach the network untouched).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // (2) cross-origin → do not touch (Supabase REST/auth; websockets bypass the SW anyway).
  if (url.origin !== self.location.origin) return;

  // (3) navigations → network-only, fall back to the cached offline page on failure.
  //     NEVER cache navigation HTML — it is role-specific and must not be served to another role.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')));
    return;
  }

  // (4) static assets → cache-first into the versioned cache.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
      )
    );
    return;
  }

  // everything else → no interception (default-deny).
});
