'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, mockEventDays, mockEvents, Profile, DailyReport, Department } from '@/utils/supabase'
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

      alert(`Report status updated to ${newStatus}!`)
      setIsSheetOpen(false)
      loadData()
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`)
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

  // Cell status colors
  const getCellStatusClass = (deptId: string, dayId: string) => {
    const report = reports.find(r => r.department_id === deptId && r.event_day_id === dayId)
    if (!report) return 'bg-slate-100 hover:bg-slate-200 text-slate-400 dark:bg-slate-900/50 dark:hover:bg-slate-900 dark:text-slate-500' // missing
    
    switch (report.status) {
      case 'draft':
        return 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800 dark:bg-yellow-950/20 dark:hover:bg-yellow-950/30 dark:text-yellow-400'
      case 'submitted':
        return 'bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-950/20 dark:hover:bg-blue-950/30 dark:text-blue-400'
      case 'reviewed':
        return 'bg-purple-100 hover:bg-purple-200 text-purple-800 dark:bg-purple-950/20 dark:hover:bg-purple-950/30 dark:text-purple-400'
      case 'approved':
        return 'bg-green-100 hover:bg-green-200 text-green-800 dark:bg-green-950/20 dark:hover:bg-green-950/30 dark:text-green-400'
      default:
        return 'bg-slate-100 text-slate-400'
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <DashboardHeader />

      <main className="container mx-auto px-6 py-8">
        <div className="flex flex-col space-y-6">
          
          {/* Header & KPI Day Focus Selector */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Secretariat Reporting Overview
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Check reporting status across all 40 departments in real-time.
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Label htmlFor="kpi-day-select" className="text-sm font-semibold shrink-0">Focus Day KPI:</Label>
              <select
                id="kpi-day-select"
                value={selectedKPIDay}
                onChange={(e) => setSelectedKPIDay(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
              >
                {eventDays.map(d => (
                  <option key={d.id} value={d.id}>Day {d.day_number} ({new Date(d.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Monday/Monday-style KPI Summary Strip */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Departments Reporting Today</p>
                  <h3 className="text-3xl font-bold font-mono">{kpis.reporting} / {departments.length}</h3>
                </div>
                <div className="rounded-full bg-green-500/10 p-3 text-green-600">
                  ✓
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reports Missing Today</p>
                  <h3 className="text-3xl font-bold font-mono text-slate-400">{kpis.missing}</h3>
                </div>
                <div className="rounded-full bg-slate-500/10 p-3 text-slate-500">
                  ✕
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reports Needing Review</p>
                  <h3 className="text-3xl font-bold font-mono text-blue-600 dark:text-blue-400">{kpis.review}</h3>
                </div>
                <div className="rounded-full bg-blue-500/10 p-3 text-blue-600">
                  👁️
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Airtable-style grid table */}
          <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-64 border-r border-slate-200 dark:border-slate-800">
                      Department
                    </th>
                    {eventDays.map((day) => (
                      <th key={day.id} className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-center border-r border-slate-200 dark:border-slate-800">
                        Day {day.day_number}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {departments.map((dept) => (
                    <tr key={dept.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10">
                      <td className="py-2.5 px-4 font-semibold text-sm text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">
                        {dept.name}
                      </td>
                      {eventDays.map((day) => (
                        <td key={day.id} className="p-1 border-r border-slate-200 dark:border-slate-800 text-center">
                          <button
                            onClick={() => handleCellClick(dept, day)}
                            className={`w-full py-1.5 px-3 rounded text-xs font-bold font-mono transition-all border border-transparent ${getCellStatusClass(dept.id, day.id)}`}
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
          </Card>
        </div>
      </main>

      {/* Airtable-style right slide-over Sheet panel */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto w-full">
          <SheetHeader className="pb-6 border-b border-slate-100 dark:border-slate-800">
            <SheetTitle className="text-xl font-bold">
              {selectedCell?.dept.name}
            </SheetTitle>
            <SheetDescription>
              Reviewing Day {selectedCell?.day.day_number} report ({selectedCell?.day && new Date(selectedCell.day.date).toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'})})
            </SheetDescription>
          </SheetHeader>

          {activeReport ? (
            <div className="py-6 space-y-6">
              
              {/* Submission Information */}
              <div className="grid grid-cols-2 gap-4 border border-slate-100 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-900/50 text-sm">
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase">Morning Attendance</span>
                  <p className="text-lg font-bold font-mono">{activeReport.attendance_morning}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase">Evening Attendance</span>
                  <p className="text-lg font-bold font-mono">{activeReport.attendance_evening}</p>
                </div>
              </div>

              {/* Schema Custom Metrics Renderer (Read Only) */}
              {selectedCell?.dept.default_metrics_schema && (
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-bold uppercase block">Custom Metrics</span>
                  <div className="border border-slate-100 rounded-lg p-4 bg-slate-50/30">
                    <SchemaFormRenderer
                      fields={selectedCell.dept.default_metrics_schema.fields}
                      value={activeReport.metrics_data}
                      onChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                </div>
              )}

              {/* Narrative fields */}
              {activeNarrative && (
                <div className="space-y-4 text-sm">
                  <span className="text-xs text-slate-400 font-bold uppercase block">Activity Narrative</span>
                  <div className="space-y-3">
                    <p><strong>Achievements:</strong> {activeNarrative.key_achievements || 'None'}</p>
                    <p><strong>Challenges:</strong> {activeNarrative.challenges || 'None'}</p>
                    <p><strong>Solutions:</strong> {activeNarrative.solutions || 'None'}</p>
                    <p><strong>Tomorrow Plans:</strong> {activeNarrative.plans_for_tomorrow || 'None'}</p>
                    <p><strong>Feedback:</strong> {activeNarrative.feedback || 'None'}</p>
                  </div>
                </div>
              )}

              {/* Review Comment Thread */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-6 space-y-4">
                <span className="text-xs text-slate-400 font-bold uppercase block">Reviewer Notes & Chat</span>
                
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {comments.filter(c => c.reportId === activeReport.id).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No notes posted yet.</p>
                  ) : (
                    comments.filter(c => c.reportId === activeReport.id).map(c => (
                      <div key={c.id} className="rounded bg-slate-50 p-2.5 dark:bg-slate-900 text-xs border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          <span>{c.author}</span>
                          <span className="font-mono">{new Date(c.timestamp).toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handlePostComment} className="flex space-x-2">
                  <Input
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button type="submit" size="sm" className="h-8 text-xs">Post</Button>
                </form>
              </div>

              {/* Rejection / Send-back UI */}
              {isRejecting ? (
                <div className="border-t border-red-100 dark:border-red-950/20 pt-6 space-y-3 bg-red-50/20 p-4 rounded-lg">
                  <Label htmlFor="reject-comment" className="text-xs font-bold text-red-700 dark:text-red-400 uppercase">Reason for return (Required)</Label>
                  <Textarea
                    id="reject-comment"
                    placeholder="Explain what needs to be updated or fixed in the report..."
                    value={rejectionComment}
                    onChange={(e) => setRejectionComment(e.target.value)}
                    rows={2}
                    className="text-xs"
                  />
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="text-xs"
                      onClick={() => handleStatusChange('draft', rejectionComment)}
                      disabled={!rejectionComment.trim()}
                    >
                      Confirm Return to Draft
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => setIsRejecting(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* Action controls strip */
                <div className="border-t border-slate-100 dark:border-slate-800 pt-6 flex flex-wrap gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => setIsRejecting(true)}
                  >
                    ↩ Send back to Draft
                  </Button>
                  
                  {activeReport.status !== 'reviewed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-purple-200 text-purple-600 hover:bg-purple-50"
                      onClick={() => handleStatusChange('reviewed')}
                    >
                      👁️ Mark as Reviewed
                    </Button>
                  )}

                  {activeReport.status !== 'approved' && (
                    <Button
                      size="sm"
                      className="text-xs bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleStatusChange('approved')}
                    >
                      ✓ Approve Report
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 italic">
              No report submitted for this day.
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
