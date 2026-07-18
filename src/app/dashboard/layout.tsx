import React, { Suspense } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <Suspense fallback={<div className="h-14 bg-slate-950 border-b border-border" />}>
        <DashboardHeader />
      </Suspense>
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
