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
  // Let the browser handle standard requests normally by default
  // and only intercept page navigations or cached assets
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Return cached asset
        }
        return fetch(event.request).catch(() => {
          // If offline and request is page navigation, fallback to HOD checklist page
          if (event.request.mode === 'navigate') {
            return caches.match('/my-department');
          }
        });
      })
  );
});
