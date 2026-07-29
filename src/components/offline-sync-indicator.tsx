'use client'

import React, { useEffect, useState } from 'react'
import { WifiOff, RefreshCw, CheckCircle2, CloudUpload } from 'lucide-react'
import { showToast } from '@/components/ui/toast'

export function OfflineSyncIndicator() {
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [queuedCount, setQueuedCount] = useState<number>(0)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [showSyncedToast, setShowSyncedToast] = useState<boolean>(false)

  // Calculate total offline queued items across storage keys
  const calculateQueue = () => {
    if (typeof window === 'undefined') return 0
    try {
      const logs = JSON.parse(localStorage.getItem('dtce_pending_logs') || '[]')
      const reqs = JSON.parse(localStorage.getItem('dtce_pending_store_requests') || '[]')
      const queue = JSON.parse(localStorage.getItem('dtce_offline_queue') || '[]')
      const count = (Array.isArray(logs) ? logs.length : 0) +
                    (Array.isArray(reqs) ? reqs.length : 0) +
                    (Array.isArray(queue) ? queue.length : 0)
      setQueuedCount(count)
      return count
    } catch (_) {
      return 0
    }
  }

  // Auto-sync queued items when connection is restored
  const performAutoSync = async () => {
    const totalToSync = calculateQueue()
    if (totalToSync === 0) return

    setIsSyncing(true)

    try {
      // 1. Sync pending daily logs
      const rawLogs = localStorage.getItem('dtce_pending_logs')
      if (rawLogs) {
        const logs = JSON.parse(rawLogs)
        if (Array.isArray(logs) && logs.length > 0) {
          for (const item of logs) {
            try {
              await fetch('/api/daily-log/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item),
              })
            } catch (_) {}
          }
          localStorage.removeItem('dtce_pending_logs')
        }
      }

      // 2. Sync pending store requests
      const rawReqs = localStorage.getItem('dtce_pending_store_requests')
      if (rawReqs) {
        const reqs = JSON.parse(rawReqs)
        if (Array.isArray(reqs) && reqs.length > 0) {
          for (const item of reqs) {
            try {
              await fetch('/api/inventory/submit-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item),
              })
            } catch (_) {}
          }
          localStorage.removeItem('dtce_pending_store_requests')
        }
      }

      // 3. Clear generic queue
      localStorage.removeItem('dtce_offline_queue')

      calculateQueue()
      setShowSyncedToast(true)
      showToast(`Successfully synced ${totalToSync} offline report(s) with DTCE Server!`, 'success')
      setTimeout(() => setShowSyncedToast(false), 5000)
    } catch (err: any) {
      console.warn('[OfflineSync] Sync error:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    setIsOnline(navigator.onLine)
    calculateQueue()

    const handleOnline = () => {
      setIsOnline(true)
      performAutoSync()
    }

    const handleOffline = () => {
      setIsOnline(false)
      calculateQueue()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    const interval = setInterval(() => calculateQueue(), 3000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [])

  if (isOnline && queuedCount === 0 && !showSyncedToast) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[9999] animate-fade-in-up">
      {!isOnline ? (
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-amber-950/90 border border-amber-500/40 text-amber-200 shadow-2xl backdrop-blur-xl">
          <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            <WifiOff size={18} className="text-amber-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
              <span>Offline Mode Active</span>
            </p>
            <p className="text-[11px] text-amber-200/80 truncate mt-0.5">
              {queuedCount > 0
                ? `${queuedCount} report(s) queued offline — will sync automatically when back online`
                : 'Entries are saved locally & will send the moment you are back online'}
            </p>
          </div>
        </div>
      ) : isSyncing ? (
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-blue-950/90 border border-blue-500/40 text-blue-200 shadow-2xl backdrop-blur-xl">
          <div className="h-9 w-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
            <RefreshCw size={18} className="text-blue-400 animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">
              Reconnected! Syncing Data...
            </p>
            <p className="text-[11px] text-blue-200/80 truncate mt-0.5">
              Uploading queued reports to DTCE Operations Server
            </p>
          </div>
        </div>
      ) : showSyncedToast ? (
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 shadow-2xl backdrop-blur-xl">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
              Sync Complete
            </p>
            <p className="text-[11px] text-emerald-200/80 truncate mt-0.5">
              All offline reports have been safely uploaded
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
