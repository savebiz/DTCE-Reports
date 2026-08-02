'use client'

import React, { useState, useEffect } from 'react'
import { getClient, isMock } from '@/utils/supabase'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PreEventRegistrationTotalsModal } from './pre-event-totals-modal'
import { Globe, Users, TrendingUp, DollarSign, Edit3, Percent, CheckCircle2 } from 'lucide-react'

interface CategoryStat {
  key: string
  label: string
  preRegistered: number
  pickedUp: number
  walkInRegs: number
  manualsDistributed: number
  revenue: number
  pickupRate: number
}

interface DailyTrendRow {
  dayNumber: number
  newRegistrations: number
  manualsDistributed: number
  revenue: number
  onlinePickups: number
}

interface RegistrationInsightPanelProps {
  userRole?: string
}

export function RegistrationInsightPanel({ userRole }: RegistrationInsightPanelProps) {
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([
    { key: 'teachers', label: 'Teachers', preRegistered: 0, pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0, pickupRate: 0 },
    { key: 'teens', label: 'Teens', preRegistered: 0, pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0, pickupRate: 0 },
    { key: 'pre_teens', label: 'Pre-teens', preRegistered: 0, pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0, pickupRate: 0 },
    { key: 'children', label: 'Children', preRegistered: 0, pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0, pickupRate: 0 }
  ])

  const [dailyTrends, setDailyTrends] = useState<DailyTrendRow[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalOnlinePreRegistered, setTotalOnlinePreRegistered] = useState(0)
  const [totalOnlinePickedUp, setTotalOnlinePickedUp] = useState(0)
  const [totalWalkInRegs, setTotalWalkInRegs] = useState(0)
  const [overallPickupRate, setOverallPickupRate] = useState(0)

  const loadData = async () => {
    setLoading(true)
    const supabase = getClient()

    try {
      let preTotalsMap: Record<string, number> = { teachers: 0, teens: 0, pre_teens: 0, children: 0 }
      let dailyReports: any[] = []

      if (!isMock) {
        // Fetch active event
        const { data: activeEvent } = await supabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()

        if (activeEvent) {
          // Fetch pre-event online totals
          const { data: preData } = await supabase
            .from('registration_pre_event_totals')
            .select('category, total_online_registered')
            .eq('event_id', activeEvent.id)

          if (preData) {
            preData.forEach((row: any) => {
              if (row.category && row.total_online_registered !== undefined) {
                preTotalsMap[row.category] = Number(row.total_online_registered) || 0
              }
            })
          }

          // Fetch Registration department ID
          const { data: depts } = await supabase
            .from('departments')
            .select('id, name')

          const regDept = (depts || []).find((d: any) => d.name && d.name.toLowerCase().includes('registration'))

          if (regDept) {
            const { data: repData } = await supabase
              .from('daily_reports')
              .select('id, event_day_id, metrics_data, event_days(day_number)')
              .eq('department_id', regDept.id)
              .in('status', ['submitted', 'reviewed', 'approved'])

            if (repData) dailyReports = repData
          }
        }
      } else {
        // Mock data fallback
        const savedMock = localStorage.getItem('dtce_mock_pre_event_totals')
        if (savedMock) {
          preTotalsMap = JSON.parse(savedMock)
        } else {
          preTotalsMap = { teachers: 450, teens: 300, pre_teens: 200, children: 150 }
        }

        // Mock daily reports
        dailyReports = [
          {
            event_days: { day_number: 1 },
            metrics_data: {
              online_manual_pickups: [
                { category: 'Teachers', count_picked_up_today: 120 },
                { category: 'Teens', count_picked_up_today: 80 },
                { category: 'Pre-teens', count_picked_up_today: 50 },
                { category: 'Children', count_picked_up_today: 40 }
              ],
              walkin_registrations: [
                { category: 'Teachers', new_registrations: 30, manuals_distributed: 30, amount_collected: 15000 },
                { category: 'Teens', new_registrations: 20, manuals_distributed: 20, amount_collected: 10000 },
                { category: 'Pre-teens', new_registrations: 15, manuals_distributed: 15, amount_collected: 7500 },
                { category: 'Children', new_registrations: 10, manuals_distributed: 10, amount_collected: 5000 }
              ]
            }
          },
          {
            event_days: { day_number: 2 },
            metrics_data: {
              online_manual_pickups: [
                { category: 'Teachers', count_picked_up_today: 150 },
                { category: 'Teens', count_picked_up_today: 100 },
                { category: 'Pre-teens', count_picked_up_today: 60 },
                { category: 'Children', count_picked_up_today: 50 }
              ],
              walkin_registrations: [
                { category: 'Teachers', new_registrations: 45, manuals_distributed: 45, amount_collected: 22500 },
                { category: 'Teens', new_registrations: 25, manuals_distributed: 25, amount_collected: 12500 },
                { category: 'Pre-teens', new_registrations: 20, manuals_distributed: 20, amount_collected: 10000 },
                { category: 'Children', new_registrations: 15, manuals_distributed: 15, amount_collected: 7500 }
              ]
            }
          }
        ]
      }

      // Process aggregated metrics
      const categoryTotals: Record<string, { pickedUp: number; walkInRegs: number; manualsDistributed: number; revenue: number }> = {
        teachers: { pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0 },
        teens: { pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0 },
        pre_teens: { pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0 },
        children: { pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0 }
      }

      const trendMap: Record<number, DailyTrendRow> = {}

      let grandRevenue = 0
      let grandPickedUp = 0
      let grandWalkIn = 0

      dailyReports.forEach((report: any) => {
        const dayNum = report.event_days?.day_number || 1
        if (!trendMap[dayNum]) {
          trendMap[dayNum] = { dayNumber: dayNum, newRegistrations: 0, manualsDistributed: 0, revenue: 0, onlinePickups: 0 }
        }

        const metrics = report.metrics_data || {}

        // SECTION A: Online Manual Pickups
        const onlinePickups = metrics.online_manual_pickups || []
        if (Array.isArray(onlinePickups)) {
          onlinePickups.forEach((item: any) => {
            const catKey = (item.category || '').toLowerCase().replace('-', '_').replace(' ', '_')
            const count = Number(item.count_picked_up_today) || 0

            grandPickedUp += count
            trendMap[dayNum].onlinePickups += count

            if (categoryTotals[catKey]) {
              categoryTotals[catKey].pickedUp += count
            } else if (catKey.includes('teacher')) {
              categoryTotals.teachers.pickedUp += count
            } else if (catKey.includes('teen') && !catKey.includes('pre')) {
              categoryTotals.teens.pickedUp += count
            } else if (catKey.includes('pre')) {
              categoryTotals.pre_teens.pickedUp += count
            } else if (catKey.includes('child')) {
              categoryTotals.children.pickedUp += count
            }
          })
        }

        // SECTION B: Offline / Walk-in Registration
        const walkins = metrics.walkin_registrations || []
        if (Array.isArray(walkins)) {
          walkins.forEach((item: any) => {
            const catKey = (item.category || '').toLowerCase().replace('-', '_').replace(' ', '_')
            const newRegs = Number(item.new_registrations) || 0
            const manuals = Number(item.manuals_distributed) || 0
            const rev = Number(item.amount_collected) || 0

            grandWalkIn += newRegs
            grandRevenue += rev

            trendMap[dayNum].newRegistrations += newRegs
            trendMap[dayNum].manualsDistributed += manuals
            trendMap[dayNum].revenue += rev

            const targetKey = categoryTotals[catKey] ? catKey :
              catKey.includes('teacher') ? 'teachers' :
              catKey.includes('teen') && !catKey.includes('pre') ? 'teens' :
              catKey.includes('pre') ? 'pre_teens' :
              catKey.includes('child') ? 'children' : null

            if (targetKey && categoryTotals[targetKey]) {
              categoryTotals[targetKey].walkInRegs += newRegs
              categoryTotals[targetKey].manualsDistributed += manuals
              categoryTotals[targetKey].revenue += rev
            }
          })
        }
      })

      // Build category stat array
      const stats: CategoryStat[] = [
        { key: 'teachers', label: 'Teachers' },
        { key: 'teens', label: 'Teens' },
        { key: 'pre_teens', label: 'Pre-teens' },
        { key: 'children', label: 'Children' }
      ].map(c => {
        const preReg = preTotalsMap[c.key] || 0
        const agg = categoryTotals[c.key] || { pickedUp: 0, walkInRegs: 0, manualsDistributed: 0, revenue: 0 }
        const rate = preReg > 0 ? Math.round((agg.pickedUp / preReg) * 100) : 0

        return {
          key: c.key,
          label: c.label,
          preRegistered: preReg,
          pickedUp: agg.pickedUp,
          walkInRegs: agg.walkInRegs,
          manualsDistributed: agg.manualsDistributed,
          revenue: agg.revenue,
          pickupRate: rate
        }
      })

      const grandPreReg = Object.values(preTotalsMap).reduce((s, v) => s + (Number(v) || 0), 0)
      const overallRate = grandPreReg > 0 ? Math.round((grandPickedUp / grandPreReg) * 100) : 0

      setCategoryStats(stats)
      setTotalOnlinePreRegistered(grandPreReg)
      setTotalOnlinePickedUp(grandPickedUp)
      setTotalWalkInRegs(grandWalkIn)
      setTotalRevenue(grandRevenue)
      setOverallPickupRate(overallRate)
      setDailyTrends(Object.values(trendMap).sort((a, b) => a.dayNumber - b.dayNumber))

    } catch (err) {
      console.warn('Error loading registration insight panel:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const canEditPreTotals = userRole === 'super_admin' || userRole === 'national_coordinator' || userRole === 'hod'

  return (
    <Card className="glass-card border border-teal-500/30 bg-[#071524]/90 shadow-xl animate-fade-in-up my-6">
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-teal-500/20 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              Registration &amp; Manual Fulfillment Insight
              <span className="text-[10px] font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/30 px-2 py-0.5 rounded-full">
                Two-Channel Analytics
              </span>
            </CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              Online manual pickup fulfillment rates vs. offline walk-in registrations and fees.
            </p>
          </div>
        </div>

        {canEditPreTotals && (
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="text-xs h-8 bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer shadow-xs border border-teal-400/30"
          >
            <Edit3 className="w-3.5 h-3.5 mr-1.5" />
            Set Pre-Event Online Totals
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-6 pt-4">
        {/* KPI Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Online Pickup Rate */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-teal-500/30 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider">Overall Pickup Rate</span>
              <Percent className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {overallPickupRate}%
            </div>
            <p className="text-[11px] text-slate-400">
              {totalOnlinePickedUp.toLocaleString()} of {totalOnlinePreRegistered.toLocaleString()} online pre-registrations picked up
            </p>
          </div>

          {/* Card 2: Total Online Manuals Picked Up */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-blue-500/30 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Online Pickups (Section A)</span>
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {totalOnlinePickedUp.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-400">
              Zero-currency pure fulfillment pickups
            </p>
          </div>

          {/* Card 3: Total Walk-In Registrations */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-purple-500/30 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">Walk-In Registrations (Section B)</span>
              <TrendingUp className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {totalWalkInRegs.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-400">
              New offline registrations during event
            </p>
          </div>

          {/* Card 4: Registration Revenue Total (Visually Distinct from Worship Offering) */}
          <div className="p-4 rounded-xl bg-teal-950/40 border border-teal-500/50 space-y-1 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-teal-300 uppercase tracking-wider">Registration Fees Collected</span>
              <DollarSign className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-teal-300">
              ₦{totalRevenue.toLocaleString()}
            </div>
            <p className="text-[10px] text-teal-400/80 italic font-medium">
              Administrative fees ONLY (Separate from Worship Offering)
            </p>
          </div>
        </div>

        {/* Category Breakdown Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Category Fulfillment &amp; Pickup Performance
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3">Category</th>
                  <th className="p-3 font-mono">Pre-Registered</th>
                  <th className="p-3 font-mono">Online Pickups</th>
                  <th className="p-3 font-mono">Pickup Rate</th>
                  <th className="p-3 font-mono">Walk-In Regs</th>
                  <th className="p-3 font-mono">Manuals Issued</th>
                  <th className="p-3 font-mono">Fee Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {categoryStats.map(stat => (
                  <tr key={stat.key} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-3 font-bold text-slate-100">{stat.label}</td>
                    <td className="p-3 font-mono text-slate-300">{stat.preRegistered.toLocaleString()}</td>
                    <td className="p-3 font-mono text-blue-400 font-semibold">{stat.pickedUp.toLocaleString()}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${stat.pickupRate >= 80 ? 'bg-emerald-400' : stat.pickupRate >= 50 ? 'bg-amber-400' : 'bg-teal-400'}`}
                            style={{ width: `${Math.min(100, stat.pickupRate)}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-slate-200">{stat.pickupRate}%</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-purple-400">{stat.walkInRegs.toLocaleString()}</td>
                    <td className="p-3 font-mono text-slate-300">{stat.manualsDistributed.toLocaleString()}</td>
                    <td className="p-3 font-mono text-teal-300 font-bold">₦{stat.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Daily Trend Table */}
        {dailyTrends.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Daily Registration &amp; Fulfillment Progression
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Event Day</th>
                    <th className="p-3 font-mono">Section A (Online Pickups)</th>
                    <th className="p-3 font-mono">Section B (New Walk-Ins)</th>
                    <th className="p-3 font-mono">Manuals Issued</th>
                    <th className="p-3 font-mono">Fee Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {dailyTrends.map(day => (
                    <tr key={day.dayNumber} className="hover:bg-slate-900/40">
                      <td className="p-3 font-bold text-slate-100">Day {day.dayNumber}</td>
                      <td className="p-3 font-mono text-blue-400 font-semibold">{day.onlinePickups.toLocaleString()}</td>
                      <td className="p-3 font-mono text-purple-400 font-semibold">{day.newRegistrations.toLocaleString()}</td>
                      <td className="p-3 font-mono text-slate-300">{day.manualsDistributed.toLocaleString()}</td>
                      <td className="p-3 font-mono text-teal-300 font-bold">₦{day.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>

      <PreEventRegistrationTotalsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={loadData}
        userRole={userRole}
      />
    </Card>
  )
}
