'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, Profile } from '@/utils/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import Link from 'next/link'

interface CarryOverIssue {
  departmentName: string
  challenge2025: string
  recommendation2025: string
  challenge2026: string
  keywordMatched: string
}

export default function YoYComparisonPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  
  // Event selectors
  const [eventA, setEventA] = useState('event-2025')
  const [eventB, setEventB] = useState('event-1') // active event 2026
  
  // Matched carry-overs list
  const [carryOvers, setCarryOvers] = useState<CarryOverIssue[]>([])

  const loadData = async () => {
    const supabase = getClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    let activeProfile = prof
    if (!activeProfile && user) {
      const meta = user.user_metadata as any
      activeProfile = {
        id: user.id,
        email: user.email || '',
        full_name: meta?.full_name || user.email?.split('@')[0] || 'Secretariat Admin',
        role: meta?.role || 'super_admin',
        department_id: meta?.department_id,
        username: meta?.username || user.email?.split('@')[0] || 'admin',
        must_change_password: false,
        is_active: true
      }
    }

    if (activeProfile) {
      if (activeProfile.role !== 'super_admin' && activeProfile.role !== 'coordinator' && activeProfile.role !== 'national_coordinator') {
        router.push('/my-department')
        return
      }
      setProfile(activeProfile)
    }

    // Run carry-over detection algorithm on mock/live narratives
    // Simulating 2025 (Event A) narratives and matching against active 2026 (Event B) narratives
    const mock2025Narratives = [
      {
        department_id: 'dept-10', // Medical
        challenges_json: [
          { id: 'med-25-c1', text: 'Shortage of basic analgesics in the cabinet' },
          { id: 'med-25-c2', text: 'Water supply pipeline leaks' }
        ],
        recommendations_json: [
          { text: 'Increase procurement of analgesics by 50%', linked_challenge_id: 'med-25-c1' },
          { text: 'Hire a plumber to inspect water pipes', linked_challenge_id: 'med-25-c2' }
        ]
      },
      {
        department_id: 'dept-21', // Registration
        challenges_json: [
          { id: 'reg-25-c1', text: 'Cramped space layout at lobby' }
        ],
        recommendations_json: [
          { text: 'Move registry tables to main hall', linked_challenge_id: 'reg-25-c1' }
        ]
      }
    ]

    // Fetch active narratives
    const { data: activeNarrs } = await supabase.from('department_narratives').select('*')
    const activeEoeNarrs = activeNarrs ? activeNarrs.filter((n: any) => n.is_end_of_event === true) : []

    const matches: CarryOverIssue[] = []

    mock2025Narratives.forEach(narr2025 => {
      const narr2026 = activeEoeNarrs.find((n: any) => n.department_id === narr2025.department_id)
      if (narr2026) {
        const dept = mockDepartments.find(d => d.id === narr2025.department_id)
        const deptName = dept?.name || 'Department'

        // Check keyword matches between 2025 and 2026 challenges
        const keywords = ['analgesics', 'space', 'lighting', 'internet', 'crowd', 'cramped']
        
        narr2025.challenges_json.forEach(ch25 => {
          narr2026.challenges_json.forEach((ch26: any) => {
            keywords.forEach(kw => {
              if (
                ch25.text.toLowerCase().includes(kw) &&
                ch26.text.toLowerCase().includes(kw)
              ) {
                const rec25 = narr2025.recommendations_json.find(r => r.linked_challenge_id === ch25.id)
                matches.push({
                  departmentName: deptName,
                  challenge2025: ch25.text,
                  recommendation2025: rec25 ? rec25.text : 'No recommendation logged.',
                  challenge2026: ch26.text,
                  keywordMatched: kw
                })
              }
            })
          })
        })
      }
    })

    setCarryOvers(matches)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Comparative data
  const comparisonStats = {
    registrations: [
      { category: 'Teachers', event2025: 180, event2026: 220 },
      { category: 'Teens', event2025: 450, event2026: 580 },
      { category: 'Pre-Teens', event2025: 320, event2026: 410 },
      { category: 'Children', event2025: 250, event2026: 310 }
    ],
    offering: { event2025: 420000, event2026: 580000 },
    attendanceTrend: [
      { day: 'Day 1', event2025: 850, event2026: 980 },
      { day: 'Day 2', event2025: 980, event2026: 1150 },
      { day: 'Day 3', event2025: 1100, event2026: 1300 },
      { day: 'Day 4', event2025: 1250, event2026: 1450 },
      { day: 'Day 5', event2025: 1400, event2026: 1600 }
    ]
  }

  return (
    <div className="min-h-screen bg-mesh" style={{ background: 'var(--background)' }}>
      {/* Heading Block */}
      <div className="border-b bg-card border-border">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between py-6 px-4 md:px-6 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Secretariat Analytics Panel</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Year-over-Year Comparison</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Compare 2025 and 2026 convention cycles.</p>
          </div>
          <div className="flex items-center">
            <Link href="/dashboard">
              <button
                className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold transition-all duration-200 bg-card border border-border text-muted-foreground hover:text-foreground cursor-pointer"
              >
                ➔ Oversight Dashboard
              </button>
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6 animate-fade-in-up">
        {/* Selector Header Bar */}
        <div className="glass-card p-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center text-[12px]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-muted-foreground">Compare Base Year:</span>
              <select
                value={eventA}
                onChange={(e) => setEventA(e.target.value)}
                className="h-8 rounded-lg px-3 text-[12px] font-medium text-foreground bg-card border border-border cursor-pointer outline-none"
              >
                <option value="event-2025" className="bg-card text-foreground">DTCE 2025 Annual Convention</option>
              </select>
            </div>
            <div className="text-muted-foreground font-bold uppercase tracking-wider">VS</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-muted-foreground">Compare Target Year:</span>
              <select
                value={eventB}
                onChange={(e) => setEventB(e.target.value)}
                className="h-8 rounded-lg px-3 text-[12px] font-medium text-foreground bg-card border border-border cursor-pointer outline-none"
              >
                <option value="event-1" className="bg-card text-foreground">DTCE 2026 Annual Convention (Active)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Charts & Key KPIs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1: Registration comparison custom bar chart */}
          <div className="glass-card p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Total Registration Comparison</h2>
              <div className="space-y-4">
                {comparisonStats.registrations.map(reg => {
                  const total = Math.max(reg.event2025, reg.event2026)
                  const pctA = Math.round((reg.event2025 / total) * 100)
                  const pctB = Math.round((reg.event2026 / total) * 100)
                  return (
                    <div key={reg.category} className="space-y-1.5">
                      <div className="flex justify-between text-[12px]">
                        <span className="font-semibold text-foreground">{reg.category}</span>
                        <span className="font-mono text-muted-foreground">
                          {reg.event2025} <span className="text-muted-foreground">vs</span> {reg.event2026}
                        </span>
                      </div>
                      {/* Visual double bar chart */}
                      <div className="space-y-1">
                        {/* Event A (2025) - Gold */}
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pctA}%` }}></div>
                        </div>
                        {/* Event B (2026) - Navy */}
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pctB}%` }}></div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            
            <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold uppercase pt-4 mt-4 border-t border-border">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 bg-amber-500 rounded-full"></span> 2025 Cycle
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 bg-blue-500 rounded-full"></span> 2026 Cycle
              </div>
            </div>
          </div>

          {/* Card 2: Offering Finance comparison */}
          <div className="glass-card p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Total Offering Finance</h2>
              <div className="space-y-5">
                <div className="space-y-1">
                  <span className="text-[9px] text-muted-foreground font-bold uppercase block tracking-wider">2025 Annual Convention</span>
                  <p className="text-2xl font-extrabold font-mono text-foreground">
                    <span className="font-sans">₦</span>{comparisonStats.offering.event2025.toLocaleString()}
                  </p>
                </div>

                <div className="space-y-1 pt-4 border-t border-dashed border-border">
                  <span className="text-[9px] text-muted-foreground font-bold uppercase block tracking-wider">2026 Annual Convention</span>
                  <p className="text-3xl font-extrabold font-mono text-emerald-500">
                    <span className="font-sans">₦</span>{comparisonStats.offering.event2026.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl p-3 text-[12px] text-center font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20">
              ➔ +38.1% Increase in collections YoY
            </div>
          </div>

          {/* Card 3: Attendance Trends comparison */}
          <div className="glass-card p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Daily Attendance trends</h2>
            <div className="space-y-3.5">
              {comparisonStats.attendanceTrend.map(trend => {
                const maxVal = 1600
                const pct2025 = Math.round((trend.event2025 / maxVal) * 100)
                const pct2026 = Math.round((trend.event2026 / maxVal) * 100)
                return (
                  <div key={trend.day} className="flex items-center gap-3 text-[12px]">
                    <span className="w-12 font-semibold text-muted-foreground">{trend.day}</span>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {/* Event A (2025) */}
                        <div className="h-1.5 bg-amber-500/80 rounded" style={{ width: `${pct2025}%` }}></div>
                        <span className="text-[9px] font-mono text-muted-foreground">{trend.event2025}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Event B (2026) */}
                        <div className="h-1.5 bg-blue-500/90 rounded" style={{ width: `${pct2026}%` }}></div>
                        <span className="text-[9px] font-mono text-foreground font-bold">{trend.event2026}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* Unresolved Carry-over Challenges / Recommendations */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b flex flex-col gap-1" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">⚠️ Carry-Over Challenges &amp; Unresolved Recommendations</span>
            <p className="text-[12px] text-slate-500">Automatically matching challenges from 2025 that recurrently appeared in 2026 narrative reports.</p>
          </div>

          <div className="overflow-x-auto scrollbar-hide text-[12px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Department</th>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Matched Keyword</th>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">2025 Challenge</th>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">2025 Unaddressed Recommendation</th>
                  <th className="p-3 text-[11px] font-semibold uppercase tracking-wider text-red-400" style={{ background: 'rgba(239,68,68,0.02)' }}>2026 Recurrent Challenge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {carryOvers.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/10">
                    <td className="p-3 font-bold text-slate-200">{item.departmentName}</td>
                    <td className="p-3">
                      <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' }}>
                        {item.keywordMatched}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">{item.challenge2025}</td>
                    <td className="p-3 italic font-semibold text-slate-300">{item.recommendation2025}</td>
                    <td className="p-3 font-medium text-red-300" style={{ background: 'rgba(239,68,68,0.01)' }}>{item.challenge2026}</td>
                  </tr>
                ))}
                {carryOvers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500 italic">
                      No recurring carry-over issues detected! All recommendations from 2025 appear fully resolved.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  )
}
