'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, mockEventDays, mockEvents, Profile, DailyReport, Department } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { DashboardHeader } from '@/components/dashboard-header'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { SchemaFormRenderer } from '@/components/schema-form-renderer'
import { store } from '@/utils/supabase/mockClient'

interface Comment {
  id: string
  reportId: string
  author: string
  text: string
  timestamp: string
}

export default function SecretariatDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [eventDays, setEventDays] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [narratives, setNarratives] = useState<any[]>([])
  
  // Selection & Sheet States
  const [selectedCell, setSelectedCell] = useState<{ dept: Department; day: any } | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [activeReport, setActiveReport] = useState<any | null>(null)
  const [activeNarrative, setActiveNarrative] = useState<any | null>(null)
  
  // Comment Thread State
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  
  // Rejection/Return state
  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectionComment, setRejectionComment] = useState('')
  
  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([])

  // KPI Active Day focus
  const [selectedKPIDay, setSelectedKPIDay] = useState<string>('day-1')

  const loadData = async () => {
    const supabase = getClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(prof)

    // Load static/dynamic lists
    const { data: depts } = await supabase.from('departments').select('*')
    setDepartments(((depts || mockDepartments) as Department[]).sort((a, b) => a.name.localeCompare(b.name)))

    const { data: days } = await supabase.from('event_days').select('*').order('day_number')
    const activeDays = days || mockEventDays
    setEventDays(activeDays)
    if (activeDays.length > 0 && !selectedKPIDay) {
      setSelectedKPIDay(activeDays[0].id)
    }

    // Fetch reports & narratives
    const { data: reps } = await supabase.from('daily_reports').select('*')
    setReports(reps || [])

    const { data: narrs } = await supabase.from('department_narratives').select('*')
    setNarratives(narrs || [])

    // Load audit logs
    const { data: logs } = await supabase.from('audit_logs').select('*')
    setAuditLogs(logs || [])

    // Load comments from localStorage
    if (typeof window !== 'undefined') {
      const storedComments = localStorage.getItem('dtce_comments')
      if (storedComments) {
        setComments(JSON.parse(storedComments))
      }
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Open Slide-over Panel for a cell
  const handleCellClick = async (dept: Department, day: any) => {
    setSelectedCell({ dept, day })
    const report = reports.find(r => r.department_id === dept.id && r.event_day_id === day.id)
    setActiveReport(report || null)
    
    if (report) {
      const narrative = narratives.find(n => n.daily_report_id === report.id)
      setActiveNarrative(narrative || null)
    } else {
      setActiveNarrative(null)
    }

    setIsRejecting(false)
    setRejectionComment('')
    setIsSheetOpen(true)
  }

  // Update report status & Log to Audit
  const handleStatusChange = async (newStatus: 'draft' | 'submitted' | 'reviewed' | 'approved', commentText?: string) => {
    if (!activeReport || !profile) return

    const supabase = getClient()
    const previousStatus = activeReport.status

    try {
      // 1. Update daily reports table
      const { data: updated, error } = await supabase
        .from('daily_reports')
        .update({ status: newStatus })
        .eq('id', activeReport.id)
        .select()

      if (error) throw error

      // 2. Log change to audit table
      const logSummary = `Status changed from ${previousStatus} to ${newStatus}` + (commentText ? ` (Reason: ${commentText})` : '')
      await supabase.from('audit_logs').insert({
        reviewer_id: profile.id,
        report_id: activeReport.id,
        previous_value: previousStatus,
        new_value: newStatus,
        change_summary: logSummary
      })

      // 3. Add to report versions history
      await supabase.from('report_versions').insert({
        daily_report_id: activeReport.id,
        version_number: Math.floor(Math.random() * 100) + 2, // simulated version bump
        changed_by: profile.id,
        change_summary: logSummary,
        data: { ...activeReport, status: newStatus }
      })

      // 4. Add rejection reason as a comment if provided
      if (commentText) {
        addSystemComment(activeReport.id, `Rejection Note: ${commentText}`)
      }

      showToast(`Report status updated to ${newStatus}!`, 'success')
      setIsSheetOpen(false)
      loadData()
    } catch (err: any) {
      showToast(`Failed to update status: ${err.message}`, 'error')
    }
  }

  // Add Comment Helper
  const addSystemComment = (reportId: string, text: string) => {
    const authorName = profile?.full_name || profile?.email || 'System Reviewer'
    const newCommentObj: Comment = {
      id: Math.random().toString(36).substr(2, 9),
      reportId,
      author: authorName,
      text,
      timestamp: new Date().toISOString()
    }
    const updated = [...comments, newCommentObj]
    setComments(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem('dtce_comments', JSON.stringify(updated))
    }
  }

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !activeReport) return
    addSystemComment(activeReport.id, newComment.trim())
    setNewComment('')
  }

  // Cell status styles for dark theme
  const getCellStatusStyle = (deptId: string, dayId: string): React.CSSProperties => {
    const report = reports.find(r => r.department_id === deptId && r.event_day_id === dayId)
    if (!report) return { background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.2)' }
    switch (report.status) {
      case 'draft':     return { background: 'rgba(100,116,139,0.1)', color: '#94A3B8', border: '1px solid rgba(100,116,139,0.2)' }
      case 'submitted': return { background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.25)' }
      case 'reviewed':  return { background: 'rgba(59,130,246,0.1)', color: '#93C5FD', border: '1px solid rgba(59,130,246,0.25)' }
      case 'approved':  return { background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.25)' }
      default:          return { background: 'rgba(100,116,139,0.08)', color: '#64748B', border: '1px solid rgba(100,116,139,0.15)' }
    }
  }

  const getCellStatusLabel = (deptId: string, dayId: string) => {
    const report = reports.find(r => r.department_id === deptId && r.event_day_id === dayId)
    if (!report) return 'Missing'
    return report.status.charAt(0).toUpperCase() + report.status.slice(1)
  }

  // Compute KPI Counts for the selected KPI Day
  const getKPICounts = () => {
    const dayReports = reports.filter(r => r.event_day_id === selectedKPIDay)
    const submittedCount = dayReports.filter(r => r.status === 'submitted' || r.status === 'reviewed' || r.status === 'approved').length
    const missingCount = departments.length - dayReports.length
    const needingReview = dayReports.filter(r => r.status === 'submitted').length
    
    return {
      reporting: submittedCount,
      missing: missingCount,
      review: needingReview
    }
  }

  const kpis = getKPICounts()

  return (
    <div className="min-h-screen bg-mesh" style={{ background: '#06090F' }}>
      <DashboardHeader />

      <main className="mx-auto max-w-[1400px] px-4 md:px-6 py-8">
        <div className="flex flex-col gap-6">

          {/* Page Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-fade-in-up">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />
                <span className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Live Overview</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Secretariat Command Centre
              </h1>
              <p className="text-[13px] text-slate-500 mt-0.5">
                Real-time reporting status across all {departments.length} departments.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-slate-400">KPI Day:</span>
                <select
                  id="kpi-day-select"
                  value={selectedKPIDay}
                  onChange={(e) => setSelectedKPIDay(e.target.value)}
                  className="h-8 rounded-lg px-3 text-[12px] font-medium text-slate-300 cursor-pointer"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    outline: 'none',
                  }}
                >
                  {eventDays.map(d => (
                    <option key={d.id} value={d.id} style={{ background: '#111827' }}>
                      Day {d.day_number} — {new Date(d.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => router.push('/dashboard/reports')}
                className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold text-blue-400 transition-all duration-200"
                style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.18)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.1)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Export Pipeline
              </button>
              <button
                onClick={() => router.push('/dashboard/yoy')}
                className="flex items-center gap-1.5 h-8 rounded-lg px-4 text-[12px] font-semibold text-amber-400 transition-all duration-200"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.18)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.1)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                YoY Analytics
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-3 animate-fade-in-up-delay-1">
            {/* Card 1 */}
            <div className="glass-card p-5" style={{ borderColor: 'rgba(16,185,129,0.15)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">Reporting Today</p>
                  <p className="text-4xl font-bold font-tabular text-white">
                    {kpis.reporting}
                    <span className="text-xl text-slate-500 font-medium"> / {departments.length}</span>
                  </p>
                  <p className="text-[12px] text-emerald-400 mt-1.5 font-medium">
                    {departments.length > 0 ? Math.round((kpis.reporting / departments.length) * 100) : 0}% compliance rate
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
              <div className="mt-4 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-1 rounded-full" style={{ width: `${departments.length > 0 ? Math.round((kpis.reporting / departments.length) * 100) : 0}%`, background: 'linear-gradient(90deg, #10B981, #34D399)' }} />
              </div>
            </div>

            {/* Card 2 */}
            <div className="glass-card p-5" style={{ borderColor: 'rgba(239,68,68,0.15)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">Missing Reports</p>
                  <p className="text-4xl font-bold font-tabular" style={{ color: kpis.missing > 0 ? '#FCA5A5' : '#34D399' }}>
                    {kpis.missing}
                  </p>
                  <p className="text-[12px] text-slate-500 mt-1.5 font-medium">
                    {kpis.missing === 0 ? 'All departments reported' : `${kpis.missing} dept${kpis.missing !== 1 ? 's' : ''} pending`}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FCA5A5" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
              </div>
              <div className="mt-4 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-1 rounded-full" style={{ width: `${departments.length > 0 ? Math.round((kpis.missing / departments.length) * 100) : 0}%`, background: 'linear-gradient(90deg, #EF4444, #FCA5A5)' }} />
              </div>
            </div>

            {/* Card 3 */}
            <div className="glass-card p-5" style={{ borderColor: 'rgba(59,130,246,0.15)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">Awaiting Review</p>
                  <p className="text-4xl font-bold font-tabular text-blue-400">{kpis.review}</p>
                  <p className="text-[12px] text-slate-500 mt-1.5 font-medium">
                    {kpis.review === 0 ? 'Review queue empty' : `${kpis.review} report${kpis.review !== 1 ? 's' : ''} to review`}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
              </div>
              <div className="mt-4 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-1 rounded-full" style={{ width: `${departments.length > 0 ? Math.round((kpis.review / departments.length) * 100) : 0}%`, background: 'linear-gradient(90deg, #1D4ED8, #3B82F6)' }} />
              </div>
            </div>
          </div>

          {/* Reporting Grid */}
          <div className="glass-card overflow-hidden animate-fade-in-up-delay-2">
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Department Grid</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(16,185,129,0.4)' }} />Approved</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(59,130,246,0.4)' }} />Reviewed</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(245,158,11,0.4)' }} />Submitted</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(239,68,68,0.3)' }} />Missing</span>
              </div>
            </div>
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                    <th className="py-2.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600 w-56" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                      Department
                    </th>
                    {eventDays.map((day) => (
                      <th key={day.id} className="py-2.5 px-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600" style={{ borderRight: '1px solid rgba(255,255,255,0.05)', minWidth: '96px' }}>
                        Day {day.day_number}
                        <div className="text-[10px] font-normal text-slate-700 normal-case tracking-normal">
                          {new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept, i) => (
                    <tr
                      key={dept.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td className="py-2 px-4 text-[13px] font-medium text-slate-300" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                        {dept.name}
                      </td>
                      {eventDays.map((day) => (
                        <td key={day.id} className="p-1.5" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                          <button
                            onClick={() => handleCellClick(dept, day)}
                            className="w-full rounded-md py-1 px-2 text-[11px] font-semibold font-tabular transition-all duration-150 cursor-pointer"
                            style={{
                              ...getCellStatusStyle(dept.id, day.id),
                              letterSpacing: '0.03em',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                          >
                            {getCellStatusLabel(dept.id, day.id)}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Review Slide-over Panel */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          className="sm:max-w-xl overflow-y-auto w-full"
          style={{
            background: '#0C1220',
            border: 'none',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <SheetHeader className="pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <SheetTitle className="text-lg font-bold text-white">
              {selectedCell?.dept.name}
            </SheetTitle>
            <SheetDescription className="text-slate-500 text-[13px]">
              Day {selectedCell?.day.day_number} — {selectedCell?.day && new Date(selectedCell.day.date).toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'})}
            </SheetDescription>
          </SheetHeader>

          {activeReport ? (
            <div className="py-5 space-y-5">

              {/* Attendance stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">Morning</p>
                  <p className="text-2xl font-bold font-tabular text-white">{activeReport.attendance_morning}</p>
                </div>
                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">Evening</p>
                  <p className="text-2xl font-bold font-tabular text-white">{activeReport.attendance_evening}</p>
                </div>
              </div>

              {/* Schema Custom Metrics */}
              {selectedCell?.dept.default_metrics_schema && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Custom Metrics</p>
                  <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <SchemaFormRenderer
                      fields={selectedCell.dept.default_metrics_schema.fields}
                      value={activeReport.metrics_data}
                      onChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                </div>
              )}

              {/* Narrative */}
              {activeNarrative && (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Activity Narrative</p>
                  <div className="space-y-2 text-[13px] text-slate-300">
                    {[['Achievements', activeNarrative.key_achievements], ['Challenges', activeNarrative.challenges], ['Solutions', activeNarrative.solutions], ['Tomorrow', activeNarrative.plans_for_tomorrow]].map(([label, val]) => (
                      <div key={label as string} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 block mb-0.5">{label}</span>
                        <p className="text-slate-400">{val || 'Not provided'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comment Thread */}
              <div className="space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '16px' }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Reviewer Notes</p>
                <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                  {comments.filter(c => c.reportId === activeReport.id).length === 0 ? (
                    <p className="text-[12px] text-slate-600 italic">No notes posted yet.</p>
                  ) : (
                    comments.filter(c => c.reportId === activeReport.id).map(c => (
                      <div key={c.id} className="rounded-lg p-3 text-[12px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex justify-between text-slate-600 mb-1">
                          <span className="font-semibold text-slate-400">{c.author}</span>
                          <span className="font-tabular">{new Date(c.timestamp).toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p className="text-slate-300">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handlePostComment} className="flex gap-2">
                  <input
                    placeholder="Write a note..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="input-dark flex-1 h-8 text-[12px] py-0"
                  />
                  <button
                    type="submit"
                    className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white transition-all"
                    style={{ background: '#1E40AF', border: '1px solid rgba(59,130,246,0.3)' }}
                  >
                    Post
                  </button>
                </form>
              </div>

              {/* Actions */}
              {isRejecting ? (
                <div className="space-y-3 rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <Label className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Reason for return (Required)</Label>
                  <Textarea
                    placeholder="Explain what needs to be updated or fixed..."
                    value={rejectionComment}
                    onChange={(e) => setRejectionComment(e.target.value)}
                    rows={2}
                    className="text-[12px]"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(239,68,68,0.2)', color: '#F1F5F9' }}
                  />
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-lg py-2 text-[12px] font-semibold text-white transition-all"
                      style={{ background: 'rgba(239,68,68,0.8)' }}
                      onClick={() => handleStatusChange('draft', rejectionComment)}
                      disabled={!rejectionComment.trim()}
                    >
                      Confirm Return to Draft
                    </button>
                    <button
                      className="px-4 rounded-lg text-[12px] font-medium text-slate-400 transition-all"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                      onClick={() => setIsRejecting(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <button
                    className="flex-1 rounded-lg py-2 text-[12px] font-semibold transition-all"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}
                    onClick={() => setIsRejecting(true)}
                  >
                    Return to Draft
                  </button>
                  {activeReport.status !== 'reviewed' && (
                    <button
                      className="flex-1 rounded-lg py-2 text-[12px] font-semibold transition-all"
                      style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#93C5FD' }}
                      onClick={() => handleStatusChange('reviewed')}
                    >
                      Mark Reviewed
                    </button>
                  )}
                  {activeReport.status !== 'approved' && (
                    <button
                      className="flex-1 rounded-lg py-2 text-[12px] font-semibold text-white transition-all"
                      style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399' }}
                      onClick={() => handleStatusChange('approved')}
                    >
                      Approve Report
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FCA5A5" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <p className="text-[13px] font-semibold text-slate-400">No report submitted</p>
              <p className="text-[12px] text-slate-600 mt-1">This department has not filed a report for this day.</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
