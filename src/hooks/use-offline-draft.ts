'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * useOfflineDraft
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides offline-first draft saving for any form.
 * - Auto-saves form state to localStorage (debounced, no network required)
 * - Detects online/offline transitions via native browser events
 * - Queues a "pending sync" payload when the user submits while offline
 * - Fires a `dtce-sync-flush` CustomEvent when connectivity returns so
 *   the form component can auto-submit the queued payload
 * - Registers a Service Worker Background Sync tag as a secondary safety net
 */
export function useOfflineDraft<T extends Record<string, any>>(draftKey: string) {
  const [isOnline, setIsOnline] = useState(true)
  const [draftSaved, setDraftSaved] = useState(false)
  const [hasPendingSync, setHasPendingSync] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Flush any pending offline submission when we come back online ──────────
  const flushPendingSync = useCallback(async () => {
    const raw = localStorage.getItem(`dtce_pending_${draftKey}`)
    if (!raw) return
    try {
      const { payload } = JSON.parse(raw)
      window.dispatchEvent(
        new CustomEvent('dtce-sync-flush', { detail: { key: draftKey, payload } })
      )
    } catch (_) {}
  }, [draftKey])

  // ── Network status listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsOnline(navigator.onLine)

    // Check for any pre-existing pending payload from a previous session
    const pending = localStorage.getItem(`dtce_pending_${draftKey}`)
    if (pending) setHasPendingSync(true)

    const handleOnline = () => {
      setIsOnline(true)
      flushPendingSync()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [draftKey, flushPendingSync])

  // ── Load a previously saved draft ─────────────────────────────────────────
  const loadDraft = useCallback((): T | null => {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(`dtce_draft_${draftKey}`)
      if (stored) return JSON.parse(stored) as T
    } catch (_) {}
    return null
  }, [draftKey])

  // ── Save draft (debounced 800ms) ───────────────────────────────────────────
  const saveDraft = useCallback((data: T) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(`dtce_draft_${draftKey}`, JSON.stringify(data))
        setDraftSaved(true)
        if (draftSavedTimerRef.current) clearTimeout(draftSavedTimerRef.current)
        draftSavedTimerRef.current = setTimeout(() => setDraftSaved(false), 2500)
      } catch (_) {}
    }, 800)
  }, [draftKey])

  // ── Clear draft + pending payload after confirmed submission ──────────────
  const clearDraft = useCallback(() => {
    localStorage.removeItem(`dtce_draft_${draftKey}`)
    localStorage.removeItem(`dtce_pending_${draftKey}`)
    setHasPendingSync(false)
  }, [draftKey])

  // ── Queue payload for sync when user submits while offline ────────────────
  const queueForSync = useCallback((payload: any) => {
    try {
      localStorage.setItem(
        `dtce_pending_${draftKey}`,
        JSON.stringify({ payload, queuedAt: new Date().toISOString() })
      )
      setHasPendingSync(true)

      // Register Background Sync tag (second safety-net via Service Worker)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            if ('sync' in reg) {
              ;(reg as any).sync
                .register(`dtce-daily-log-sync-${draftKey}`)
                .catch(() => {})
            }
          })
          .catch(() => {})
      }
    } catch (_) {}
  }, [draftKey])

  // ── Retrieve the queued pending payload (used by component on flush) ──────
  const getPendingPayload = useCallback((): any | null => {
    try {
      const raw = localStorage.getItem(`dtce_pending_${draftKey}`)
      if (raw) return JSON.parse(raw).payload
    } catch (_) {}
    return null
  }, [draftKey])

  return {
    isOnline,
    draftSaved,
    hasPendingSync,
    loadDraft,
    saveDraft,
    clearDraft,
    queueForSync,
    getPendingPayload,
    flushPendingSync,
  }
}
