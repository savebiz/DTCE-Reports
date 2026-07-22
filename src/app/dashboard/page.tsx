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
  const [reviewerNote, setReviewerNote] = useState('')
  const [reportActionLoading, setReportActionLoading] = useState(false)

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
      .maybeSingle()

    if (prof) {
      setProfile(prof)
    } else if (user) {
      const meta = user.user_metadata as any
      setProfile({
        id: user.id,
        email: user.email || '',
        full_name: meta?.full_name || user.email?.split('@')[0] || 'User',
        role: meta?.role || 'assistant',
        department_id: meta?.department_id,
        must_change_password: false,
        is_active: true
      })
    }

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
    const rep = reports.find(r => 
      r.department_id === dept.id && 
      (r.event_day_id === day.id || r.event_day_id === `day-${day.day_number}`)
    )
    const narr = narratives.find(n => 
      n.department_id === dept.id && 
      (n.event_day_id === day.id || n.event_day_id === `day-${day.day_number}`)
    )
    setSelectedCell({ dept, day })
    setActiveReport(rep || null)
    setActiveNarrative(narr || null)
    // Read any previous reviewer feedback from metrics_data
    setReviewerNote(rep?.metrics_data?.reviewer_feedback?.note || '')
    setReportActionLoading(false)
    setIsSheetOpen(true)
  }

  // Report status update — stores reviewer feedback inside metrics_data (JSONB)
  const handleStatusChange = async (newStatus: string, feedbackNote?: string) => {
    if (!activeReport || !profile) return
    setReportActionLoading(true)
    const supabase = getClient()
    try {
      // Merge reviewer feedback into existing metrics_data
      const existingMetrics = activeReport.metrics_data || {}
      const updatedMetrics = {
        ...existingMetrics,
        reviewer_feedback: feedbackNote?.trim()
          ? {
              note: feedbackNote.trim(),
              reviewer_name: profile.full_name || profile.email,
              reviewer_id: profile.id,
              timestamp: new Date().toISOString(),
              action: newStatus,
            }
          : existingMetrics.reviewer_feedback,
      }

      const { error } = await supabase
        .from('daily_reports')
        .update({ status: newStatus, metrics_data: updatedMetrics })
        .eq('id', activeReport.id)

      if (error) throw error
      showToast(
        newStatus === 'draft'
          ? 'Report returned to draft. The department can now revise and resubmit.'
          : newStatus === 'reviewed'
            ? 'Report marked as reviewed.'
            : 'Report approved successfully!',
        'success'
      )
      setIsSheetOpen(false)
      setReviewerNote('')
      setReportActionLoading(false)
      loadData()
    } catch (err: any) {
      setReportActionLoading(false)
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
    const selectedDayObj = eventDays.find(d => d.id === selectedKPIDay)
    const dayReports = reports.filter(r => 
      r.event_day_id === selectedKPIDay || 
      (selectedDayObj && (r.event_day_id === `day-${selectedDayObj.day_number}` || r.event_day_id === selectedDayObj.id))
    )
    const submittedCount = dayReports.filter(r => ['submitted', 'reviewed', 'approved'].includes(r.status)).length
    const missingCount = Math.max(0, departments.length - submittedCount)
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
  }, [reports, departments, selectedKPIDay, eventDays, visibleStoreRequests])

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

        {/* Tab Switcher (Linear Cohesive Track) */}
        <div className="p-1 bg-muted/40 dark:bg-slate-800/40 rounded-xl border border-border/30 flex flex-wrap items-center gap-1">
          {[
            { key: 'overview', label: 'Overview & Matrix' },
            { key: 'store-requisitions', label: `Store Requisitions (${kpis.pendingReqs})` },
            { key: 'rankings', label: 'Dept Performance Rankings' },
            { key: 'challenges', label: `Reported Challenges (${aggregatedChallenges.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
                activeTab === t.key
                  ? 'bg-background text-foreground shadow-xs border border-border/50 font-bold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* KPI Cards Bar (Stripe Pattern Elevation & Typography) */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 animate-fade-in-up">
          <div className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)]">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Reporting Today</span>
            <span className="text-3xl font-extrabold font-mono text-foreground mt-2 mb-0.5 tracking-tight block">
              {kpis.reporting} <span className="text-xs font-sans text-muted-foreground">/ {departments.length}</span>
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{departments.length > 0 ? Math.round((kpis.reporting / departments.length) * 100) : 0}% compliance</span>
          </div>

          <div className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)]">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Missing Reports</span>
            <span className="text-3xl font-extrabold font-mono mt-2 mb-0.5 tracking-tight block" style={{ color: kpis.missing > 0 ? '#EF4444' : '#10B981' }}>{kpis.missing}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Pending submission</span>
          </div>

          <div className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)]">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Awaiting Review</span>
            <span className="text-3xl font-extrabold font-mono text-blue-600 dark:text-blue-400 mt-2 mb-0.5 tracking-tight block">{kpis.review}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Daily reports pending</span>
          </div>

          <div className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)]">
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Pending Store Reqs</span>
            <span className="text-3xl font-extrabold font-mono text-amber-600 dark:text-amber-400 mt-2 mb-0.5 tracking-tight block">{kpis.pendingReqs}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Requires approval</span>
          </div>

          <div className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)]">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Fulfilled Store Reqs</span>
            <span className="text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-2 mb-0.5 tracking-tight block">{kpis.deliveredReqs}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Delivered by Stores</span>
          </div>

          <div className="bg-card rounded-xl p-4 border border-border/50 shadow-[0_1px_3px_rgba(15,42,74,0.06),0_1px_2px_rgba(15,42,74,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-150 hover:shadow-[0_3px_8px_rgba(15,42,74,0.08)]">
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">Recorded Offering</span>
            <span className="text-3xl font-extrabold font-mono text-purple-600 dark:text-purple-400 mt-2 mb-0.5 tracking-tight block">₦{kpis.totalOfferings.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Focus day aggregate</span>
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

      {/* Report Review Slide-over Panel */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-[540px] overflow-y-auto w-full bg-card border-l border-border/40">
          {/* ── Header ─────────────────────────────────── */}
          <SheetHeader className="px-6 pt-6 pb-5 border-b border-border/40 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 18v-1"/><path d="M14 18v-3"/></svg>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Report Review</span>
              </div>
              {activeReport && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border"
                  style={
                    activeReport.status === 'submitted' ? { background: 'rgba(59,130,246,0.08)', color: '#3B82F6', borderColor: 'rgba(59,130,246,0.2)' } :
                    activeReport.status === 'reviewed'  ? { background: 'rgba(139,92,246,0.08)', color: '#8B5CF6', borderColor: 'rgba(139,92,246,0.2)' } :
                    activeReport.status === 'approved'  ? { background: 'rgba(16,185,129,0.08)', color: '#10B981', borderColor: 'rgba(16,185,129,0.2)' } :
                                                         { background: 'rgba(245,158,11,0.08)', color: '#D97706', borderColor: 'rgba(245,158,11,0.2)' }
                  }
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{
                    background: activeReport.status === 'submitted' ? '#3B82F6' :
                                activeReport.status === 'reviewed'  ? '#8B5CF6' :
                                activeReport.status === 'approved'  ? '#10B981' : '#D97706'
                  }} />
                  {activeReport.status === 'submitted' ? 'Pending Review' :
                   activeReport.status === 'reviewed'  ? 'Reviewed' :
                   activeReport.status === 'approved'  ? 'Approved' : 'Draft'}
                </span>
              )}
            </div>
            <SheetTitle className="text-lg font-extrabold text-foreground tracking-tight">
              {selectedCell?.dept.name}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              Day {selectedCell?.day.day_number} &mdash; {selectedCell?.day && new Date(`${selectedCell.day.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' })}
            </SheetDescription>
          </SheetHeader>

          {activeReport ? (
            <div className="px-6 py-5 space-y-5">

              {/* ── Section 1: Attendance ─────────────── */}
              <section>
                <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Attendance Summary
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg p-3 bg-muted/30 dark:bg-muted/10 border border-border/40 text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">Morning</span>
                    <span className="text-xl font-extrabold font-mono text-foreground mt-0.5 block tracking-tight">{activeReport.attendance_morning ?? 0}</span>
                  </div>
                  <div className="rounded-lg p-3 bg-muted/30 dark:bg-muted/10 border border-border/40 text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">Evening</span>
                    <span className="text-xl font-extrabold font-mono text-foreground mt-0.5 block tracking-tight">{activeReport.attendance_evening ?? 0}</span>
                  </div>
                  <div className="rounded-lg p-3 bg-amber-500/8 dark:bg-amber-500/10 border border-amber-500/20 text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">Combined</span>
                    <span className="text-xl font-extrabold font-mono text-amber-600 dark:text-amber-400 mt-0.5 block tracking-tight">
                      {(Number(activeReport.attendance_morning || 0) + Number(activeReport.attendance_evening || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </section>

              {/* ── Section 2: Workforce Breakdown ────── */}
              {activeReport.metrics_data?.workforce && (() => {
                const wf = activeReport.metrics_data.workforce || {}
                const rows = [
                  { label: 'Teachers / Leaders', m: Number(wf.teachersMale || 0), f: Number(wf.teachersFemale || 0) },
                  { label: 'Teenagers',          m: Number(wf.teenagersMale || 0), f: Number(wf.teenagersFemale || 0) },
                  { label: 'Pre-Teens',          m: Number(wf.preteensMale || 0),  f: Number(wf.preteensFemale || 0) },
                  { label: 'Children',           m: Number(wf.childrenMale || 0),  f: Number(wf.childrenFemale || 0) },
                ]
                const totalM = rows.reduce((s, r) => s + r.m, 0)
                const totalF = rows.reduce((s, r) => s + r.f, 0)
                const hasData = totalM + totalF > 0
                if (!hasData) return null
                return (
                  <section>
                    <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20a6 6 0 0 0-12 0"/><circle cx="12" cy="10" r="4"/><circle cx="12" cy="12" r="10"/></svg>
                      Workforce Breakdown
                    </h3>
                    <div className="rounded-lg border border-border/40 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/30 dark:bg-muted/10 border-b border-border/30">
                            <th className="text-left px-3 py-2 font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Category</th>
                            <th className="text-center px-3 py-2 font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Male</th>
                            <th className="text-center px-3 py-2 font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Female</th>
                            <th className="text-right px-3 py-2 font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => (
                            <tr key={r.label} className="border-b border-border/20 last:border-0">
                              <td className="px-3 py-1.5 font-medium text-foreground">{r.label}</td>
                              <td className="text-center px-3 py-1.5 font-mono text-muted-foreground">{r.m}</td>
                              <td className="text-center px-3 py-1.5 font-mono text-muted-foreground">{r.f}</td>
                              <td className="text-right px-3 py-1.5 font-mono font-bold text-foreground">{r.m + r.f}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-amber-500/5 dark:bg-amber-500/8">
                            <td className="px-3 py-2 font-extrabold text-amber-600 dark:text-amber-400 text-[11px]">Total</td>
                            <td className="text-center px-3 py-2 font-mono font-bold text-amber-600 dark:text-amber-400">{totalM}</td>
                            <td className="text-center px-3 py-2 font-mono font-bold text-amber-600 dark:text-amber-400">{totalF}</td>
                            <td className="text-right px-3 py-2 font-mono font-extrabold text-amber-600 dark:text-amber-400 text-sm">{totalM + totalF}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                )
              })()}

              {/* ── Section 3: Financial Offering ─────── */}
              {(activeReport.metrics_data?.offering !== undefined || activeReport.metrics_data?.total_offering !== undefined) && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                    Financial Record
                  </h3>
                  <div className="rounded-lg p-3.5 bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/15 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 block">Recorded Offering</span>
                      <span className="text-[10px] text-muted-foreground">Convention session collection</span>
                    </div>
                    <span className="text-xl font-extrabold font-mono text-purple-600 dark:text-purple-400 tracking-tight shrink-0">
                      ₦{(Number(activeReport.metrics_data?.offering || activeReport.metrics_data?.total_offering || 0)).toLocaleString()}
                    </span>
                  </div>
                </section>
              )}

              {/* ── Section 4: Custom Schema Metrics ──── */}
              {activeReport.metrics_data?.custom_schema && typeof activeReport.metrics_data.custom_schema === 'object' && Object.keys(activeReport.metrics_data.custom_schema).length > 0 && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    Operational Metrics
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(activeReport.metrics_data.custom_schema).map(([key, val]) => (
                      <div key={key} className="rounded-lg p-2.5 bg-muted/20 dark:bg-muted/10 border border-border/30">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                          {key.replace(/[_-]/g, ' ')}
                        </span>
                        <span className="font-mono font-bold text-foreground text-sm mt-0.5 block">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val || '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Section 5: SchemaFormRenderer (dept custom schema) ── */}
              {selectedCell?.dept.default_metrics_schema?.fields && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                    Department-Specific Fields
                  </h3>
                  <div className="rounded-lg p-3.5 bg-muted/20 dark:bg-muted/10 border border-border/30">
                    <SchemaFormRenderer
                      fields={selectedCell.dept.default_metrics_schema.fields}
                      value={activeReport.metrics_data}
                      onChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                </section>
              )}

              {/* ── Section 6: Daily Narrative ────────── */}
              {(() => {
                const dn = activeReport.metrics_data?.daily_narrative || {}
                const narrativeSections = [
                  { label: 'Key Achievements',         value: dn.achievements || activeNarrative?.key_achievements },
                  { label: 'Overview',                 value: dn.overview },
                  { label: 'Challenges',               value: dn.challenges || activeNarrative?.challenges },
                  { label: 'Recommendations',          value: dn.recommendations || activeNarrative?.solutions || activeNarrative?.plans_for_tomorrow },
                ].filter(s => s.value && String(s.value).trim().length > 0)

                if (narrativeSections.length === 0 && !activeNarrative) return null

                return (
                  <section>
                    <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                      Daily Narrative
                    </h3>
                    {narrativeSections.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No narrative notes were submitted for this day.</p>
                    ) : (
                      <div className="space-y-2">
                        {narrativeSections.map(s => (
                          <div key={s.label} className="rounded-lg p-3 bg-muted/20 dark:bg-muted/10 border border-border/30">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">{s.label}</span>
                            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{s.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })()}

              {/* ── Previous Reviewer Feedback (from metrics_data) ── */}
              {activeReport.metrics_data?.reviewer_feedback?.note && (
                <div className="flex gap-2.5 rounded-lg p-3 bg-amber-500/5 dark:bg-amber-500/8 border border-amber-500/15">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 flex-shrink-0 mt-0.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <div className="text-xs space-y-0.5">
                    <span className="font-bold text-amber-700 dark:text-amber-400 block">Previous Reviewer Feedback</span>
                    <p className="text-foreground leading-relaxed">{activeReport.metrics_data.reviewer_feedback.note}</p>
                    {activeReport.metrics_data.reviewer_feedback.reviewer_name && (
                      <span className="text-[10px] text-muted-foreground">
                        — {activeReport.metrics_data.reviewer_feedback.reviewer_name}, {new Date(activeReport.metrics_data.reviewer_feedback.timestamp).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* ── Action Bar ────────────────────────── */}
              <div className="pt-4 border-t border-border/40 space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="reviewer-feedback" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Reviewer Feedback
                  </label>
                  <Textarea
                    id="reviewer-feedback"
                    value={reviewerNote}
                    onChange={e => setReviewerNote(e.target.value)}
                    placeholder="Add instructions, corrections needed, or approval notes..."
                    rows={2}
                    className="text-xs text-foreground bg-background border-border/50 focus:border-amber-500/50 focus:ring-amber-500/20"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reportActionLoading}
                    onClick={() => handleStatusChange('draft', reviewerNote)}
                    className="w-full sm:flex-1 h-10 px-2.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer transition-colors whitespace-nowrap justify-center shrink-0"
                  >
                    {reportActionLoading ? (
                      <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    ) : (
                      <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 shrink-0"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Return to Draft</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reportActionLoading || activeReport.status === 'reviewed'}
                    onClick={() => handleStatusChange('reviewed', reviewerNote)}
                    className="w-full sm:flex-1 h-10 px-2.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20 hover:bg-blue-50 dark:hover:bg-blue-500/10 cursor-pointer transition-colors disabled:opacity-40 whitespace-nowrap justify-center shrink-0"
                  >
                    {reportActionLoading ? (
                      <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    ) : (
                      <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 shrink-0"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> Mark Reviewed</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    disabled={reportActionLoading || activeReport.status === 'approved'}
                    onClick={() => handleStatusChange('approved', reviewerNote)}
                    className="w-full sm:flex-1 h-10 px-2.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition-colors disabled:opacity-40 whitespace-nowrap justify-center shrink-0"
                  >
                    {reportActionLoading ? (
                      <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    ) : (
                      <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 shrink-0"><polyline points="20 6 9 17 4 12"/></svg> Approve</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-3">
              <div className="h-12 w-12 rounded-xl bg-muted/30 border border-border/40 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">No report filed</p>
                <p className="text-xs text-muted-foreground mt-0.5">This department has not submitted a report for this day.</p>
                <Button
                  size="sm"
                  onClick={() => {
                    setIsSheetOpen(false)
                    router.push(`/dashboard/manual-entry?deptId=${selectedCell?.dept.id}&dayId=${selectedCell?.day.id}`)
                  }}
                  className="mt-4 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black cursor-pointer shadow-xs"
                >
                  📝 Digitise Manual Paper Report
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
