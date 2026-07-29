'use client'

/**
 * InAppNotificationToast
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating on-screen heads-up notification banner — MOBILE ONLY (md:hidden).
 *
 * Behaviour (identical to WhatsApp/Telegram floating banner):
 * - Slides down from the top of the screen when a new notification arrives
 *   while the user has the app open in the foreground.
 * - Shows DTCE logo + notification title + body text.
 * - Auto-dismisses after 5 seconds.
 * - Tappable to navigate to the notification's target URL.
 * - Swipe-up to dismiss early.
 *
 * Data source: Supabase Realtime subscription on the `notifications` table,
 * filtered to the current authenticated user's unread rows.
 * This does NOT affect or replace the existing push notification pipeline.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface ToastNotification {
  id: string
  title: string
  body: string
  url: string
  created_at: string
}

export function InAppNotificationToast() {
  const [queue, setQueue] = useState<ToastNotification[]>([])
  const [current, setCurrent] = useState<ToastNotification | null>(null)
  const [visible, setVisible] = useState(false)
  const [touchStartY, setTouchStartY] = useState<number | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  // Pop the next notification from the queue when the current one disappears
  useEffect(() => {
    if (!current && queue.length > 0) {
      const [next, ...rest] = queue
      setQueue(rest)
      setCurrent(next)
      // Small delay before showing so animation triggers correctly
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    }
  }, [current, queue])

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!current) return
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    dismissTimer.current = setTimeout(() => dismiss(), 5000)
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current) }
  }, [current])

  const dismiss = useCallback(() => {
    setVisible(false)
    setTimeout(() => setCurrent(null), 350) // Wait for slide-out animation
  }, [])

  const handleTap = useCallback(() => {
    if (!current) return
    dismiss()
    const url = current.url || '/dashboard'
    router.push(url)
  }, [current, dismiss, router])

  // Swipe up to dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY)
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return
    const deltaY = touchStartY - e.changedTouches[0].clientY
    if (deltaY > 40) dismiss() // Swipe up ≥ 40px → dismiss
    setTouchStartY(null)
  }

  // Subscribe to Supabase Realtime for new notifications on this user
  useEffect(() => {
    let userId: string | null = null
    let channel: ReturnType<typeof supabase.channel> | null = null
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return
      userId = data.user.id

      channel = supabase
        .channel('dtce-in-app-toast')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as any
            if (!row) return

            // Determine deep-link URL from notification type
            let targetUrl = '/dashboard'
            if (row.related_entity_type === 'requisition' && row.related_entity_id) {
              targetUrl = `/dashboard/store-requisitions?id=${row.related_entity_id}`
            }

            const toast: ToastNotification = {
              id: row.id || `toast-${Date.now()}`,
              title: row.title || 'DTCE Reports',
              body: row.body || 'New notification',
              url: targetUrl,
              created_at: row.created_at || new Date().toISOString(),
            }

            setQueue(prev => [...prev, toast])
          }
        )
        .subscribe()
    })

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Mobile-only: don't render on ≥md screens
  // (The desktop notification bell icon handles it there)
  if (!current) return null

  return (
    <div
      className="md:hidden fixed top-0 left-0 right-0 z-[9999] pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="pointer-events-auto mx-3 mt-3"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(-110%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0, 0.2, 1)',
          willChange: 'transform',
        }}
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="alert"
      >
        <div
          className="flex items-start gap-3 rounded-2xl p-3.5 shadow-2xl"
          style={{
            background: 'rgba(15, 26, 46, 0.97)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(245,158,11,0.1)',
          }}
        >
          {/* DTCE Logo */}
          <div className="flex-shrink-0 relative w-10 h-10 rounded-xl overflow-hidden bg-[#0f172a] border border-white/10">
            <Image
              src="/dtce-logo.png"
              alt="DTCE"
              fill
              className="object-contain p-1"
              priority
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p
                className="text-[13px] font-bold text-white truncate"
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
              >
                {current.title}
              </p>
              <span className="text-[10px] text-amber-400/70 flex-shrink-0">
                now
              </span>
            </div>
            <p
              className="text-[12px] text-slate-300/90 mt-0.5 line-clamp-2 leading-snug"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
            >
              {current.body}
            </p>
          </div>

          {/* Dismiss button */}
          <button
            className="flex-shrink-0 self-start text-slate-500 hover:text-slate-300 transition-colors p-0.5"
            onClick={(e) => { e.stopPropagation(); dismiss() }}
            aria-label="Dismiss notification"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Progress bar — shows countdown to auto-dismiss */}
        <div
          className="mx-4 h-0.5 rounded-full mt-1"
          style={{
            background: 'rgba(245,158,11,0.3)',
            overflow: 'hidden',
          }}
        >
          <div
            className="h-full rounded-full bg-amber-400"
            style={{
              animation: visible ? 'dtce-toast-progress 5s linear forwards' : 'none',
            }}
          />
        </div>
      </div>

      {/* CSS animation keyframes (injected inline — no external stylesheet needed) */}
      <style>{`
        @keyframes dtce-toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  )
}
