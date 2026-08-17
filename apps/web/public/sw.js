// public/sw.js
const STATIC_CACHE = 'aiims-opd-static-v2';
const DYNAMIC_CACHE = 'aiims-opd-dynamic-v2';

const PRECACHE_ASSETS = [
  '/',
  '/registration',
  '/doctor',
  '/patient',
  '/tv',
  '/settings',
  '/manifest.json',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg',
];

// Install: Cache core application routes and assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      console.log('[SW] Pre-caching core application routes & shell...');
      // Use allSettled so one missing route doesn't prevent other assets from caching
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          fetch(url, { cache: 'no-cache' })
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch((err) => console.warn(`[SW] Could not precache ${url}:`, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
            console.log('[SW] Deleting old cache version:', key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Listen for message from client to activate immediately
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: Handle offline caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-HTTP/HTTPS and non-GET requests (POST/PUT handled by offlineSync.ts)
  if (!url.protocol.startsWith('http') || request.method !== 'GET') {
    return;
  }

  // Bypass Next.js hot reload / WebSocket connections
  if (url.pathname.includes('/_next/webpack-hmr') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Bypass API requests to allow offlineSync.ts client layer to manage localStorage & queues
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 1. Navigation requests (HTML pages) -> Network first, fallback to cached page or app shell
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Try matching exact route from cache first
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;

          // Try matching path without query string
          const pathOnly = await caches.match(url.pathname);
          if (pathOnly) return pathOnly;

          // Fallback to app shell
          const rootFallback = await caches.match('/');
          if (rootFallback) return rootFallback;

          return new Response(
            '<!DOCTYPE html><html><head><title>Offline</title></head><body style="font-family:sans-serif;background:#020617;color:#fff;text-align:center;padding:50px;"><h1>📡 AIIMS OPD Queue</h1><p>You are offline. Please open a previously loaded page or reconnect.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // 2. Static assets (JS chunks, CSS, fonts, icons) -> Cache First with Network Fallback & Dynamic Caching
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to revalidate (Stale-While-Revalidate)
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // If it's an image/icon, fallback to 192x192 SVG if available
          if (request.headers.get('accept')?.includes('image/')) {
            return caches.match('/icons/icon-192x192.svg');
          }
        });
    })
  );
});
