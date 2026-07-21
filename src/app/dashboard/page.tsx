'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, mockEventDays, Profile, Department } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { SchemaFormRenderer } from '@/components/schema-form-renderer'

interface Comment {
  id: string
  reportId: string
  author: string
  text: string
  timestamp: string
}

interface StoreRequestTicket {
  id: string
  items_json: Array<{ name: string; quantity: number; category: string }>
  status: 'pending_coordinator' | 'approved' | 'declined' | 'in_progress' | 'partially_fulfilled' | 'delivered'
  reviewer_comments?: string
  reviewed_at?: string
  created_at: string
  requester_profile_id: string
  department_id: string
  assigned_approver_id?: string
  department?: { name: string }
  requester?: { full_name: string; email: string }
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  pending_coordinator: { label: 'Pending', bg: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' },
  approved:           { label: 'Approved', bg: 'rgba(59,130,246,0.1)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' },
  in_progress:        { label: 'In Progress', bg: 'rgba(139,92,246,0.1)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.2)' },
  partially_fulfilled:{ label: 'Partial', bg: 'rgba(236,72,153,0.1)', color: '#DB2777', border: '1px solid rgba(236,72,153,0.2)' },
  declined:           { label: 'Declined', bg: 'rgba(239,68,68,0.1)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' },
  delivered:          { label: 'Delivered', bg: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' },
}

export default function SecretariatDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [eventDays, setEventDays] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [narratives, setNarratives] = useState<any[]>([])
  const [storeRequests, setStoreRequests] = useState<StoreRequestTicket[]>([])
  const [approvers, setApprovers] = useState<Profile[]>([])
  
  // Selection & Sheet States for Daily Report Grid
  const [selectedCell, setSelectedCell] = useState<{ dept: Department; day: any } | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [activeReport, setActiveReport] = useState<any | null>(null)
  const [activeNarrative, setActiveNarrative] = useState<any | null>(null)
  
  // Comment Thread & Rejection State
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectionComment, setRejectionComment] = useState('')

  // Store Request Review State
  const [selectedReq, setSelectedReq] = useState<StoreRequestTicket | null>(null)
  const [actionComments, setActionComments] = useState('')
  const [delegateId, setDelegateId] = useState<string>('none')
  const [actionLoading, setActionLoading] = useState(false)

  // KPI Active Day focus
  const [selectedKPIDay, setSelectedKPIDay] = useState<string>('day-1')
  
  // Main view tab: 'overview' | 'store-requisitions' | 'rankings' | 'challenges'
  const [activeTab, setActiveTab] = useState<'overview' | 'store-requisitions' | 'rankings' | 'challenges'>('overview')

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
    setProfile(prof)

    // Load static/dynamic lists
    const { data: depts } = await supabase.from('departments').select('*')
    const deptList = ((depts || mockDepartments) as Department[]).sort((a, b) => a.name.localeCompare(b.name))
    setDepartments(deptList)

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

    // Fetch store requests
    const { data: reqsData } = await supabase
      .from('store_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (reqsData) {
      const enhanced: StoreRequestTicket[] = reqsData.map((r: any) => {
        const dept = deptList.find(d => d.id === r.department_id)
        return {
          ...r,
          department: dept || { name: 'Department' }
        }
      })
      setStoreRequests(enhanced)
    }

