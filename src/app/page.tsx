import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { PwaInstallButton } from '@/components/pwa-install-button'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Layers,
  Lock,
  PackageCheck,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'

const WORKFLOW_ROWS = [
  { name: 'Medical', stage: 'Daily Log', status: 'Submitted', tone: 'emerald' },
  { name: 'Registration', stage: 'Delegate Check-In', status: 'Reviewed', tone: 'blue' },
  { name: 'Ushering', stage: 'Daily Log', status: 'Submitted', tone: 'emerald' },
  { name: 'Stores', stage: 'Fulfillment', status: 'Active', tone: 'amber' },
] as const

const CAPABILITIES = [
  {
    icon: ClipboardCheck,
    title: 'Departmental Daily Reporting',
    description:
      'Attendance, workforce breakdown, financial collections, and operational challenges captured offline-first and synced automatically.',
    accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: PackageCheck,
    title: 'Two-Stage Stores & Procurement',
    description:
      'Collect pre-event market needs lists for executive sign-off, then track live warehouse issues, stock reservations, and durable returns.',
    accent: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  {
    icon: FileText,
    title: 'End-of-Event Summaries',
    description:
      'Capture departmental highlights, key learnings, and actionable recommendations after each event.',
    accent: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
] as const

const LIFECYCLE_STEPS = [
  {
    step: 'Pre-Event',
    title: 'Needs & Market Approval',
    detail: 'Departments submit pre-event item lists inside the configured window for Coordinator approval.',
  },
  {
    step: 'Live Event',
    title: 'Daily Logs & Store Issues',
    detail: 'Teams file daily metrics and request stocked materials while Secretariat monitors compliance live.',
  },
  {
    step: 'Post-Event',
    title: 'End-of-Event Wrap-Up',
    detail: 'Verify durable equipment returns and finalize your department’s post-event summary.',
  },
] as const

export default function RootLandingPage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground font-sans antialiased overflow-x-hidden selection:bg-amber-500/25">
      {/* Masked dot-matrix texture & warm dual-tone top wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[620px] bg-dot-matrix [mask-image:radial-gradient(ellipse_80%_65%_at_50%_15%,#000_40%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] dark:hidden"
        style={{
          background:
            'radial-gradient(ellipse 65% 50% at 20% -10%, rgba(15, 42, 74, 0.09), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 5%, rgba(245, 158, 11, 0.09), transparent 65%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 hidden h-[520px] dark:block"
        style={{
          background:
            'radial-gradient(ellipse 65% 50% at 20% -10%, rgba(59, 130, 246, 0.11), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 5%, rgba(245, 158, 11, 0.08), transparent 65%)',
        }}
      />

      {/* Sticky Top Command Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-white p-1 border border-border shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dtce-logo.png"
                alt="DTCE Reporting Crest"
                width={36}
                height={36}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold tracking-tight text-foreground block truncate">
                DTCE Reporting
              </span>
              <span className="text-[11px] text-muted-foreground hidden sm:block truncate">
                Directorate of Teens &amp; Children Education
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="sm:hidden">
              <ThemeToggle compact />
            </div>
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <PwaInstallButton variant="compact" />
            <Link href="/login">
              <Button
                size="sm"
                className="h-9 px-4 bg-[#0F2A4A] hover:bg-[#163861] text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-[#06090F] font-semibold text-xs cursor-pointer shadow-xs"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1">
        {/* Hero Section — Mobile-first above the fold */}
        <section className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-10 pt-10 pb-12 sm:pt-14 sm:pb-16 lg:pt-20 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            {/* Left Column: Editorial Headline & Primary CTA */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Multi-Event Operations Platform · Offline-Ready</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight text-foreground leading-[1.08]">
                One Command Centre{' '}
                <span className="text-amber-600 dark:text-amber-400">
                  for Every Event.
                </span>
              </h1>

              <p className="max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
                Coordinate daily departmental reporting, supply requests, and end-of-event summaries
                across 43+ operational teams.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <Link href="/login" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto h-12 px-6 bg-[#0F2A4A] hover:bg-[#163861] text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-[#06090F] font-bold text-sm cursor-pointer shadow-sm"
                  >
                    <span>Sign In to Workspace</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <a
                  href="#capabilities"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-card px-5 text-sm font-semibold text-foreground shadow-xs hover:bg-accent hover:border-foreground/20 transition-all"
                >
                  Explore Capabilities
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  Role-scoped access control
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <WifiOff className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Offline draft &amp; auto-sync
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Convention, Congress &amp; Special Events
                </span>
              </div>
            </div>

            {/* Right Column: Clean Architectural Oversight Preview */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-border border-t-2 border-t-[#0F2A4A] dark:border-t-amber-500 bg-card p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,42,74,0.05),0_12px_32px_-6px_rgba(15,42,74,0.09)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] space-y-5">
                <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Secretariat Overview
                    </p>
                    <h2 className="text-base font-bold text-foreground mt-0.5">
                      Live Compliance &amp; Logistics
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 border border-emerald-600/25 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Synced
                  </span>
                </div>

                {/* Summary Metrics Strip */}
                <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                  <div className="rounded-xl border border-border bg-[#F7F5F0]/80 dark:bg-muted/40 p-2.5 sm:p-3">
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground block truncate">
                      Departments
                    </span>
                    <span className="text-lg sm:text-xl font-extrabold tabular-nums text-foreground mt-0.5 block">
                      43+
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-[#F7F5F0]/80 dark:bg-muted/40 p-2.5 sm:p-3">
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground block truncate">
                      Stores Flow
                    </span>
                    <span className="text-lg sm:text-xl font-extrabold text-amber-700 dark:text-amber-400 mt-0.5 block">
                      2-Stage
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-[#F7F5F0]/80 dark:bg-muted/40 p-2.5 sm:p-3">
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground block truncate">
                      Sync Mode
                    </span>
                    <span className="text-lg sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                      Offline
                    </span>
                  </div>
                </div>

                {/* Departmental Workflow Sample */}
                <div className="space-y-2">
                  {WORKFLOW_ROWS.map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-[#FAF9F6] dark:bg-background/60 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <span className="text-xs sm:text-sm font-semibold text-foreground block truncate">
                          {row.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground block">
                          {row.stage}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0 border ${
                          row.tone === 'emerald'
                            ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-600/25'
                            : row.tone === 'blue'
                            ? 'bg-blue-500/12 text-blue-700 dark:text-blue-400 border-blue-600/25'
                            : 'bg-amber-500/12 text-amber-800 dark:text-amber-400 border-amber-600/25'
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    Department-scoped data isolation
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities Bento Grid */}
        <section
          id="capabilities"
          className="border-t border-border bg-[#F2EFE8]/70 dark:bg-muted/10"
        >
          <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-10 py-12 sm:py-16 space-y-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Core Platform Modules
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Built for speed on the ground and clarity across every team.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {CAPABILITIES.map((cap) => {
                const Icon = cap.icon
                return (
                  <div
                    key={cap.title}
                    className="rounded-2xl border border-border bg-card p-6 space-y-3 shadow-2xs transition-colors hover:border-border/90"
                  >
                    <div
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${cap.accent}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">
                      {cap.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {cap.description}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* 3-Stage Event Lifecycle */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-border">
                {LIFECYCLE_STEPS.map((item) => (
                  <div key={item.step} className="pt-4 first:pt-0 md:pt-0 md:pl-6 first:md:pl-0 space-y-1.5">
                    <span className="inline-block text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      {item.step}
                    </span>
                    <h4 className="text-sm font-bold text-foreground">
                      {item.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Clean Single Footer */}
      <footer className="border-t border-border/70 bg-background">
        <div className="mx-auto flex max-w-[1360px] flex-col sm:flex-row items-center justify-between gap-2 px-4 sm:px-6 lg:px-10 py-5 text-xs text-muted-foreground">
          <span>RCCG Directorate of Teens &amp; Children Education</span>
          <span>Secure Operations &amp; Reporting Workspace</span>
        </div>
      </footer>
    </div>
  )
}
