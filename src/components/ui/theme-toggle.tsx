'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

/**
 * ThemeToggle — Animated sun/moon pill.
 * Reads from next-themes and toggles dark ↔ light.
 * Suppresses flash on initial render via mounted guard.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Placeholder so layout doesn't shift
    return (
      <div
        style={{
          width: compact ? 32 : 52,
          height: compact ? 18 : 28,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.06)',
        }}
      />
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: compact ? 36 : 52,
        height: compact ? 20 : 28,
        borderRadius: 999,
        padding: 3,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,42,74,0.15)'}`,
        background: isDark
          ? 'rgba(30, 58, 138, 0.4)'
          : 'rgba(245, 158, 11, 0.15)',
        cursor: 'pointer',
        transition: 'background 300ms ease, border-color 300ms ease',
        flexShrink: 0,
      }}
    >
      {/* Track icons */}
      <span
        style={{
          position: 'absolute',
          left: compact ? 5 : 7,
          fontSize: compact ? 9 : 11,
          opacity: isDark ? 1 : 0,
          transition: 'opacity 200ms ease',
        }}
        aria-hidden
      >
        🌙
      </span>
      <span
        style={{
          position: 'absolute',
          right: compact ? 5 : 7,
          fontSize: compact ? 9 : 11,
          opacity: isDark ? 0 : 1,
          transition: 'opacity 200ms ease',
        }}
        aria-hidden
      >
        ☀️
      </span>

      {/* Thumb */}
      <span
        style={{
          display: 'block',
          width: compact ? 14 : 20,
          height: compact ? 14 : 20,
          borderRadius: '50%',
          background: isDark ? '#93C5FD' : '#F59E0B',
          transform: isDark
            ? `translateX(${compact ? 16 : 24}px)`
            : 'translateX(0)',
          transition: 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), background 300ms ease',
          boxShadow: isDark
            ? '0 0 8px rgba(147,197,253,0.5)'
            : '0 0 8px rgba(245,158,11,0.5)',
        }}
      />
    </button>
  )
}
