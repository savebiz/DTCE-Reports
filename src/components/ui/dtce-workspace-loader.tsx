'use client'

import React from 'react'

interface DtceWorkspaceLoaderProps {
  eyebrow?: string
  title?: string
  steps?: [string, string, string]
}

const DEFAULT_STEPS: [string, string, string] = [
  'Preparing event workspace…',
  'Loading department schema…',
  'Synchronizing records…',
]

/**
 * Option 4: Kinetic Glass Card & Status Roll
 * Uses the exact, undistorted original DTCE Global logo inside a frosted
 * 3D-tilting credential badge with a subtle edge glint and masked status roll.
 */
export function DtceWorkspaceLoader({
  eyebrow = 'DTCE Global',
  title = 'Reporting Desk',
  steps = DEFAULT_STEPS,
}: DtceWorkspaceLoaderProps) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: 'var(--background)' }}
    >
      <div className="flex flex-col items-center space-y-4">
        <div
          className="dtce-glass-card relative rounded-2xl px-5 py-4 flex items-center gap-3.5 overflow-hidden border border-border/80 bg-card/80 backdrop-blur-md shadow-lg"
        >
          <div
            className="w-12 h-12 rounded-full bg-white p-1 shrink-0 shadow-sm flex items-center justify-center"
            style={{
              boxShadow: '0 0 0 1px rgba(245,158,11,0.22)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dtce-logo.png"
              alt="DTCE Junior Church Global"
              width={44}
              height={44}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          <div className="min-w-[155px] pr-1">
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-emerald-500">
              {eyebrow}
            </div>
            <div className="text-sm font-bold tracking-tight text-foreground">
              {title}
            </div>
          </div>

          <div
            className="dtce-edge-glint pointer-events-none absolute inset-y-0 w-12"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)',
            }}
          />
        </div>

        {/* Masked Rotating Status Line */}
        <div className="h-4 overflow-hidden text-center">
          <div className="dtce-status-roll text-xs text-muted-foreground">
            {steps.map((step, idx) => (
              <div key={idx} className="h-4 leading-4">
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
