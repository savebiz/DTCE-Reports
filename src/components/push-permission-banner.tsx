'use client'

import React, { useEffect, useState } from 'react'
import { Bell, Sparkles, X, Smartphone, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    throw new Error('VAPID public key encoding error. Please verify VAPID key.')
  }
}

export function PushPermissionBanner({ userId }: { userId?: string }) {
  const [showBanner, setShowBanner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [isMobileDevice, setIsMobileDevice] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

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

    // Check if user already enabled push on this device
    const isAlreadySubscribed = localStorage.getItem('dtce_push_subscribed') === 'true'
    if (isAlreadySubscribed) {
      setSubscribed(true)
      setShowBanner(false)
      return
    }

    // Check dismiss memory (7 days)
    const dismissedTime = localStorage.getItem('dtce_push_banner_dismissed')
    if (dismissedTime) {
      const diffDays = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 3600 * 24)
      if (diffDays < 7) {
        return
      }
    }

    // Check browser Push Notification API support
    const isSupported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window

    if (!isSupported) return

    // If permission already granted, check active subscription or save subscribed state
    if (Notification.permission === 'granted') {
      localStorage.setItem('dtce_push_subscribed', 'true')
      setSubscribed(true)
      setShowBanner(false)
    } else if (Notification.permission === 'default') {
      setShowBanner(true)
    }
  }, [])

  const handleEnablePush = async () => {
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
        setShowBanner(false)
        return
      }

      const reg = await navigator.serviceWorker.ready
      const vapidPublic = getVapidPublicKey()

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublic) as unknown as BufferSource
        })
      }

      // Save subscription to server
      let currentProfileId: string | null = null
      try {
        const supabase = getClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) currentProfileId = user.id
      } catch (_) {}

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
        await reg.showNotification('DTCE Reports', {
          body: 'Notifications enabled! You\'ll now receive alerts even when the app is closed.',
          icon: '/icon-192.png',
          badge: '/notification-badge.png',
          tag: 'dtce-test-notification',
        } as NotificationOptions)
      } catch (_) { /* test notification is non-critical */ }

      showToast('Background alerts enabled!', 'success')
      setSubscribed(true)
      setShowBanner(false)
    } catch (err: any) {
      console.error('[PushBanner] Enable failed:', err)
      showToast(`Alert setup failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    triggerHaptic('light')
    localStorage.setItem('dtce_push_banner_dismissed', Date.now().toString())
    setShowBanner(false)
  }

  if (!showBanner || subscribed) return null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-xl transition-all animate-fade-in-up">
      {/* Background ambient glow */}
      <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-inner">
            <Bell className="h-5 w-5 animate-pulse" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">
                Enable {isMobileDevice ? 'Mobile' : 'Desktop'} Background Alerts
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                Recommended
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
              Get instant alerts for Store Requisitions &amp; Department Reports {isMobileDevice ? 'on your lock screen, even when the DTCE App is closed or your phone is locked.' : 'on your desktop, even when you\'re in another tab or browser.'}
            </p>

            {/* Special iOS Guidance note if on iPhone outside standalone PWA */}
            {isIos && !isStandalone && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-300 bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
                <Smartphone className="h-4 w-4 text-blue-400 shrink-0" />
                <span>
                  <strong>iPhone Note:</strong> Tap <strong>Share</strong> ➔ <strong>Add to Home Screen</strong> first to receive background alerts on iOS.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <Button
            size="sm"
            onClick={handleEnablePush}
            disabled={loading}
            className="h-9 px-4 text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 cursor-pointer flex items-center gap-1.5"
          >
            <Bell className="h-3.5 w-3.5" />
            {loading ? 'Setting up...' : 'Enable Alerts in 1-Click'}
          </Button>

          <button
            onClick={handleDismiss}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Dismiss notification prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
