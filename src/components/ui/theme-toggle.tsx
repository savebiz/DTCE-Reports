'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

const MODES = [
  { id: 'light', label: 'Light theme', Icon: Sun },
  { id: 'dark', label: 'Dark theme', Icon: Moon },
  { id: 'system', label: 'System theme', Icon: Monitor },
] as const

/**
 * ThemeToggle — Light / Dark / System switcher powered by next-themes.
 * Renders a 3-way segmented pill by default, or a compact cycle button when compact=true.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div
        className={
          compact
            ? 'h-9 w-9 rounded-lg border border-border/60 bg-muted/40'
            : 'h-9 w-[104px] rounded-full border border-border/60 bg-muted/40'
        }
        aria-hidden
      />
    )
  }

  const activeTheme = theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system'

  if (compact) {
    const nextMap: Record<'light' | 'dark' | 'system', 'light' | 'dark' | 'system'> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    }
    const CurrentIcon = activeTheme === 'light' ? Sun : activeTheme === 'dark' ? Moon : Monitor
    const nextMode = nextMap[activeTheme]

    return (
      <button
        type="button"
        onClick={() => setTheme(nextMode)}
        title={`Theme: ${activeTheme} (click for ${nextMode})`}
        aria-label={`Current theme ${activeTheme}. Switch to ${nextMode} theme`}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
      >
        <CurrentIcon className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label="Theme preference"
      className="inline-flex items-center rounded-full border border-border bg-muted/50 p-0.5 shrink-0"
    >
      {MODES.map(({ id, label, Icon }) => {
        const isActive = activeTheme === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            className={`inline-flex h-7 w-8 items-center justify-center rounded-full transition-all cursor-pointer ${
              isActive
                ? 'bg-background text-foreground shadow-xs border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