    // Fetch approvers for delegation
    const { data: allUsers } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['super_admin', 'coordinator', 'national_coordinator', 'assistant'])
    setApprovers(allUsers || [])

    // Load comments from localStorage
    if (typeof window !== 'undefined') {
      const storedComments = localStorage.getItem('dtce_comments')
      if (storedComments) setComments(JSON.parse(storedComments))
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Check if current user is a Coordinator Assistant (assistant role with no dept)
  const isCoordinatorAssistant = useMemo(() => {
    return profile?.role === 'assistant' && !profile?.department_id
  }, [profile])

  // Filter store requests for assistant (only ones assigned to them, or all if coordinator/admin)
  const visibleStoreRequests = useMemo(() => {
    if (isCoordinatorAssistant && profile?.id) {
      return storeRequests.filter(r => r.assigned_approver_id === profile.id)
    }
    return storeRequests
  }, [storeRequests, isCoordinatorAssistant, profile])

  // Cell Click in Grid
  const handleCellClick = (dept: Department, day: any) => {
    const rep = reports.find(r => r.department_id === dept.id && r.event_day_id === day.id)
    const narr = narratives.find(n => n.department_id === dept.id && n.event_day_id === day.id)
    setSelectedCell({ dept, day })
    setActiveReport(rep || null)
    setActiveNarrative(narr || null)
    setIsSheetOpen(true)
  }

  // Report status update
  const handleStatusChange = async (newStatus: string, commentText?: string) => {
    if (!activeReport || !profile) return
    const supabase = getClient()
    try {
      const { error } = await supabase
        .from('daily_reports')
        .update({ status: newStatus })
        .eq('id', activeReport.id)
      if (error) throw error
      showToast(`Report status updated to ${newStatus}!`, 'success')
      setIsSheetOpen(false)
      loadData()
    } catch (err: any) {
      showToast(`Failed to update status: ${err.message}`, 'error')
    }
  }

  // Store Requisition Actions
  const handleReqAction = async (status: 'approved' | 'declined') => {
    if (!selectedReq) return
    setActionLoading(true)
    const supabase = getClient()
    try {
      const { error } = await supabase
        .from('store_requests')
        .update({
          status,
          reviewer_comments: actionComments,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', selectedReq.id)

      if (error) throw error
      showToast(`Requisition ${status}!`, 'success')
      setSelectedReq(null)
      setActionComments('')
      loadData()
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelegate = async () => {
    if (!selectedReq) return
    setActionLoading(true)
    const supabase = getClient()
    try {
      const { error } = await supabase
        .from('store_requests')
        .update({ assigned_approver_id: delegateId === 'none' ? null : delegateId })
        .eq('id', selectedReq.id)

      if (error) throw error
      showToast('Authority delegated successfully!', 'success')
      setSelectedReq(null)
      setDelegateId('none')
      loadData()
    } catch (err: any) {
      showToast(`Delegation failed: ${err.message}`, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // KPI Calculations
  const kpis = useMemo(() => {
    const dayReports = reports.filter(r => r.event_day_id === selectedKPIDay)
    const submittedCount = dayReports.filter(r => ['submitted', 'reviewed', 'approved'].includes(r.status)).length
    const missingCount = Math.max(0, departments.length - dayReports.length)
    const needingReview = dayReports.filter(r => r.status === 'submitted').length
    
    // Store Requisition KPIs
    const pendingReqs = visibleStoreRequests.filter(r => r.status === 'pending_coordinator').length
    const approvedReqs = visibleStoreRequests.filter(r => r.status === 'approved' || r.status === 'in_progress' || r.status === 'partially_fulfilled').length
    const deliveredReqs = visibleStoreRequests.filter(r => r.status === 'delivered').length

    // Total Offerings aggregate
    let totalOfferings = 0
    dayReports.forEach(r => {
      if (r.metrics_data?.offering) totalOfferings += Number(r.metrics_data.offering) || 0
      if (r.metrics_data?.total_offering) totalOfferings += Number(r.metrics_data.total_offering) || 0
    })

    return {
      reporting: submittedCount,
      missing: missingCount,
      review: needingReview,
      pendingReqs,
      approvedReqs,
      deliveredReqs,
      totalOfferings
    }
  }, [reports, departments, selectedKPIDay, visibleStoreRequests])

  // Department Performance Rankings
  const deptRankings = useMemo(() => {
    return departments.map(d => {
      const deptReports = reports.filter(r => r.department_id === d.id)
      const approvedCount = deptReports.filter(r => r.status === 'approved').length
      const submittedCount = deptReports.filter(r => ['submitted', 'reviewed', 'approved'].includes(r.status)).length
      const complianceRate = eventDays.length > 0 ? Math.round((submittedCount / eventDays.length) * 100) : 0
      return {
        id: d.id,
        name: d.name,
        totalSubmitted: submittedCount,
        approvedCount,
        complianceRate
      }
    }).sort((a, b) => b.complianceRate - a.complianceRate || b.totalSubmitted - a.totalSubmitted)
  }, [departments, reports, eventDays])

  // Aggregated Key Challenges
  const aggregatedChallenges = useMemo(() => {
    return narratives
      .filter(n => n.challenges && n.challenges.trim().length > 0)
      .map(n => {
        const dept = departments.find(d => d.id === n.department_id)
        const day = eventDays.find(e => e.id === n.event_day_id)
        return {
          id: n.id,
          deptName: dept?.name || 'Department',
          dayNumber: day?.day_number || 1,
          challenges: n.challenges,
          solutions: n.solutions
        }
      })
  }, [narratives, departments, eventDays])

  // Grid Cell Styling
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

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">

        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-fade-in-up">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-ping" />
              <span className="text-[11px] font-semibold tracking-widest text-purple-400 uppercase">
                {profile?.role === 'national_coordinator' ? 'National Coordinator Executive Desk' : isCoordinatorAssistant ? 'Coordinator Assistant View' : 'Secretariat Command Centre'}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {profile?.role === 'national_coordinator' ? 'National Operations Dashboard' : 'Secretariat Command Centre'}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Comprehensive analytics, performance tracking, and store requisitions oversight.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-muted-foreground">Focus Day:</span>
              <select
                value={selectedKPIDay}
                onChange={(e) => setSelectedKPIDay(e.target.value)}
                className="h-8 rounded-lg px-3 text-[12px] font-medium text-foreground bg-card border border-border cursor-pointer outline-none"
              >
                {eventDays.map(d => (
                  <option key={d.id} value={d.id} className="bg-card text-foreground">
                    Day {d.day_number} — {new Date(d.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                  </option>
                ))}
              </select>
            </div>

            <Button size="sm" variant="outline" onClick={() => router.push('/dashboard/store-requisitions')} className="text-xs h-8">
              Store Requisitions Console ({kpis.pendingReqs} Pending)
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border gap-6 text-xs font-semibold">
          {[
            { key: 'overview', label: 'Overview & Matrix' },
            { key: 'store-requisitions', label: `Store Requisitions (${kpis.pendingReqs})` },
            { key: 'rankings', label: 'Dept Performance Rankings' },
            { key: 'challenges', label: `Reported Challenges (${aggregatedChallenges.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`pb-2.5 transition-all cursor-pointer border-b-2 ${
                activeTab === t.key
                  ? 'border-purple-500 text-purple-400 font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* KPI Cards Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 animate-fade-in-up">
          <div className="glass-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Reporting Today</p>
            <p className="text-2xl font-bold font-tabular text-foreground mt-1">{kpis.reporting} <span className="text-xs text-muted-foreground">/ {departments.length}</span></p>
            <p className="text-[10px] text-emerald-400 mt-1 font-semibold">{departments.length > 0 ? Math.round((kpis.reporting / departments.length) * 100) : 0}% compliance</p>
          </div>

          <div className="glass-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Missing Reports</p>
            <p className="text-2xl font-bold font-tabular mt-1" style={{ color: kpis.missing > 0 ? '#FCA5A5' : '#34D399' }}>{kpis.missing}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Pending submission</p>
          </div>

          <div className="glass-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Awaiting Review</p>
            <p className="text-2xl font-bold font-tabular text-blue-400 mt-1">{kpis.review}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Daily reports pending</p>
          </div>

          <div className="glass-card p-4" style={{ borderColor: kpis.pendingReqs > 0 ? 'rgba(245,158,11,0.3)' : undefined }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">Pending Store Reqs</p>
            <p className="text-2xl font-bold font-tabular text-amber-500 mt-1">{kpis.pendingReqs}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Requires approval</p>
          </div>

          <div className="glass-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Fulfilled Store Reqs</p>
            <p className="text-2xl font-bold font-tabular text-emerald-400 mt-1">{kpis.deliveredReqs}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Delivered by Stores</p>
          </div>

          <div className="glass-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-purple-400">Recorded Offering</p>
            <p className="text-2xl font-bold font-tabular text-purple-400 mt-1">₦{kpis.totalOfferings.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Focus day aggregate</p>
          </div>
        </div>

        {/* TAB 1: OVERVIEW & MATRIX */}
        {activeTab === 'overview' && (
          <div className="glass-card overflow-hidden animate-fade-in-up-delay-2">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Department Submission Matrix</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(16,185,129,0.4)' }} />Approved</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(59,130,246,0.4)' }} />Reviewed</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(245,158,11,0.4)' }} />Submitted</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(239,68,68,0.3)' }} />Missing</span>
              </div>
            </div>
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-2.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-56 border-r border-border">
                      Department
                    </th>
                    {eventDays.map((day) => (
                      <th key={day.id} className="py-2.5 px-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border" style={{ minWidth: '96px' }}>
                        Day {day.day_number}
                        <div className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                          {new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept) => (
                    <tr key={dept.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                      <td className="py-2 px-4 text-[13px] font-medium text-foreground border-r border-border">
                        {dept.name}
                      </td>
                      {eventDays.map((day) => (
                        <td key={day.id} className="p-1.5 border-r border-border/50">
                          <button
                            onClick={() => handleCellClick(dept, day)}
                            className="w-full rounded-md py-1 px-2 text-[11px] font-semibold font-tabular transition-all duration-150 cursor-pointer"
                            style={{ ...getCellStatusStyle(dept.id, day.id), letterSpacing: '0.03em' }}
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
        )}

        {/* TAB 2: STORE REQUISITIONS CONSOLE */}
        {activeTab === 'store-requisitions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
            <div className="lg:col-span-2 space-y-4">
              <Card className="glass-card border-none">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                      Pending &amp; Active Store Requisitions
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Review, approve, or delegate material requests from departments.
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {visibleStoreRequests.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No store requisitions found.</p>
                  ) : (
                    visibleStoreRequests.map((req) => {
                      const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending_coordinator
                      return (
                        <div key={req.id} className="border border-border rounded-xl p-4 space-y-3 bg-background/25">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <span className="text-[13px] font-bold text-foreground block">
                                {req.department?.name} Department
                              </span>
                              <span className="text-[10px] text-muted-foreground block mt-0.5">
                                Submitted on {new Date(req.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color, border: cfg.border }}>
                              {cfg.label}
                            </span>
                          </div>

                          <div className="p-3 bg-background/40 border border-border rounded-lg space-y-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block font-sans">Requested Items:</span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                              {req.items_json.map((it, idx) => (
                                <div key={idx} className="flex justify-between border-b border-border/40 pb-1">
                                  <span className="text-foreground">{it.name} <span className="text-[10px] text-muted-foreground capitalize">({it.category})</span></span>
                                  <span className="font-bold text-foreground font-mono">x {it.quantity}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {req.reviewer_comments && (
                            <div className="text-[11px] p-2 bg-background/50 border border-border rounded-lg text-muted-foreground">
                              <strong>Remarks:</strong> {req.reviewer_comments}
                            </div>
                          )}

                          {req.status === 'pending_coordinator' && (
                            <div className="flex gap-2 justify-end pt-1">
                              <Button size="sm" variant="outline" onClick={() => setSelectedReq(req)} className="text-xs h-8 cursor-pointer">
                                Review &amp; Approve
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sticky Action Panel */}
            <div className="lg:col-span-1">
              {selectedReq ? (
                <Card className="glass-card border-none sticky top-20">
                  <CardHeader>
                    <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                      Review: {selectedReq.department?.name} Order
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2 pb-4 border-b border-border">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Delegate Task</Label>
                      <div className="flex gap-2">
                        <Select value={delegateId} onValueChange={(val) => setDelegateId(val || 'none')}>
                          <SelectTrigger className="h-9 text-foreground bg-card border-border flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None (Review Myself)</SelectItem>
                            {approvers.filter(a => a.id !== profile?.id).map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.full_name || a.email} ({a.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button onClick={handleDelegate} disabled={actionLoading} size="sm" variant="outline" className="h-9">
                          Assign
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Review Remarks</Label>
                      <Textarea
                        value={actionComments}
                        onChange={(e) => setActionComments(e.target.value)}
                        placeholder="Add instructions or reasons..."
                        rows={3}
                        className="input-dark text-foreground text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button onClick={() => handleReqAction('declined')} disabled={actionLoading} variant="destructive" className="w-full text-xs font-semibold">
                        Decline
                      </Button>
                      <Button onClick={() => handleReqAction('approved')} disabled={actionLoading} className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                        Approve Order
                      </Button>
                    </div>

                    <Button size="sm" variant="ghost" onClick={() => setSelectedReq(null)} className="w-full text-xs mt-2">
                      Cancel
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="glass-card border-none p-6 text-center text-xs text-muted-foreground italic sticky top-20">
                  Select a pending requisition from the list to approve, decline, or delegate.
                </Card>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: DEPT PERFORMANCE RANKINGS */}
        {activeTab === 'rankings' && (
          <Card className="glass-card border-none animate-fade-in-up">
            <CardHeader>
              <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                Department Performance Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {deptRankings.map((dept, index) => (
                  <div key={dept.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-background/25">
                    <div className="flex items-center gap-3">
                      <span className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs ${
                        index === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                        index === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/40' :
                        index === 2 ? 'bg-orange-600/20 text-orange-400 border border-orange-600/40' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        #{index + 1}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-foreground">{dept.name}</p>
                        <p className="text-[10px] text-muted-foreground">{dept.totalSubmitted} report(s) submitted • {dept.approvedCount} approved</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">{dept.complianceRate}%</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Compliance</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB 4: REPORTED CHALLENGES */}
        {activeTab === 'challenges' && (
          <Card className="glass-card border-none animate-fade-in-up">
            <CardHeader>
              <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                Aggregated Operational Challenges &amp; Solutions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {aggregatedChallenges.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No operational challenges reported across departments yet.</p>
              ) : (
                aggregatedChallenges.map((item) => (
                  <div key={item.id} className="p-4 rounded-xl border border-border space-y-2 bg-background/25">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-foreground">{item.deptName} Department</span>
                      <span className="text-[10px] font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">Day {item.dayNumber}</span>
                    </div>
                    <div className="text-xs space-y-1">
                      <p className="text-red-400"><strong className="text-muted-foreground uppercase tracking-wider text-[10px] block">Challenge:</strong> {item.challenges}</p>
                      {item.solutions && (
                        <p className="text-emerald-400"><strong className="text-muted-foreground uppercase tracking-wider text-[10px] block mt-1">Proposed Solution:</strong> {item.solutions}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

      </main>

      {/* Review Slide-over Panel for Matrix */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto w-full bg-card border-l border-border">
          <SheetHeader className="pb-5 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">
              {selectedCell?.dept.name}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground text-[13px]">
              Day {selectedCell?.day.day_number} — {selectedCell?.day && new Date(selectedCell.day.date).toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'})}
            </SheetDescription>
          </SheetHeader>

          {activeReport ? (
            <div className="py-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-4 bg-muted/20 border border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Morning Attendance</p>
                  <p className="text-2xl font-bold font-tabular text-foreground">{activeReport.attendance_morning}</p>
                </div>
                <div className="rounded-xl p-4 bg-muted/20 border border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Evening Attendance</p>
                  <p className="text-2xl font-bold font-tabular text-foreground">{activeReport.attendance_evening}</p>
                </div>
              </div>

              {selectedCell?.dept.default_metrics_schema && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Custom Metrics</p>
                  <div className="rounded-xl p-4 bg-background/30 border border-border">
                    <SchemaFormRenderer
                      fields={selectedCell.dept.default_metrics_schema.fields}
                      value={activeReport.metrics_data}
                      onChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                </div>
              )}

              {activeNarrative && (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Activity Narrative</p>
                  <div className="space-y-2 text-[13px] text-foreground">
                    {[
                      ['Key Achievements', activeNarrative.key_achievements],
                      ['Challenges', activeNarrative.challenges],
                      ['Solutions', activeNarrative.solutions],
                      ['Plans for Tomorrow', activeNarrative.plans_for_tomorrow]
                    ].map(([label, val]) => (
                      <div key={label as string} className="rounded-lg p-3 bg-background/20 border border-border">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-0.5">{label}</span>
                        <p className="text-foreground">{val || 'Not provided'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                <Button size="sm" variant="destructive" onClick={() => handleStatusChange('draft')} className="flex-1 text-xs">
                  Return to Draft
                </Button>
                {activeReport.status !== 'reviewed' && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange('reviewed')} className="flex-1 text-xs">
                    Mark Reviewed
                  </Button>
                )}
                {activeReport.status !== 'approved' && (
                  <Button size="sm" onClick={() => handleStatusChange('approved')} className="flex-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                    Approve Report
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-[13px] font-semibold text-muted-foreground">No report submitted</p>
              <p className="text-[12px] text-muted-foreground mt-1">This department has not filed a report for this day.</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
