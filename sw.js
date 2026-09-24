const CACHE_NAME = 'omniscan-pos-v1';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching non-fatal issue:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and skip chrome-extension / firebase websocket requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip firestore / firebase polling / cross-origin analytics
  if (url.origin.includes('firestore.googleapis.com') || 
      url.origin.includes('identitytoolkit') ||
      url.origin.includes('firebase')) {
    return;
  }

  // Network-first with Cache fallback strategy
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // If navigating to an HTML page while offline, return cached root/index
        if (event.request.mode === 'navigate') {
          return caches.match('./') || caches.match('./index.html');
        }
        return new Response('Network error and asset not cached', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});
