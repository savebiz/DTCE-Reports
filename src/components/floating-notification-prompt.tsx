'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, X, Smartphone } from 'lucide-react'
import { showToast } from '@/components/ui/toast'
import { triggerHaptic } from '@/utils/haptics'
import { getVapidPublicKey } from '@/lib/notifications/vapid-public'
import { getClient } from '@/utils/supabase'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  try {
    const cleanStr = (base64String || '').trim()
    const padding = '='.repeat((4 - (cleanStr.length % 4)) % 4)
    const base64 = (cleanStr + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  } catch (err: any) {
    console.error('Invalid VAPID key base64 encoding:', err)
    throw new Error('VAPID public key encoding error.')
  }
}

export function FloatingNotificationPrompt() {
  const pathname = usePathname()
  const [showPrompt, setShowPrompt] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isMobileDevice, setIsMobileDevice] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ── Route guard: only show on authenticated app pages ─────────────────
    const authRoutes = ['/', '/login', '/reset-password']
    if (!pathname || authRoutes.some(r => pathname === r || pathname.startsWith('/login'))) return

    // ── Password change guard: don't prompt before first password reset ───
    const mustChangePw = localStorage.getItem('dtce_must_change_password')
    if (mustChangePw === 'true') return

    // Detect iOS & Standalone PWA state
    const userAgent = window.navigator.userAgent.toLowerCase()
    const iosDevice = /iphone|ipad|ipod/.test(userAgent)
    const mobileDevice = /mobile|android|iphone|ipad|ipod|webos|blackberry|opera mini|iemobile/.test(userAgent) || window.innerWidth < 640
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    setIsIos(iosDevice)
    setIsMobileDevice(mobileDevice)
    setIsStandalone(standaloneMode)

    // Check browser Push Notification API support
    const isSupported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window

    if (!isSupported) return

    // Check if permission already granted or explicitly denied
    if (Notification.permission !== 'default') {
      return
    }

    // Check dismiss memory (7 days)
    const dismissedTime = localStorage.getItem('dtce_desktop_notify_dismissed')
    if (dismissedTime) {
      const diffDays = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 3600 * 24)
      if (diffDays < 7) {
        return
      }
    }

    // Show prompt after a smooth 1.5 second delay
    const timer = setTimeout(() => {
      setShowPrompt(true)
    }, 1500)

    return () => clearTimeout(timer)
  }, [])

  const handleAllowNotifications = async () => {
    triggerHaptic('medium')
    setLoading(true)

    try {
      if (!('Notification' in window)) {
        throw new Error('Notifications are not supported by this browser.')
      }

      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        showToast('Notification permission was declined.', 'warning')
        setLoading(false)
        setShowPrompt(false)
        return
      }

      const reg = await navigator.serviceWorker.ready
      const vapidPublic = getVapidPublicKey()

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublic) as unknown as BufferSource,
        })
      }

      // Fetch profile ID to bind subscription
      let currentProfileId: string | null = null
      try {
        const supabase = getClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) currentProfileId = user.id
      } catch (_) {}

      // Save subscription to server
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          profileId: currentProfileId,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to register subscription with server')
      }

      triggerHaptic('success')
      localStorage.setItem('dtce_push_subscribed', 'true')

      // Fire a local test notification so user gets immediate visual proof
      try {
        const reg = await navigator.serviceWorker.ready
        await reg.showNotification('DTCE Reports', {
          body: 'Notifications enabled! You\'ll now receive alerts even when the app is closed.',
          icon: '/icon-192.png',
          badge: '/notification-badge.png',
          tag: 'dtce-test-notification',
        } as NotificationOptions)
      } catch (_) { /* test notification is non-critical */ }

      showToast('System notifications enabled successfully!', 'success')
      setShowPrompt(false)
    } catch (err: any) {
      console.error('[FloatingPrompt] Enable failed:', err)
      showToast(`Alert setup failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    triggerHaptic('light')
    localStorage.setItem('dtce_desktop_notify_dismissed', Date.now().toString())
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  return (
    <aside
      role="region"
      aria-label="Notification Permission Prompt"
      className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:right-6 sm:left-auto z-[80] w-auto sm:w-[390px] max-w-[calc(100vw-2rem)] rounded-2xl sm:rounded-3xl border border-blue-500/30 bg-[#0B1726]/96 p-4 sm:p-5 text-slate-100 shadow-2xl shadow-blue-500/15 backdrop-blur-2xl transition-all animate-fade-in-up"
      style={{
        boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 24px rgba(59,130,246,0.15)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          {/* Bell Icon Pill */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Bell className="h-4 w-4 animate-pulse" />
          </div>
          <h3 className="text-sm font-bold text-slate-100 tracking-tight leading-snug">
            Receive {isMobileDevice ? 'mobile' : 'desktop'} notifications from DTCE Reports
          </h3>
        </div>

        {/* Close X Button */}
        <button
          onClick={handleDismiss}
          className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          title="Dismiss notification prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-4 pl-1">
        Allowing notifications lets DTCE Reports alert you about store requisitions, daily report submissions, and critical operational updates {isMobileDevice ? 'even when your phone is locked or the app is closed.' : 'even when you\u0027re in another tab or browser.'}
      </p>

      {/* iOS Special Note */}
      {isIos && !isStandalone && (
        <div className="mb-3 flex items-center gap-2 text-[11px] text-blue-300 bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20">
          <Smartphone className="h-4 w-4 text-blue-400 shrink-0" />
          <span>
            <strong>iPhone Note:</strong> Tap <strong>Share</strong> ➔ <strong>Add to Home Screen</strong> first to receive background alerts on iOS.
          </span>
        </div>
      )}

      {/* Action Buttons (Not Now & Allow Notifications) */}
      <div className="flex items-center justify-end gap-2.5 pt-1">
        <button
          onClick={handleDismiss}
          className="text-xs font-semibold text-slate-400 hover:text-slate-100 px-3 py-2 rounded-lg transition-colors cursor-pointer"
        >
          Not now
        </button>

        <button
          onClick={handleAllowNotifications}
          disabled={loading}
          className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-full transition-all shadow-md shadow-blue-600/30 cursor-pointer disabled:opacity-50"
        >
          {loading ? 'Enabling...' : 'Allow notifications'}
        </button>
      </div>
    </aside>
  )
}
