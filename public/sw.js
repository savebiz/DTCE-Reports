const CACHE_NAME = 'dtce-reports-cache-v1';
const urlsToCache = [
  '/login',
  '/dashboard',
  '/my-department',
  '/dtce-logo.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Bypass non-GET requests, API routes, and Supabase calls
  if (event.request.method !== 'GET' || 
      url.pathname.startsWith('/api') || 
      url.pathname.includes('/auth/v1') ||
      url.hostname.includes('supabase.co')) {
    return; // Let the browser handle natively
  }

  // 2. Navigation requests: Network-First, Cache-Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // Cache the live version for offline fallback
          if (networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(event.request)
            .then(cachedResponse => {
              return cachedResponse || caches.match('/my-department');
            });
        })
    );
    return;
  }

  // 3. Static Assets & Cached URLs: Cache-First, Network-Fallback
  const isStaticAsset = url.pathname.startsWith('/_next/') || 
                        url.pathname.endsWith('.png') || 
                        url.pathname.endsWith('.jpg') || 
                        url.pathname.endsWith('.svg') || 
                        url.pathname.endsWith('.css') || 
                        url.pathname.endsWith('.js') || 
                        url.pathname.endsWith('.json') ||
                        urlsToCache.includes(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then(networkResponse => {
            if (networkResponse.status === 200) {
              const cacheCopy = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, cacheCopy);
              });
            }
            return networkResponse;
          }).catch(() => {
            // Fallback gracefully to network failure
            return new Response('Network error fetching static asset', { status: 408 });
          });
        })
    );
    return;
  }

  // 4. Default: Let browser handle natively
  return;
});
