import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { PwaInstallButton } from '@/components/pwa-install-button'
import { ArrowRight, ClipboardCheck, Package, WifiOff } from 'lucide-react'

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: 'Daily Reports',
    description:
      'Submit attendance, collections, and departmental updates for each day of the event.',
    accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Package,
    title: 'Supply Requests',
    description:
      'Send your pre-event needs list and request items from the store during the event.',
    accent: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  {
    icon: WifiOff,
    title: 'Works Offline',
    description:
      'Draft your reports on any device even with weak signal—changes sync automatically.',
    accent: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
] as const

export default function RootLandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans antialiased selection:bg-amber-500/25">
      {/* Subtle architectural top glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[440px] opacity-50 dark:opacity-75"
        style={{
          background:
            'radial-gradient(ellipse 75% 55% at 50% -15%, rgba(15, 42, 74, 0.2), transparent 75%)',
        }}
      />

      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-white p-1 border border-border shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dtce-logo.png"
                alt="DTCE Reporting"
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
      <main className="relative z-10 flex-1 flex flex-col justify-center">
        <section className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 space-y-12">
          {/* Clean Hero */}
          <div className="max-w-2xl space-y-5">
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.1]">
              Departmental Reporting &amp;{' '}
              <span className="text-amber-600 dark:text-amber-400">
                Event Operations.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Submit your department&apos;s daily reports, send supply requests, and stay coordinated
              throughout every event.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <Link href="/login" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-12 px-6 bg-[#0F2A4A] hover:bg-[#163861] text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-[#06090F] font-bold text-sm cursor-pointer shadow-sm"
                >
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>

          {/* 3 Clean Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURES.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border bg-card p-6 space-y-3 shadow-2xs"
                >
                  <div
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${item.accent}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-bold text-foreground">
                    {item.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-border/70 bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8 py-5 text-xs text-muted-foreground">
          <span>RCCG Directorate of Teens &amp; Children Education</span>
        </div>
      </footer>
    </div>
  )
}
