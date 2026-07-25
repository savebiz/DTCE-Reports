'use client'

/**
 * DTCE Reporting — Modern WebAPK PWA Install Button Component
 * 
 * ARCHITECTURE NOTICE:
 * This project uses browser-native WebAPK Progressive Web App (PWA) installation.
 * Direct static .apk downloads or legacy side-loaded APK wrappers MUST NOT be used,
 * as side-loaded APKs built with old target SDKs trigger Play Protect warnings 
 * ("built for older version of Android").
 * 
 * Chrome's native WebAPK service mints a modern APK on Google servers targeting the latest 
 * Android API levels (Android 14+ / API 34+), guaranteeing zero security/target SDK warnings.
 */

import React, { useEffect, useState } from 'react'
import { Download, Smartphone, Share, PlusSquare, X, Check } from 'lucide-react'

export function PwaInstallButton({ variant = 'default' }: { variant?: 'default' | 'hero' | 'compact' }) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [showIosModal, setShowIosModal] = useState(false)
  const [installedSuccess, setInstalledSuccess] = useState(false)

  useEffect(() => {
    // 1. Standalone / Already Installed Detection
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as any).standalone === true)

    setIsStandalone(standalone)
    if (standalone) return

    // 2. iOS Safari Detection
    const userAgent = window.navigator.userAgent.toLowerCase()
    const iosDevice = /iphone|ipad|ipod/.test(userAgent)
    const isSafari = iosDevice && userAgent.includes('safari') && !userAgent.includes('crios') && !userAgent.includes('fxios')
    setIsIos(iosDevice && isSafari)

    // 3. Chromium Native WebAPK Prompt Listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosModal(true)
      return
    }

    if (!deferredPrompt) {
      // Fallback instruction if browser doesn't support beforeinstallprompt
      alert('To install DTCE App, open your browser menu (⋮) and tap "Add to Home screen" or "Install App".')
      return
    }

    // Trigger Chrome's Native WebAPK Installation Engine
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    console.log(`[WebAPK] Install choice outcome: ${outcome}`)

    if (outcome === 'accepted') {
      setInstalledSuccess(true)
      setDeferredPrompt(null)
    }
  }

  if (isStandalone) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
        <Check size={13} />
        <span>App Installed</span>
      </div>
    )
  }

  // Only render if WebAPK prompt is available or on iOS Safari
  if (!deferredPrompt && !isIos && variant !== 'hero') {
    return null
  }

  return (
    <>
      {/* ── INSTALL BUTTON UI ── */}
      {installedSuccess ? (
        <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold animate-fade-in">
          <Check size={14} />
          <span>App Installed Successfully</span>
        </div>
      ) : (
        <button
          onClick={handleInstallClick}
          className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all duration-200 cursor-pointer ${
            variant === 'hero'
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 px-6 py-3 text-xs shadow-lg shadow-amber-500/20 active:scale-98'
              : variant === 'compact'
              ? 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-3 py-1.5 text-xs'
              : 'border border-slate-700 hover:border-slate-500 bg-slate-900/80 hover:bg-slate-800 text-slate-100 px-4 py-2 text-xs'
          }`}
        >
          <Download size={14} className={variant === 'hero' ? 'text-slate-950' : 'text-amber-400'} />
          <span>{variant === 'hero' ? 'Install App (WebAPK)' : 'Install App'}</span>
        </button>
      )}

      {/* ── iOS SAFARI GUIDED INSTALL MODAL ── */}
      {showIosModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-sm w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">Install on iOS Safari</h3>
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Apple iOS Safari requires adding the web app to your Home Screen manually:
            </p>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">1</span>
                <span>Tap <strong>Share <Share size={12} className="inline text-amber-400" /></strong> in Safari toolbar.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">2</span>
                <span>Scroll down &amp; tap <strong>Add to Home Screen <PlusSquare size={12} className="inline text-amber-400" /></strong>.</span>
              </div>
            </div>

            <button
              onClick={() => setShowIosModal(false)}
              className="w-full py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
            >
              Got it, Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
