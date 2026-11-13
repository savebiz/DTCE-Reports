import React, { Suspense } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-dot-matrix [mask-image:radial-gradient(ellipse_85%_65%_at_50%_10%,#000_35%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] dark:hidden"
        style={{
          background:
            'radial-gradient(ellipse 65% 45% at 20% -5%, rgba(15, 42, 74, 0.06), transparent 70%), radial-gradient(ellipse 45% 35% at 85% 5%, rgba(245, 158, 11, 0.06), transparent 65%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 hidden h-[420px] dark:block"
        style={{
          background:
            'radial-gradient(ellipse 65% 45% at 20% -5%, rgba(59, 130, 246, 0.08), transparent 70%), radial-gradient(ellipse 45% 35% at 85% 5%, rgba(245, 158, 11, 0.06), transparent 65%)',
        }}
      />
      <Suspense fallback={<div className="h-14 bg-card border-b border-border" />}>
        <DashboardHeader />
      </Suspense>
      <div className="relative z-10 flex-1 pt-14 lg:pl-14 transition-all duration-300">
        {children}
      </div>
    </div>
  )
}
