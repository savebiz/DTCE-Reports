'use client'

import { useEffect, useRef } from 'react'
import { getClient, isMock } from '@/utils/supabase'

export interface RealtimeSubscriptionFilter {
  table: string
  schema?: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  filter?: string
}

export interface UseRealtimeSubscriptionOptions {
  /** Unique channel name or key for identification & debugging */
  channelName: string
  /** Array of Postgres subscription filters */
  subscriptions: RealtimeSubscriptionFilter[]
  /** Callback fired when a matching change event occurs (coalesced/debounced) */
  onDataChange: (payload?: any) => void
  /** Debounce delay in ms (default: 300ms) to coalesce rapid updates */
  debounceMs?: number
  /** Whether the subscription is enabled (default: true) */
  enabled?: boolean
}

/**
 * Platform-wide reusable Supabase Realtime subscription hook.
 *
 * Features:
 * 1. Scoped Postgres change event subscriptions (INSERT/UPDATE/DELETE).
 * 2. Coalesces rapid successive change events to prevent refetch storms (300ms debounce).
 * 3. Handles automatic recovery on page visibility change (mobile app backgrounding/wakeup).
 * 4. Ensures strict connection cleanup on component unmount or config changes.
 * 5. Supports both production Supabase Realtime and mock fallback environment.
 */
export function useRealtimeSubscription({
  channelName,
  subscriptions,
  onDataChange,
  debounceMs = 300,
  enabled = true,
}: UseRealtimeSubscriptionOptions) {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const callbackRef = useRef(onDataChange)

  // Always point to latest callback to prevent stale closures while preserving subscription lifecycle
  useEffect(() => {
    callbackRef.current = onDataChange
  }, [onDataChange])

  // Serialize subscriptions config for stable comparison in dependency array
  const subscriptionsKey = JSON.stringify(subscriptions)

  useEffect(() => {
    if (!enabled) return

    // Coalesced callback trigger
    const triggerDataChange = (payload?: any) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        callbackRef.current(payload)
      }, debounceMs)
    }

    // 1. Mobile App & Background/Foreground Catch-up Listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 2. Handle Mock Environment
    if (isMock) {
      const handleMockChangeEvent = (e: Event) => {
        const customEvt = e as CustomEvent
        const changeTable = customEvt.detail?.table
        if (subscriptions.some(s => s.table === changeTable || s.table === '*')) {
          triggerDataChange(customEvt.detail)
        }
      }

      window.addEventListener('dtce_mock_data_change', handleMockChangeEvent)

      return () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('dtce_mock_data_change', handleMockChangeEvent)
      }
    }

    // 3. Real Supabase Realtime Subscription Setup
    const supabase = getClient()
    const channel = supabase.channel(channelName)

    subscriptions.forEach(sub => {
      const config: any = {
        event: sub.event || '*',
        schema: sub.schema || 'public',
        table: sub.table,
      }
      if (sub.filter) {
        config.filter = sub.filter
      }

      channel.on('postgres_changes', config, (payload: any) => {
        triggerDataChange(payload)
      })
    })

    channel.subscribe()

    // 4. Cleanup Channel on Unmount or Config Change
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      supabase.removeChannel(channel)
    }
  }, [channelName, subscriptionsKey, debounceMs, enabled])
}
