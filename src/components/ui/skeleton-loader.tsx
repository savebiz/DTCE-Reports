'use client'

import React from 'react'

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted/40 ${className}`}
      style={{
        backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  )
}

export function KPIGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card p-4 space-y-3 bg-card border border-border rounded-xl">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-2 w-1/3" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass-card overflow-hidden bg-card border border-border rounded-xl space-y-2 p-4">
      <div className="flex justify-between items-center pb-3 border-b border-border">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-8 w-1/6" />
      </div>
      <div className="space-y-3 pt-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 items-center py-2">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MatrixGridSkeleton() {
  return (
    <div className="glass-card p-5 bg-card border border-border rounded-xl space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-8 w-1/4" />
      </div>
      <div className="grid grid-cols-6 gap-2 pt-2">
        {Array.from({ length: 24 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
