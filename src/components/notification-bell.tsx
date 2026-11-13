'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Package, FileText, AlertTriangle, ExternalLink } from 'lucide-react'
import { getClient, isMock, store } from '@/utils/supabase'
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription'
import { showToast } from '@/components/ui/toast'

import { triggerHaptic, playNotificationChime } from '@/utils/haptics'

export interface NotificationItem {
  id: string
  recipient_id: string
  type: string
  title: string
  body: string
  related_entity_type?: string
  related_entity_id?: string
  read: boolean
  created_at: string
}

export function NotificationBell({ userId }: { userId?: string }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const prevUnreadRef = useRef<number | null>(null)

  // Haptic, audio chime, and PWA app icon badge update when unread count changes
  useEffect(() => {
    if (prevUnreadRef.current !== null && unreadCount > prevUnreadRef.current) {
      triggerHaptic('notification')
      playNotificationChime()
    }
    prevUnreadRef.current = unreadCount

    // Update PWA home screen app icon notification badge (WhatsApp / Outlook style)
    if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      if (unreadCount > 0) {
        navigator.setAppBadge(unreadCount).catch(() => {})
      } else {
        navigator.clearAppBadge().catch(() => {})
      }
    }
  }, [unreadCount])

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    if (isMock) {
      const allLogs = store.notificationLogs || []
      const userNotifs = allLogs.filter((n: any) => n.recipient_id === userId || !n.recipient_id)
      setNotifications(userNotifs)
      setUnreadCount(userNotifs.filter((n: any) => !n.read).length)
      setLoading(false)
      return
    }

    const supabase: any = getClient()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter((n: NotificationItem) => !n.read).length)
    }
    setLoading(false)
  }, [userId])

  // Shared Realtime Subscription scoped to current user's notifications
  useRealtimeSubscription({
    channelName: `notifications-user-${userId}`,
    subscriptions: [
      {
        table: 'notifications',
        filter: userId ? `recipient_id=eq.${userId}` : undefined,
      },
    ],
    onDataChange: () => fetchNotifications(),
    enabled: !!userId,
  })

  useEffect(() => {
    if (!userId) return
    fetchNotifications()

    // Outside Click Listener to Close Dropdown Panel
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [userId, fetchNotifications])

  const markAsRead = async (notif: NotificationItem) => {
    triggerHaptic('medium')
    setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, read: true } : n)))
    setUnreadCount(prev => Math.max(0, prev - 1))

    if (!isMock) {
      const supabase: any = getClient()
      await supabase.from('notifications').update({ read: true }).eq('id', notif.id)
    } else {
      const logs = store.notificationLogs
      store.notificationLogs = logs.map((n: any) => (n.id === notif.id ? { ...n, read: true } : n))
    }

    setIsOpen(false)

    // Role and Department context check for interactive click action
    const supabase: any = getClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('role, department_id').eq('id', user?.id || userId).maybeSingle()

    const role = prof?.role || user?.user_metadata?.role || 'hod'
    const deptId = prof?.department_id || user?.user_metadata?.department_id || ''

    const isAdminRole = role === 'super_admin' || role === 'coordinator' || role === 'national_coordinator'
    
    let isStoresDept = deptId === 'dept-29'
    if (!isStoresDept && deptId && !isMock) {
      const { data: deptData } = await supabase.from('departments').select('name').eq('id', deptId).maybeSingle()
      if (deptData?.name?.toLowerCase().includes('store')) isStoresDept = true
    }

    if (isAdminRole) {
      // Executive / Oversight roles: route directly to Store Requisitions Console
      router.push(`/dashboard/store-requisitions?id=${notif.related_entity_id || ''}`)
    } else if (isStoresDept) {
      // Stores Department: route directly to Fulfillment Console
      router.push(`/my-department/store-fulfillment?id=${notif.related_entity_id || ''}`)
    } else {
      // HOD Departments: display detail toast popup (no further action required)
      showToast(`${notif.title}: ${notif.body}`, 'info')
    }
  }

  const markAllAsRead = async () => {
    triggerHaptic('success')
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)

    if (!isMock && userId) {
      const supabase: any = getClient()
      await supabase.from('notifications').update({ read: true }).eq('recipient_id', userId).eq('read', false)
    } else {
      const logs = store.notificationLogs
      store.notificationLogs = logs.map((n: any) => ({ ...n, read: true }))
    }
  }

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
      if (diffSec < 60) return 'Just now'
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
      return `${Math.floor(diffSec / 86400)}d ago`
    } catch {
      return 'Recently'
    }
  }

  if (!userId) return null

  return (
    <div className="relative inline-block" ref={panelRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => {
          triggerHaptic('light')
          setIsOpen(prev => !prev)
          if (!isOpen) fetchNotifications()
        }}
        className="relative flex items-center justify-center h-9 w-9 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors focus:outline-none cursor-pointer"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-500 text-[10px] font-extrabold text-white shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl backdrop-blur-xl z-[120] overflow-hidden animate-fade-in-up"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/25">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline transition-colors cursor-pointer"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification Items List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/60 scrollbar-thin">
            {loading && notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center space-y-1 px-4">
                <Bell size={24} className="mx-auto text-muted-foreground opacity-40" />
                <p className="text-xs font-medium text-foreground">No notifications yet</p>
                <p className="text-[11px] text-muted-foreground">You're all caught up with your operational alerts.</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => markAsRead(n)}
                  className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-accent/50 ${
                    !n.read ? 'bg-blue-500/[0.06]' : 'bg-transparent'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {n.type.includes('requisition') ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/12 text-amber-700 dark:text-amber-400 border border-amber-500/25">
                        <Package size={14} />
                      </span>
                    ) : n.type.includes('stale') ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/12 text-red-700 dark:text-red-400 border border-red-500/25">
                        <AlertTriangle size={14} />
                      </span>
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/12 text-blue-700 dark:text-blue-400 border border-blue-500/25">
                        <FileText size={14} />
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className={`text-xs truncate ${!n.read ? 'font-bold text-foreground' : 'font-semibold text-foreground/80'}`}>
                        {n.title}
                      </h5>
                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                        {formatRelativeTime(n.created_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-snug">
                      {n.body}
                    </p>
                  </div>

                  {!n.read && (
                    <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
