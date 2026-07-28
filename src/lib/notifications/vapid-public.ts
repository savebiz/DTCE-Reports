/**
 * vapid-public.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser-safe VAPID public key export.
 * 
 * IMPORTANT: This file is intentionally kept separate from webpush.ts because
 * webpush.ts imports `web-push` (a Node.js-only library) which cannot be
 * bundled into client-side code.
 * 
 * Client components (floating-notification-prompt, push-permission-banner,
 * settings page) should import getVapidPublicKey from HERE, not from webpush.ts
 */

/** Returns the VAPID public key for browser-side push subscription creation. */
export function getVapidPublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    'BC1ljedeaEQLd87ukaIzffZ-bvq0Sr5OuCPkssZhIN4W4XsIRMp_4OvirIlBEIG8fISJ62KkigwaOzGl4Jibgqg'
  )
}
