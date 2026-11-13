import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PwaInstallButton } from '@/components/pwa-install-button'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  Lock,
  PackageCheck,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'

const PREVIEW_DEPTS = [
  { name: 'Medical & First Aid', status: 'Submitted', tone: 'emerald' },
  { name: 'Registration', status: 'Reviewed', tone: 'blue' },
  { name: 'Ushering & Protocol', status: 'Submitted', tone: 'emerald' },
  { name: 'Central Stores', status: 'Active', tone: 'amber' },
] as const

export default function RootLandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#06090F] text-slate-100 font-sans selection:bg-amber-500/30">
      {/* Subtle radial atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[520px] opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 75% 60% at 50% -10%, rgba(15, 42, 74, 0.85), transparent 75%)',
        }}
      />

      {/* Sticky Top Command Bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#06090F]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgba(245,158,11,0.3)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dtce-logo.png"
                alt="RCCG DTCE Crest"
                width={36}
                height={36}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white truncate">
                  DTCE Reporting
                </span>
                <span className="hidden sm:inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-amber-300">
                  RCCG DTCE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                Convention &amp; Congress Operations Command
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PwaInstallButton variant="compact" />
            <Link href="/login">
              <Button
                size="sm"
                className="h-10 sm:h-9 px-4 bg-amber-500 hover:bg-amber-400 text-[#06090F] font-bold text-xs cursor-pointer shadow-sm"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1">
        {/* Hero Section — Mobile-first: Headline & CTA appear immediately above the fold */}
        <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 pt-10 pb-12 sm:pt-14 sm:pb-16 lg:pt-20 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Command Hero & Primary CTAs */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-[#0F2A4A]/60 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>RCCG DTCE · Convention &amp; Congress · Offline-Ready PWA</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-white leading-[1.08]">
                Unified Convention &amp; Congress{' '}
                <span className="text-amber-400">Operations.</span>
              </h1>

              <p className="text-sm sm:text-base lg:text-lg text-slate-300/90 max-w-2xl leading-relaxed">
                Real-time daily reporting, pre-event market procurement, central stores
                fulfillment, and one-click Secretariat Board DOCX compilation across{' '}
                <span className="font-semibold text-white">43+ departments</span>.
              </p>

              {/* Primary & Secondary CTAs — full-width on mobile, inline on sm+ */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <Link href="/login" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto h-12 px-6 bg-amber-500 hover:bg-amber-400 text-[#06090F] font-bold text-sm cursor-pointer shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
                  >
                    <span>Sign In to Command</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <div className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto [&>button]:h-12">
                  <PwaInstallButton />
                </div>
              </div>

              {/* Trust / Access Clarification Strip */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Secretariat-issued credentials required
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <WifiOff className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Offline draft &amp; auto-sync enabled
                </span>
              </div>
            </div>

            {/* Right Column: Framed Oversight Matrix Preview Card */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/10 bg-[#0B1220]/90 p-5 sm:p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-2 pb-4 border-b border-white/10">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 block">
                      Oversight Matrix Preview
                    </span>
                    <h2 className="text-sm font-bold text-white mt-0.5">
                      Secretariat Command Telemetry
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-mono font-semibold text-emerald-300 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    PWA Ready
                  </span>
                </div>

                {/* 3 Tabular KPI Tiles */}
                <div className="grid grid-cols-3 gap-2.5 my-4">
                  <div className="rounded-xl border border-white/10 bg-[#0F172A]/80 p-3">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block">
                      Departments
                    </span>
                    <span className="text-lg sm:text-xl font-bold font-mono text-white mt-1 block">
                      43+
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0F172A]/80 p-3">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block">
                      Stores Flow
                    </span>
                    <span className="text-lg sm:text-xl font-bold font-mono text-amber-400 mt-1 block">
                      2-Stage
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#0F172A]/80 p-3">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block">
                      Board Pack
                    </span>
                    <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400 mt-1 block">
                      DOCX
                    </span>
                  </div>
                </div>

                {/* Sample Department Status Rows */}
                <div className="space-y-2">
                  {PREVIEW_DEPTS.map((dept) => (
                    <div
                      key={dept.name}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#070B14] px-3.5 py-2.5 text-xs"
                    >
                      <span className="font-medium text-slate-200 truncate">
                        {dept.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold uppercase shrink-0 ${
                          dept.tone === 'emerald'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                            : dept.tone === 'blue'
                              ? 'bg-blue-500/10 text-blue-300 border border-blue-500/30'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        {dept.status}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
                  Live compliance matrix, challenge tracking, and approved allocations unlock
                  immediately after sign-in.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3-Column Bento Capability Strip */}
        <section className="border-t border-white/10 bg-[#090E18]/80">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 block mb-1.5">
                  Operational Architecture
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Built for Convention &amp; Congress Ground Conditions
                </h2>
              </div>
              <span className="text-xs text-slate-400">
                HODs · Assistants · Central Stores · Secretariat · Leadership
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <div className="rounded-2xl border border-white/10 bg-[#0D1422] p-6 space-y-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  Field Entry &amp; Offline Drafts
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  HODs and Assistants submit daily attendance, offerings, and department-specific
                  metrics even when convention-ground connectivity drops—auto-syncing when online.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0D1422] p-6 space-y-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  Secretariat Oversight &amp; Locking
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Real-time compliance matrix across all 43+ departments with instant review,
                  approval locking, challenge escalation tracking, and event-window controls.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0D1422] p-6 space-y-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  Stores &amp; Executive DOCX
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Two-stage procurement (Pre-Event Market Lists → Live Counter Fulfillment &amp;
                  Durable Returns) plus one-click compiled DOCX Board &amp; Stores reports.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#06090F]">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
            <span>RCCG DTCE Secretariat · Digital Operations &amp; Reporting Platform</span>
          </div>
          <span>Audit-Ready · Role-Based Access · Multi-Event</span>
        </div>
      </footer>
    </div>
  )
}
