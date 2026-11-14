'use client'

import React from 'react'

interface DtceWorkspaceLoaderProps {
  title?: string
  subtitle?: string
}

/**
 * Clean, studio-grade workspace loader featuring the exact, undistorted
 * DTCE Global logo with a subtle diagonal specular sheen and structural
 * workspace skeletons.
 */
export function DtceWorkspaceLoader({
  title = 'DTCE Reporting',
  subtitle = 'Preparing workspace...',
}: DtceWorkspaceLoaderProps) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: 'var(--background)' }}
    >
      <div className="w-full max-w-md space-y-6">
        {/* Exact Original DTCE Global Crest + Subtle Specular Sheen */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div
            className="relative h-16 w-16 rounded-full bg-white p-1.5 overflow-hidden flex items-center justify-center"
            style={{
              boxShadow:
                '0 0 0 1px rgba(245,158,11,0.22), 0 10px 30px rgba(0,0,0,0.22)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dtce-logo.png"
              alt="DTCE Junior Church Global"
              width={56}
              height={56}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            <div
              className="dtce-sheen pointer-events-none absolute inset-y-0 w-7"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)',
              }}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wider uppercase text-foreground/90">
              {title}
            </p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {/* Clean Structural Workspace Skeleton */}
        <div className="rounded-2xl border border-border bg-card/70 p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="shimmer h-6 w-20 rounded-lg bg-muted/50" />
            <div className="shimmer h-6 w-20 rounded-lg bg-muted/50" />
            <div className="shimmer h-6 w-20 rounded-lg bg-muted/50" />
          </div>
          <div className="shimmer h-12 w-full rounded-xl bg-muted/50" />
          <div className="grid grid-cols-2 gap-2.5">
            <div className="shimmer h-10 rounded-xl bg-muted/50" />
            <div className="shimmer h-10 rounded-xl bg-muted/50" />
          </div>
        </div>
      </div>
    </div>
  )
}
