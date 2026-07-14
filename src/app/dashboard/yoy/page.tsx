'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, Profile } from '@/utils/supabase'
import { DashboardHeader } from '@/components/dashboard-header'
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

    if (prof) {
      if (prof.role !== 'super_admin' && prof.role !== 'coordinator') {
        router.push('/my-department')
        return
      }
      setProfile(prof)
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <DashboardHeader />

      {/* Heading Block */}
      <div className="bg-white border-b border-slate-200 dark:bg-slate-950 dark:border-slate-800 py-6 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              Year-over-Year Comparison
            </h1>
            <p className="text-sm text-slate-500">
              Secretariat Analytics Panel • Compare 2025 and 2026 convention cycles.
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                ➔ Oversight Grid Matrix
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* Selector Header Bar */}
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Compare Base Year:</span>
              <select
                value={eventA}
                onChange={(e) => setEventA(e.target.value)}
                className="h-8 rounded border border-slate-200 bg-white px-2 dark:border-slate-800 dark:bg-slate-950"
              >
                <option value="event-2025">DTCE 2025 Annual Convention</option>
              </select>
            </div>
            <div className="text-slate-400 font-bold">VS</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Compare Target Year:</span>
              <select
                value={eventB}
                onChange={(e) => setEventB(e.target.value)}
                className="h-8 rounded border border-slate-200 bg-white px-2 dark:border-slate-800 dark:bg-slate-950"
              >
                <option value="event-1">DTCE 2026 Annual Convention (Active)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Charts & Key KPIs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Card 1: Registration comparison custom bar chart */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">Total Registration Comparison</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {comparisonStats.registrations.map(reg => {
                const total = Math.max(reg.event2025, reg.event2026)
                const pctA = Math.round((reg.event2025 / total) * 100)
                const pctB = Math.round((reg.event2026 / total) * 100)
                return (
                  <div key={reg.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{reg.category}</span>
                      <span className="font-mono text-slate-500">
                        {reg.event2025} <span className="text-slate-300">vs</span> {reg.event2026}
                      </span>
                    </div>
                    {/* Visual double bar chart */}
                    <div className="space-y-1">
                      {/* Event A (2025) - Gold */}
                      <div className="h-2 w-full bg-slate-100 rounded-full dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${pctA}%` }}></div>
                      </div>
                      {/* Event B (2026) - Navy */}
                      <div className="h-2 w-full bg-slate-100 rounded-full dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pctB}%` }}></div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 bg-yellow-500 rounded-full"></span> 2025 Cycle
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 bg-blue-600 rounded-full"></span> 2026 Cycle
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Offering Finance comparison */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">Total Offering Finance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 flex flex-col justify-center h-[280px]">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">2025 Annual Convention</span>
                <p className="text-3xl font-extrabold font-mono text-slate-700 dark:text-slate-300">
                  ₦{comparisonStats.offering.event2025.toLocaleString()}
                </p>
              </div>

              <div className="space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">2026 Annual Convention</span>
                <p className="text-3xl font-extrabold font-mono text-green-600 dark:text-green-400">
                  ₦{comparisonStats.offering.event2026.toLocaleString()}
                </p>
              </div>

              <div className="bg-green-50 text-green-800 dark:bg-green-950/20 dark:text-green-400 p-2.5 rounded text-xs text-center font-bold">
                ➔ +38.1% Increase in collections YoY
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Attendance Trends comparison */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">Daily Attendance trends</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {comparisonStats.attendanceTrend.map(trend => {
                const maxVal = 1600
                const pct2025 = Math.round((trend.event2025 / maxVal) * 100)
                const pct2026 = Math.round((trend.event2026 / maxVal) * 100)
                return (
                  <div key={trend.day} className="flex items-center space-x-3 text-xs">
                    <span className="w-12 font-semibold text-slate-500">{trend.day}</span>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {/* Event A (2025) */}
                        <div className="h-2 bg-yellow-500 rounded" style={{ width: `${pct2025}%` }}></div>
                        <span className="text-[9px] font-mono text-slate-400">{trend.event2025}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Event B (2026) */}
                        <div className="h-2 bg-blue-600 rounded" style={{ width: `${pct2026}%` }}></div>
                        <span className="text-[9px] font-mono text-slate-600 font-bold">{trend.event2026}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

        </div>

        {/* Unresolved Carry-over Challenges / Recommendations */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-lg">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-200">
              ⚠️ Carry-Over Challenges & Unresolved Recommendations
            </CardTitle>
            <CardDescription className="text-xs">
              Automatically matching challenges from 2025 that apparently recurred in 2026 (simple keyword matching).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 border-t border-slate-100 dark:border-slate-800">
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/50 text-slate-600 font-bold border-b border-slate-200">
                    <th className="p-3">Department</th>
                    <th className="p-3">Matched Keyword</th>
                    <th className="p-3">2025 Challenge</th>
                    <th className="p-3">2025 Unaddressed Recommendation</th>
                    <th className="p-3 bg-red-50 text-red-800">2026 Recurrent Challenge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {carryOvers.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{item.departmentName}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-800 capitalize">
                          {item.keywordMatched}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{item.challenge2025}</td>
                      <td className="p-3 italic font-semibold text-slate-700 dark:text-slate-300">{item.recommendation2025}</td>
                      <td className="p-3 bg-red-50/30 text-red-900 font-medium">{item.challenge2026}</td>
                    </tr>
                  ))}
                  {carryOvers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 italic">
                        No recurring carry-over issues detected! Outstanding recommendations from 2025 appear fully resolved.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      </main>
    </div>
  )
}
