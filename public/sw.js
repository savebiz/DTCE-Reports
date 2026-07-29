const CACHE_NAME = 'dtce-reports-shell-v12';

// Core routes and static assets that constitute the app shell
const APP_SHELL = [
  '/',
  '/login',
  '/dashboard',
  '/my-department',
  '/my-department/daily-log',
  '/dashboard/reports',
  '/dashboard/store-requisitions',
  '/dashboard/manual-entry',
  '/icon-192.png',
  '/icon-192-maskable.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/dtce-logo.png',
  '/manifest.json'
];

// Install Event — Pre-cache App Shell
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching App Shell');
      return cache.addAll(APP_SHELL).catch(err => {
        console.warn('[SW] App Shell partial cache warning:', err);
      });
    })
  );
});

// Activate Event — Clean old caches and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting legacy cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — Handle Navigation and Static Assets Strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Bypass non-GET requests, API routes, Supabase endpoints, and auth callback
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('/auth/v1') ||
    url.hostname.includes('supabase.co')
  ) {
    return;
  }

  // 2. Navigation Requests (HTML pages): Network-First with Cache Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[SW] Network unavailable. Serving cached navigation for:', url.pathname);
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;

          // Generic fallback to cached dashboard or offline page
          const fallbackDashboard = await caches.match('/dashboard');
          if (fallbackDashboard) return fallbackDashboard;

          const fallbackLogin = await caches.match('/login');
          if (fallbackLogin) return fallbackLogin;

          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8"/>
              <meta name="viewport" content="width=device-width, initial-scale=1"/>
              <title>DTCE Reports — Offline</title>
              <style>
                body { background: #06090F; color: #F1F5F9; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; }
                .card { background: #0F1A2E; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                h1 { color: #F59E0B; margin-top: 0; font-size: 20px; }
                p { color: #94A3B8; font-size: 14px; line-height: 1.5; }
                button { background: #3B82F6; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: 16px; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>DTCE Reports — Offline</h1>
                <p>You are currently offline. Pages you've previously visited remain available, and form submissions will sync automatically once network connectivity is restored.</p>
                <button onclick="window.location.reload()">Retry Connection</button>
              </div>
            </body>
            </html>`,
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // 3. Static Assets: Cache-First, Network-Fallback with Cache Update
  const isStaticAsset =
    url.pathname.startsWith('/_next/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.json') ||
    APP_SHELL.includes(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          // Serve cached version immediately, update cache in background
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }

        return fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              const cacheCopy = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            }
            return networkResponse;
          })
          .catch(() => new Response('Asset unavailable offline', { status: 503 }));
      })
    );
    return;
  }
});

// --- WEB PUSH EVENT LISTENERS ---

// Push Event — Handle Web Push Notifications
// NOTIFICATION GROUPING: Uses a stable 'dtce-notifications' group tag so Android/iOS
// collapses multiple DTCE alerts into one grouped card (like WhatsApp / Telegram / Outlook).
// Each individual notification's unique ID is preserved in data.notificationId for deep-linking.
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');

  const DTCE_GROUP_TAG = 'dtce-notifications'; // Stable group key — all DTCE alerts share this

  const data = {
    title: 'DTCE Reports',
    body: 'New notification received',
    icon: '/icon-192.png',
    badge: '/notification-badge.png',
    data: { url: '/dashboard', notificationId: null }
  };

  let unreadCount = 1;
  let notificationId = null;

  if (event.data) {
    try {
      const parsed = event.data.json();
      // Merge parsed data — support both flat and nested payload shapes
      data.title = parsed.title || data.title;
      data.body = parsed.body || data.body;
      data.icon = parsed.icon || data.icon;
      data.badge = parsed.badge || data.badge;
      if (parsed.unreadCount) unreadCount = parsed.unreadCount;
      if (parsed.notificationId) notificationId = parsed.notificationId;
      if (parsed.data) {
        data.data = { ...data.data, ...parsed.data };
        if (parsed.data.unreadCount) unreadCount = parsed.data.unreadCount;
        if (parsed.data.notificationId) notificationId = parsed.data.notificationId;
        if (parsed.data.url) data.data.url = parsed.data.url;
      }
    } catch (e) {
      console.warn('[SW] Failed to parse push data as JSON, using text fallback');
      try { data.body = event.data.text(); } catch (_) {}
    }
  }

  event.waitUntil(
    (async () => {
      // 1. Get currently stacked DTCE notifications in the OS shade
      let existingNotifs = [];
      try {
        existingNotifs = await self.registration.getNotifications({ tag: DTCE_GROUP_TAG });
      } catch (_) {
        try {
          existingNotifs = await self.registration.getNotifications();
          existingNotifs = existingNotifs.filter(n => n.tag === DTCE_GROUP_TAG || (n.data && n.data.group === DTCE_GROUP_TAG));
        } catch (_) {}
      }

      const stackedCount = existingNotifs.length + 1; // +1 for incoming notification
      const badgeCount = Math.max(unreadCount, stackedCount);

      // 2. Set PWA app icon badge (numeric unread count)
      if ('setAppBadge' in self.navigator) {
        try { await self.navigator.setAppBadge(badgeCount); } catch (_) {}
      }

      // 3. Build per-notification options
      // Each notification uses the SHARED group tag — this is the key that causes Android
      // to group them visually, identical to how WhatsApp/Telegram stack their messages.
      const notifOptions = {
        body: data.body,
        icon: '/icon-192.png',          // Always DTCE icon on the left of every notification
        badge: '/notification-badge.png', // Small monochrome badge in status bar
        tag: DTCE_GROUP_TAG,             // SHARED stable tag = OS groups all under one header
        group: DTCE_GROUP_TAG,           // Android notification channel group
        renotify: true,                  // Alert user even if tag already exists
        vibrate: [200, 100, 200],        // Shorter pattern to avoid notification fatigue
        silent: false,
        requireInteraction: false,
        timestamp: Date.now(),
        data: {
          url: data.data?.url || '/dashboard',
          notificationId,                // Preserved for deep-link click routing
          group: DTCE_GROUP_TAG,
          unreadCount: badgeCount,
        },
        actions: [
          { action: 'open', title: '📋 Open DTCE App' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      };

      // 4. Show the individual notification (OS handles the grouping automatically)
      try {
        await self.registration.showNotification(data.title, notifOptions);
      } catch (err) {
        console.error('[SW] showNotification failed:', err);
      }

      // 5. If 2+ notifications are now stacked, update/show a summary notification
      // This creates the collapsed "N new alerts" summary line under the group header
      // (consistent with how Outlook shows "6 new emails" in its grouped card)
      if (stackedCount >= 2) {
        try {
          const summaryOptions = {
            body: `${stackedCount} new updates from DTCE Reports`,
            icon: '/icon-192.png',
            badge: '/notification-badge.png',
            tag: DTCE_GROUP_TAG + '-summary',
            group: DTCE_GROUP_TAG,
            groupSummary: true,         // Marks this as the group summary notification
            silent: true,               // Don't re-alert for summary update
            renotify: false,
            data: { url: '/dashboard', group: DTCE_GROUP_TAG, isSummary: true },
          };
          await self.registration.showNotification('DTCE Reports', summaryOptions);
        } catch (_) {}
      }
    })()
  );
});

// Notification Click Event — Open or Focus Window Tab
self.addEventListener('notificationclick', event => {
  event.notification.close();

  // Handle Dismiss action — just close, no navigation
  if (event.action === 'dismiss') return;

  // Group summary click → go to dashboard (all notifications view)
  const isSummary = event.notification.data?.isSummary;
  let targetUrl = isSummary ? '/dashboard' : (event.notification.data?.url || '/dashboard');

  // Automatically replace legacy domain with live production domain if present
  if (targetUrl.includes('dtce-reports.vercel.app')) {
    targetUrl = targetUrl.replace('dtce-reports.vercel.app', 'dtcereports.vercel.app');
  }

  const notificationId = event.notification.data?.notificationId || null;

  if ('clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {});
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          // Notify open tab to mark notification as read
          if (notificationId) {
            client.postMessage({ type: 'SW_NOTIFICATION_CLICKED', notificationId });
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Message Event — Handle client-to-SW communication
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'TEST_PUSH') {
    self.registration.showNotification('DTCE Reports — Test', {
      body: 'Push notifications are working correctly on this device!',
      icon: '/icon-192.png',
      badge: '/notification-badge.png',
      tag: 'dtce-test-push',
      vibrate: [100, 50, 100],
    }).catch(err => {
      console.error('[SW] Test notification failed:', err);
    });
  }
});

// Background Sync Event — Auto-submit queued daily log when connectivity returns
self.addEventListener('sync', event => {
  if (!event.tag || !event.tag.startsWith('dtce-daily-log-sync-')) return

  console.log('[SW] Background sync triggered for tag:', event.tag)

  // Notify all open clients to flush their pending payload
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        client.postMessage({
          type: 'SW_SYNC_TRIGGER',
          tag: event.tag,
        })
      }
    })
  )
})
