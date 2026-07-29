'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { InventoryReportsView } from '@/components/inventory/inventory-reports-view'

export default function InventoryReportsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* 1. Integrated Navigation Strip */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-border/40 bg-background/50 backdrop-blur-xs">
        <button
          onClick={() => router.push('/my-department/inventory')}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Inventory Console
        </button>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Stores Inventory Reports</span>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8">
        <InventoryReportsView readOnly={false} />
      </main>
    </div>
  )
}
