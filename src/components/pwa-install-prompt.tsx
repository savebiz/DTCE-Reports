'use client'

import React, { useEffect, useState } from 'react'
import { Share, PlusSquare, X, Smartphone } from 'lucide-react'

export function PwaInstallPrompt() {
  const [showIosPrompt, setShowIosPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showAndroidBanner, setShowAndroidBanner] = useState(false)

  useEffect(() => {
    // 1. Detect if running in standalone mode (already installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as any).standalone === true)

    if (isStandalone) {
      return // Don't show install hints if already installed as PWA
    }

    // 2. iOS Detection & Storage Check
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIos = /iphone|ipad|ipod/.test(userAgent)
    const isSafari = isIos && userAgent.includes('safari') && !userAgent.includes('crios') && !userAgent.includes('fxios')
    const iosDismissed = localStorage.getItem('dtce_ios_pwa_hint_dismissed')

    if (isIos && isSafari && !iosDismissed) {
      // Delay prompt slightly so page finishes initial load cleanly
      const timer = setTimeout(() => setShowIosPrompt(true), 1500)
      return () => clearTimeout(timer)
    }

    // 3. Android / Chromium Native Prompt Listener (Optionally capture event for manual trigger if desired)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      const androidDismissed = sessionStorage.getItem('dtce_android_pwa_dismissed')
      if (!androidDismissed) {
        setShowAndroidBanner(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const dismissIosPrompt = () => {
    localStorage.setItem('dtce_ios_pwa_hint_dismissed', 'true')
    setShowIosPrompt(false)
  }

  const dismissAndroidBanner = () => {
    sessionStorage.setItem('dtce_android_pwa_dismissed', 'true')
    setShowAndroidBanner(false)
  }

  const triggerAndroidInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    console.log(`PWA install prompt user response: ${outcome}`)
    setDeferredPrompt(null)
    setShowAndroidBanner(false)
  }

  return (
    <>
      {/* ── iOS SAFARI INSTALL HINT ── */}
      {showIosPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-[9999] max-w-md mx-auto animate-fade-in-up">
          <div
            className="p-4 rounded-2xl border shadow-2xl backdrop-blur-xl space-y-3"
            style={{
              background: 'rgba(15, 26, 46, 0.95)',
              borderColor: 'rgba(245, 158, 11, 0.3)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 20px rgba(245,158,11,0.15)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 rounded-xl overflow-hidden bg-white shrink-0 border border-amber-500/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon-192.png" alt="DTCE App" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    Install DTCE App on iOS
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Add DTCE to your Home Screen for instant offline access.
                  </p>
                </div>
              </div>
              <button
                onClick={dismissIosPrompt}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close install prompt"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">1</span>
                <span>Tap the <strong className="text-amber-400 inline-flex items-center gap-1">Share <Share size={12} className="inline" /></strong> icon in Safari toolbar.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">2</span>
                <span>Scroll down &amp; tap <strong className="text-amber-400 inline-flex items-center gap-1">Add to Home Screen <PlusSquare size={12} className="inline" /></strong>.</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={dismissIosPrompt}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition-colors"
              >
                Got it, dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ANDROID / CHROMIUM COMPACT INSTALL PROMPT ── */}
      {showAndroidBanner && (
        <div className="fixed bottom-4 left-4 right-4 z-[9999] max-w-md mx-auto animate-fade-in-up">
          <div
            className="p-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3"
            style={{
              background: 'rgba(15, 26, 46, 0.95)',
              borderColor: 'rgba(59, 130, 246, 0.3)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 rounded-xl overflow-hidden bg-white shrink-0 border border-blue-500/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon-192.png" alt="DTCE App" className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <Smartphone size={13} className="text-blue-400" />
                  Install DTCE Reporting App
                </h4>
                <p className="text-[10px] text-slate-400">Fast offline reporting on home screen</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={triggerAndroidInstall}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-xs"
              >
                Install
              </button>
              <button
                onClick={dismissAndroidBanner}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
