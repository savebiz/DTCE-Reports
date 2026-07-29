/**
 * webpush.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Web Push notification dispatch using the `web-push` library.
 * This module is server-side only (Next.js API routes / Server Actions).
 * Marked as external in next.config.ts via serverExternalPackages.
 */

// ── VAPID Configuration ───────────────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY  || 'BC1ljedeaEQLd87ukaIzffZ-bvq0Sr5OuCPkssZhIN4W4XsIRMp_4OvirIlBEIG8fISJ62KkigwaOzGl4Jibgqg'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'mUnGJ4DJ5ROCIvoWkghbMsS8XhulGIJub-UYnNr4_JY'
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:notifications@dtce.org'

function getWebPushModule(): any {
  try {
    const wp = require('web-push')
    if (wp && typeof wp.setVapidDetails === 'function') {
      wp.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    }
    return wp
  } catch (err) {
    console.warn('[WebPush] web-push module not loaded at runtime:', err)
    return null
  }
}

// ── Type Exports ──────────────────────────────────────────────────────────────
export interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

export interface PushSubscriptionObj {
  endpoint: string
  keys: PushSubscriptionKeys
}

export interface VapidKeys {
  publicKey: string
  privateKey: string
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the VAPID public key (sent to browser for push subscription) */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC
}

/** Generates a fresh VAPID key pair (for initial setup / key rotation) */
export function generateVapidKeys(): VapidKeys {
  const wp = getWebPushModule()
  if (wp) {
    return wp.generateVAPIDKeys()
  }
  return { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE }
}

/**
 * Sends a Web Push notification to a single browser push endpoint.
 * Uses the `web-push` library which handles:
 *  - VAPID JWT signing (RFC 8292)
 *  - Payload encryption (RFC 8291 aes128gcm)
 *  - Content-Encoding headers
 */
export async function sendWebPushNotification(
  subscription: PushSubscriptionObj,
  payload: { title: string; body: string; icon?: string; url?: string; tag?: string; unreadCount?: number; notificationId?: string }
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const wp = getWebPushModule()
    if (!wp) {
      console.warn('[WebPush] web-push module unavailable at runtime')
      return { success: false, error: 'web-push module not installed' }
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth:   subscription.keys.auth,
      },
    }

    const payloadString = JSON.stringify({
      title:  payload.title,
      body:   payload.body,
      icon:   '/icon-192.png', // Always use official DTCE icon
      badge:  '/notification-badge.png',
      unreadCount: payload.unreadCount || 1,
      notificationId: payload.notificationId || null, // For deep-link routing in SW click handler
      group: 'dtce-notifications', // Android notification channel group key
      data: {
        url: payload.url || '/dashboard',
        notificationId: payload.notificationId || null,
        group: 'dtce-notifications',
        unreadCount: payload.unreadCount || 1,
      },
    })

    const result = await wp.sendNotification(pushSubscription, payloadString, {
      urgency: 'high',
      TTL: 86400, // 24 hours — messages persist until device comes online
      headers: {
        'Urgency': 'high',
        'Topic': 'dtce-alerts',
      },
    })

    return { success: true, status: result.statusCode }
  } catch (err: any) {
    const status: number | undefined = err?.statusCode || err?.status
    console.error('[WebPush] Dispatch error:', err?.message || err)

    return { success: false, status, error: err?.message || 'Unknown error' }
  }
}
