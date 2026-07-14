'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function RootLandingPage() {
  const days = [
    { label: 'Mon', num: 13, active: false, status: 'Submitted' },
    { label: 'Tue', num: 14, active: false, status: 'Submitted' },
    { label: 'Wed', num: 15, active: true, status: 'Today' },
    { label: 'Thu', num: 16, active: false, status: 'Upcoming' },
    { label: 'Fri', num: 17, active: false, status: 'Upcoming' },
    { label: 'Sat', num: 18, active: false, status: 'Upcoming' }
  ]

  return (
    <div className="min-h-screen flex flex-col bg-paper text-charcoal font-sans">
      {/* Hero Split-Screen Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[90vh]">
        {/* Left Panel: Ink-navy with the signature Day Rail */}
        <div className="lg:col-span-5 bg-ink-navy text-white p-8 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-hairline">
          <div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 bg-convention-gold rounded-full animate-pulse"></span>
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Live Convention Tracker</span>
            </div>
            <h2 className="text-3xl font-display font-semibold mt-4 text-white">
              Annual Convention Week
            </h2>
            <p className="text-sm text-slate-400 mt-2 font-sans">
              Dynamic tracking rail maps active submissions in real-time.
            </p>
          </div>

          {/* Signature Day Rail Element */}
          <div className="my-12 space-y-3 max-w-sm">
            <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 block mb-2">Signature Day Rail</span>
            {days.map((day) => (
              <div
                key={day.num}
                className={`flex items-center justify-between p-3.5 rounded border transition-all duration-300 ${
                  day.active
                    ? 'bg-convention-gold border-convention-gold text-ink-navy font-bold shadow-md scale-102'
                    : 'bg-ink-navy/40 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <span className="font-mono text-base font-bold">
                    {day.num.toString().padStart(2, '0')}
                  </span>
                  <span className="text-sm font-semibold tracking-wide uppercase">{day.label}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                    day.active 
                      ? 'bg-ink-navy/20 text-ink-navy' 
                      : day.status === 'Submitted' 
                        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40' 
                        : 'bg-slate-900 text-slate-500'
                  }`}>
                    {day.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Live Progress Box */}
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-md space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Collation Progress Today</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-4xl font-extrabold font-mono text-convention-gold">32</span>
              <span className="text-slate-500 font-mono">/</span>
              <span className="text-2xl font-bold font-mono text-slate-300">40</span>
              <span className="text-sm text-slate-400 font-sans ml-1">departments reported today</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-3">
              <div className="bg-convention-gold h-full rounded-full" style={{ width: '80%' }}></div>
            </div>
          </div>
        </div>

        {/* Right Panel: Paper background with branding and CTAs */}
        <div className="lg:col-span-7 bg-paper p-8 lg:p-20 flex flex-col justify-between">
          <div className="flex justify-between items-center pb-8 border-b border-hairline">
            <div className="font-display text-xl font-bold tracking-tight text-ink-navy flex items-center space-x-2">
              <span>⛪</span>
              <span>DTCE Reporting</span>
            </div>
            <Link href="/login">
              <Button variant="outline" className="border-ink-navy text-ink-navy hover:bg-ink-navy/5 font-semibold text-xs h-9">
                Sign In ➔
              </Button>
            </Link>
          </div>

          <div className="max-w-2xl my-auto py-12 space-y-6">
            <h1 className="text-4xl lg:text-5xl font-display font-semibold text-ink-navy leading-tight">
              Forty departments. One report. Built while convention week runs — not after it ends.
            </h1>
            <p className="text-base text-slate-600 leading-relaxed font-sans max-w-xl">
              DTCE Reporting replaces the week of retyping forty department write-ups into a single document. Submit daily, review as you go, compile in minutes.
            </p>

            <div className="pt-4 space-y-3">
              <Link href="/login">
                <Button className="bg-ink-navy text-white hover:bg-ink-navy/95 font-semibold h-11 px-8 shadow-sm">
                  Sign In to Dashboard
                </Button>
              </Link>
              <p className="text-xs text-slate-400 font-sans">
                ⚠️ Issued a login by your Secretariat? Use it here. Self-registration is disabled.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pt-8 border-t border-hairline">
            RCCG Directorate of Teens and Children Education
          </div>
        </div>
      </div>

      {/* Section 2: Two-column Plain Comparison */}
      <div className="bg-white border-t border-b border-hairline py-16 px-8 lg:px-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">
          <div className="space-y-4">
            <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400">Past Flow</span>
            <h3 className="text-xl font-display font-semibold text-ink-navy">The old way</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-sans">
              Each department sends a written report by the end of the week. The Secretariat retypes attendance figures, offering totals, and meal counts into tables by hand, then assembles forty write-ups into one document — usually finished days after the convention ends.
            </p>
          </div>

          <div className="space-y-4 border-l border-hairline pl-8 lg:pl-16">
            <span className="text-[10px] uppercase font-mono tracking-widest text-convention-gold font-bold">Optimized Flow</span>
            <h3 className="text-xl font-display font-semibold text-ink-navy">With DTCE Reporting</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-sans">
              Each department enters figures daily, from a phone, even offline. The Secretariat reviews as submissions come in. The final report compiles automatically, formatted and ready, before the closing session.
            </p>
          </div>
        </div>
      </div>

      {/* Section 3: Numbered Workflow Sequence */}
      <div className="py-20 px-8 lg:px-16 bg-paper">
        <div className="max-w-6xl mx-auto">
          <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 block mb-2">Operational Pipeline</span>
          <h2 className="text-2xl lg:text-3xl font-display font-semibold text-ink-navy mb-12">
            How the System Works
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white border border-hairline p-6 rounded-md space-y-4">
              <span className="text-3xl font-mono font-bold text-slate-300">01</span>
              <h4 className="text-base font-display font-bold text-ink-navy">Submit</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                HODs log daily numbers and end-of-event write-ups from their phone. Built-in PWA offline caching preserves drafts if connectivity is drop-prone.
              </p>
            </div>

            <div className="bg-white border border-hairline p-6 rounded-md space-y-4">
              <span className="text-3xl font-mono font-bold text-slate-300">02</span>
              <h4 className="text-base font-display font-bold text-ink-navy">Review</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                The Secretariat sees every department's status at a glance on the oversight matrix, reviewing and locking sections as soon as they hit the server.
              </p>
            </div>

            <div className="bg-white border border-hairline p-6 rounded-md space-y-4">
              <span className="text-3xl font-mono font-bold text-slate-300">03</span>
              <h4 className="text-base font-display font-bold text-ink-navy">Compile</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                One branded docx report generates automatically, containing Executive Summary, day-by-day activities, metrics, challenges, recommendations, and appendices.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Built for the Directorate */}
      <div className="bg-white border-t border-hairline py-12 px-8 text-center text-xs text-slate-500 font-sans">
        <div className="max-w-3xl mx-auto space-y-2">
          <p className="font-semibold text-ink-navy uppercase tracking-wider text-[10px]">Administrative Platform</p>
          <p>
            Built for the Directorate of Teens and Children Education, Redeemed Christian Church of God — for the Annual Convention and Holy Ghost Congress.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-ink-navy text-slate-400 py-8 px-8 border-t border-slate-800 text-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
          <div className="font-display font-semibold text-white tracking-wider flex items-center space-x-1">
            <span>⛪</span>
            <span>DTCE Reporting System</span>
          </div>
          <div className="flex space-x-6 font-mono text-[10px] uppercase">
            <Link href="/login" className="hover:text-white transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
