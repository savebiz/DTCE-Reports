const CACHE_NAME = 'dtce-reports-shell-v14';

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
  '/dtce-logo-white-bg.png',
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
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, cacheCopy));
            }
            return networkResponse;
          })
          .catch(() => new Response('Asset unavailable offline', { status: 503 }));
      })
    );
    return;
  }
});

// ════════════════════════════════════════════════════════════════════════════
// WEB PUSH EVENT LISTENERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Push Event — Handle Web Push Notifications
 * ════════════════════════════════════════════════════════════════════════════
 *
 * THREE-LAYER NOTIFICATION ARCHITECTURE (matching WhatsApp / Telegram / Outlook):
 *
 *  LAYER 1 — OS Heads-Up / Lock Screen Banner
 *  ───────────────────────────────────────────
 *  • The floating drop-down banner that appears at the TOP of the home screen
 *    and lock screen when a push notification arrives — exactly like WhatsApp.
 *  • Works whether the PWA is OPEN, CLOSED, or the LOCK SCREEN IS ACTIVE.
 *  • This is a 100% native Android/iOS OS-level feature, automatically triggered
 *    when a push notification with sufficient priority arrives.
 *  • Requirements for Android to show Heads-Up:
 *      ✅  Unique `tag` per notification (shared tag = silent replace, no banner)
 *      ✅  vibrate set (signals high-priority to OS)
 *      ✅  silent: false (must have sound/vibration)
 *      ✅  urgency: 'high' in the VAPID push request headers (set in webpush.ts)
 *  • Requirements for iOS lock screen (iOS 16.4+ with PWA installed):
 *      ✅  Same requirements as above — iOS honours push permission for installed PWAs
 *
 *  LAYER 2 — Notification Shade Grouping (collapsible group header)
 *  ────────────────────────────────────────────────────────────────
 *  • When multiple DTCE notifications accumulate in the shade, they are visually
 *    grouped under one "DTCE Reports" header — like WhatsApp/Telegram/Outlook.
 *  • Controlled by the `group` field (INDEPENDENT of `tag`).
 *  • A `groupSummary: true` notification provides the "N new updates" header card.
 *  • The group summary uses a STABLE shared tag (silently replaces itself).
 *
 *  LAYER 3 — In-App Foreground Banner (InAppNotificationToast component)
 *  ──────────────────────────────────────────────────────────────────────
 *  • A React component that slides in from the top when the user has the app
 *    open in the foreground on mobile.
 *  • Driven by Supabase Realtime INSERT subscription on the notifications table.
 *  • Mobile-only (md:hidden). Does NOT replace Layers 1 or 2.
 */
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');

  // Group key: used for VISUAL GROUPING in the shade only — not for `tag`
  const DTCE_GROUP_KEY = 'dtce-notifications';

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
      // Support both flat and nested payload shapes from the server
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
      // Count existing DTCE alerts in the shade (for badge number + summary text)
      let existingNotifs = [];
      try {
        const all = await self.registration.getNotifications();
        // Only count individual alerts, not the summary card itself
        existingNotifs = all.filter(n =>
          n.data && n.data.group === DTCE_GROUP_KEY && !n.data.isSummary
        );
      } catch (_) {}

      const stackedCount = existingNotifs.length + 1; // +1 for incoming alert
      const badgeCount = Math.max(unreadCount, stackedCount);

      // Update PWA home screen icon badge number
      if ('setAppBadge' in self.navigator) {
        try { await self.navigator.setAppBadge(badgeCount); } catch (_) {}
      }

      // ── LAYER 1: Individual notification with UNIQUE tag ──────────────────
      //
      // ⚠️  CRITICAL RULE: The `tag` must be UNIQUE per notification.
      //
      //  SHARED tag   → Android silently replaces the existing notification
      //                  → NO floating banner on home screen / lock screen ❌
      //
      //  UNIQUE tag   → Android treats this as a brand-new notification
      //                  → OS fires the Heads-Up drop-down banner on home screen ✅
      //                  → Alert appears on lock screen ✅
      //                  → Works whether app is open, closed, or screen is locked ✅
      //
      // The `group` field (separate from `tag`) handles visual grouping in the shade.
      // ─────────────────────────────────────────────────────────────────────────
      const uniquePerAlertTag = notificationId
        ? `dtce-alert-${notificationId}`
        : `dtce-alert-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      try {
        await self.registration.showNotification(data.title, {
          body: data.body,
          icon: '/icon-192.png',              // DTCE logo on left side of every alert card
          badge: '/notification-badge.png',   // Monochrome DTCE icon in the status bar
          tag: uniquePerAlertTag,             // ✅ UNIQUE per alert → fires OS Heads-Up banner
          group: DTCE_GROUP_KEY,              // ✅ Groups alerts under one DTCE header in shade
          renotify: true,                     // Always trigger alert sound/vibration
          vibrate: [300, 100, 300, 100, 300], // Strong pattern → Android Heads-Up priority signal
          silent: false,                      // Must be false → enables OS Heads-Up display
          requireInteraction: false,          // Auto-dismiss after OS timeout (like WhatsApp)
          timestamp: Date.now(),
          data: {
            url: data.data?.url || '/dashboard',
            notificationId,                   // Preserved for deep-link click routing
            group: DTCE_GROUP_KEY,
            unreadCount: badgeCount,
            isSummary: false,
          },
          actions: [
            { action: 'open', title: '📋 Open DTCE App' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        });
      } catch (err) {
        console.error('[SW] showNotification failed:', err);
      }

    })()
  );
});

// Notification Click Event — Open or Focus Window Tab
self.addEventListener('notificationclick', event => {
  event.notification.close();

  // Dismiss action — just close, no navigation
  if (event.action === 'dismiss') return;

  // Group summary click → open dashboard (shows all notifications)
  const isSummary = event.notification.data?.isSummary;
  let targetUrl = isSummary ? '/dashboard' : (event.notification.data?.url || '/dashboard');

  // Replace legacy domain with live production domain if present
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
          // Tell the open tab to mark this notification as read
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
    // Test notification uses a unique tag so it also fires a Heads-Up banner
    self.registration.showNotification('DTCE Reports — Test', {
      body: 'Push notifications are working correctly on this device!',
      icon: '/icon-192.png',
      badge: '/notification-badge.png',
      tag: 'dtce-test-push-' + Date.now(),
      vibrate: [300, 100, 300],
      silent: false,
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
