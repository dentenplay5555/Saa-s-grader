// DSA Academy PWA Service Worker (Level 1 Offline Mode)
const CACHE_NAME = 'dsa-academy-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Never cache official submissions or mutation endpoints
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/submissions')) {
    return;
  }

  // 2. Cache public read-only content: tracks, lessons, problem statements
  if (url.pathname.startsWith('/api/tracks') || url.pathname.startsWith('/api/lessons') || url.pathname.startsWith('/api/problems')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Static assets: Cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
