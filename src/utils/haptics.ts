/**
 * Mobile Haptic Vibration & Audio Sound Utility
 * Provides tactile haptic vibration patterns and Web Audio API chime sounds.
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'notification' | 'success' | 'warning' | 'error'

/**
 * Triggers mobile device vibration using the Web Vibration API.
 * Gracefully handled on non-supported browsers, desktop, or iOS WebKit limitations.
 */
export const triggerHaptic = (pattern: HapticPattern = 'light') => {
  if (typeof window === 'undefined' || !('navigator' in window) || !('vibrate' in navigator)) {
    return
  }

  try {
    switch (pattern) {
      case 'light':
        // Short soft tap for buttons and toggles
        navigator.vibrate(15)
        break
      case 'medium':
        // Standard button action tap
        navigator.vibrate(35)
        break
      case 'heavy':
        // Strong feedback for critical actions
        navigator.vibrate(65)
        break
      case 'notification':
        // Double-pulse tactile pattern for incoming notifications
        navigator.vibrate([120, 60, 120])
        break
      case 'success':
        // Upbeat double burst
        navigator.vibrate([40, 60, 40])
        break
      case 'warning':
        // Triple warning pulses
        navigator.vibrate([70, 50, 70, 50, 70])
        break
      case 'error':
        // Long heavy alert pulses
        navigator.vibrate([100, 50, 100, 50, 150])
        break
    }
  } catch {
    // Ignore permissions/interaction policy errors
  }
}

/**
 * Synthesizes a soft metallic chime using Web Audio API.
 * Requires zero external audio files and works 100% offline.
 */
export const playNotificationChime = () => {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    // Pure two-tone bell chime (E6 -> B6)
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1975.53, ctx.currentTime + 0.1)

    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // Autoplay policy fallback
  }
}
