'use client'

import React, { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getClient, isMock, mockDepartments, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription'
import { fetchEnhancedStoreRequests } from '@/utils/batch-queries'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { AlertTriangle, X, ClipboardList, Package, CheckCircle2, Clock, AlertCircle, ShoppingBag, ArrowLeft, ArrowRight, ShoppingCart, Download, RefreshCw, Check } from 'lucide-react'
import { getCurrentEvent } from '@/lib/events/current-event'
import { isGeneralSecretary } from '@/lib/auth/titles'
import { ModernSelect } from '@/components/ui/modern-select'

interface RequestItem {
  inventory_item_id?: string | null
  name: string
  quantity: number
  requested_quantity?: number
  approved_quantity?: number
  category?: string
  unit?: string
}

interface EditableItem {
  inventory_item_id?: string | null
  name: string
  requested_quantity: number
  approved_quantity: number
  category?: string
  unit?: string
}

type ReqStatus = 'pending_coordinator' | 'approved' | 'declined' | 'in_progress' | 'partially_fulfilled' | 'ready_for_collection' | 'delivered'

interface StoreRequestTicket {
  id: string
  items_json: RequestItem[]
  status: ReqStatus
  reviewer_comments?: string
  reviewed_at?: string
  created_at: string
  request_type?: 'pre_event' | 'during_event'
  requester_profile_id: string
  department_id: string
  assigned_approver_id?: string
  requester?: {
    full_name: string
    email: string
  }
  department?: {
    name: string
  }
}

const STATUS_CONFIG: Record<ReqStatus, { label: string; bg: string; color: string; border: string }> = {
  pending_coordinator:  { label: 'Pending Approval', bg: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' },
  approved:            { label: 'Approved', bg: 'rgba(59,130,246,0.1)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' },
  in_progress:         { label: 'In Progress', bg: 'rgba(139,92,246,0.1)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.2)' },
  partially_fulfilled: { label: 'Partial', bg: 'rgba(236,72,153,0.1)', color: '#DB2777', border: '1px solid rgba(236,72,153,0.2)' },
  ready_for_collection:{ label: 'Ready for Collection', bg: 'rgba(245,158,11,0.2)', color: '#D97706', border: '1px solid rgba(245,158,11,0.4)' },
  declined:            { label: 'Declined', bg: 'rgba(239,68,68,0.1)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' },
  delivered:           { label: 'Delivered', bg: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' },
}

const PRE_EVENT_FILTER_TABS: { key: 'all' | 'pending_coordinator' | 'approved' | 'declined'; label: string }[] = [
  { key: 'all', label: 'All Needs Lists' },
  { key: 'pending_coordinator', label: 'Awaiting Approval' },
  { key: 'approved', label: 'Approved for Market' },
  { key: 'declined', label: 'Declined' },
]

const DURING_EVENT_FILTER_TABS: { key: ReqStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending_coordinator', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'partially_fulfilled', label: 'Partial' },
  { key: 'ready_for_collection', label: 'Ready for Collection' },
  { key: 'declined', label: 'Declined' },
  { key: 'delivered', label: 'Delivered' },
]

const ADMIN_ROLES = ['super_admin', 'coordinator', 'national_coordinator']

function AdminRequisitionsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetId = searchParams.get('id')
  const modeParam = searchParams.get('mode')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [activeEvent, setActiveEvent] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<StoreRequestTicket[]>([])
  const [activeDepartments, setActiveDepartments] = useState<Array<{ id: string; name: string }>>([])

  // Workflow Mode: 'pre_event' (Pre-Congress Needs Lists for Market) vs 'during_event' (Live Event Store Requisitions)
  const [workflowMode, setWorkflowMode] = useState<'pre_event' | 'during_event'>(
    modeParam === 'during_event' ? 'during_event' : 'pre_event'
  )
  const [showMissingDepts, setShowMissingDepts] = useState(false)

  // Available reviewers list for delegation dropdown
  const [approvers, setApprovers] = useState<Profile[]>([])
  const [catalogItems, setCatalogItems] = useState<any[]>([])

  // Review Modal State
  const [selectedReq, setSelectedReq] = useState<StoreRequestTicket | null>(null)
  const [quickApprovingId, setQuickApprovingId] = useState<string | null>(null)
  const [actionComments, setActionComments] = useState('')
  const [delegateId, setDelegateId] = useState<string>('none')
  const [editableItems, setEditableItems] = useState<EditableItem[]>([])

  // Filter & Search State
  const [activeFilter, setActiveFilter] = useState<ReqStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setCurrentPage(1)
  }, [activeFilter, searchQuery, workflowMode])

  const selectReqForReview = (req: StoreRequestTicket) => {
    setSelectedReq(req)
    setActionComments(req.reviewer_comments || '')
    setDelegateId(req.assigned_approver_id || 'none')
    setEditableItems(
      (req.items_json || []).map(it => ({
        inventory_item_id: it.inventory_item_id || null,
        name: it.name,
        requested_quantity: it.requested_quantity ?? it.quantity,
        approved_quantity: it.approved_quantity ?? it.quantity,
        category: it.category,
        unit: it.unit
      }))
    )
  }

  const loadData = useCallback(async () => {
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
    if (!activeProfile) {
      const meta = (user.user_metadata || {}) as any
      activeProfile = {
        id: user.id,
        role: meta.role || 'hod',
        department_id: meta.department_id || 'dept-10'
      }
    }
    setProfile(activeProfile)

    if (!ADMIN_ROLES.includes(activeProfile.role)) {
      if (!isMock) {
        const evForCheck = await getCurrentEvent(supabase)
        let assignedQuery = supabase
          .from('store_requests')
          .select('id')
          .eq('assigned_approver_id', activeProfile.id)
        if (evForCheck?.id) assignedQuery = assignedQuery.eq('event_id', evForCheck.id)
        const { data: hasAssigned } = await assignedQuery.limit(1)
        if (!hasAssigned || hasAssigned.length === 0) {
          router.push('/dashboard')
          return
        }
      } else {
        router.push('/dashboard')
        return
      }
    }

    if (!isMock) {
      const currentEvent = await getCurrentEvent(supabase)
      if (currentEvent) {
        setActiveEvent(currentEvent)
        if (!modeParam) {
          setWorkflowMode(currentEvent.status === 'live' ? 'during_event' : 'pre_event')
        }
      }
      const currentEventId = currentEvent?.id
      let reqsQuery = supabase.from('store_requests').select('*')
      if (currentEventId) reqsQuery = reqsQuery.eq('event_id', currentEventId)

      let assignQuery = supabase.from('hod_assignments').select('department_id')
      if (currentEventId) assignQuery = assignQuery.eq('event_id', currentEventId)

      const [reqsRes, usersRes, invRes, deptsRes, assignRes] = await Promise.all([
        reqsQuery.order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'coordinator'),
        supabase.from('inventory_items').select('*'),
        supabase.from('departments').select('id, name').order('name', { ascending: true }),
        assignQuery,
      ])

      if (reqsRes.data) {
        const enhanced = await fetchEnhancedStoreRequests(supabase, reqsRes.data)
        setRequests(enhanced)
      }
      if (usersRes.data) setApprovers(usersRes.data)
      if (invRes.data) setCatalogItems(invRes.data)

      const allDepts = deptsRes.data || []
      const teamDeptIds = new Set((assignRes.data || []).map((a: any) => a.department_id).filter(Boolean))
      if (teamDeptIds.size > 0) {
        setActiveDepartments(allDepts.filter((d: any) => teamDeptIds.has(d.id)))
      } else {
        setActiveDepartments(allDepts)
      }
    } else {
      const { store: mockStore } = require('@/utils/supabase/mockClient')
      setCatalogItems(mockStore.inventoryItems || [])
      setActiveDepartments(mockDepartments.map(d => ({ id: d.id, name: d.name })))
      setRequests([
        {
          id: 'req-mock-1',
          request_type: 'pre_event',
          items_json: [{ name: 'Analgesics (Paracetamol)', quantity: 200, requested_quantity: 200, approved_quantity: 200, category: 'consumable', unit: 'packs' }],
          status: 'pending_coordinator',
          created_at: new Date().toISOString(),
          requester_profile_id: 'user-hod-med',
          department_id: 'dept-10',
          requester: { full_name: 'Dr. Smith (HOD)', email: 'smith.medical@dtce.org' },
          department: { name: 'Medical' }
        },
        {
          id: 'req-mock-2',
          request_type: 'pre_event',
          items_json: [
            { name: 'Mattresses', quantity: 50, requested_quantity: 50, approved_quantity: 50, unit: 'pcs', category: 'durable' },
            { name: 'Pillows', quantity: 50, requested_quantity: 50, approved_quantity: 40, unit: 'pcs', category: 'durable' }
          ],
          status: 'approved',
          created_at: new Date(Date.now() - 86400000).toISOString(),
          requester_profile_id: 'user-hod-accomm',
          department_id: 'dept-1',
          reviewer_comments: 'Approved for Congress market purchase.',
          reviewed_at: new Date(Date.now() - 86400000).toISOString(),
          requester: { full_name: 'Elder Robert', email: 'robert.accomm@dtce.org' },
          department: { name: 'Accommodation' }
        }
      ])
    }
  }, [router, modeParam])

  useRealtimeSubscription({
    channelName: 'admin-store-requisitions',
    subscriptions: [{ table: 'store_requests' }],
    onDataChange: () => loadData(),
  })

  useEffect(() => {
    loadData()
  }, [loadData])

  const autoOpenedTargetRef = useRef<string | null>(null)

  // Automatically open review modal once when navigated with ?id=[req.id]
  useEffect(() => {
    if (targetId && requests.length > 0 && autoOpenedTargetRef.current !== targetId) {
      const match = requests.find(r => r.id === targetId || r.id.substring(0, 8) === targetId.substring(0, 8))
      if (match) {
        autoOpenedTargetRef.current = targetId
        if (match.request_type === 'pre_event') setWorkflowMode('pre_event')
        else setWorkflowMode('during_event')
        selectReqForReview(match)
      }
    }
  }, [targetId, requests])

  // Separate requests by workflow stage
  const preEventRequests = useMemo(
    () => requests.filter(r => r.request_type === 'pre_event'),
    [requests]
  )
  const duringEventRequests = useMemo(
    () => requests.filter(r => (r.request_type || 'during_event') === 'during_event'),
    [requests]
  )

  const modeRequests = workflowMode === 'pre_event' ? preEventRequests : duringEventRequests

  // Pre-Event Analytics for Gen Sec & National Coordinator
  const preEventAnalytics = useMemo(() => {
    const submittedDeptIds = new Set(preEventRequests.map(r => r.department_id))
    const pendingLists = preEventRequests.filter(r => r.status === 'pending_coordinator')
    const approvedLists = preEventRequests.filter(r => r.status !== 'pending_coordinator' && r.status !== 'declined')

    const distinctItems = new Set<string>()
    let totalUnitsRequested = 0
    let totalUnitsApproved = 0

    for (const r of preEventRequests) {
      if (r.status === 'declined') continue
      for (const it of r.items_json || []) {
        distinctItems.add(String(it.name || '').trim().toLowerCase())
        const reqQ = Number(it.requested_quantity ?? it.quantity) || 0
        const appQ = Number(it.approved_quantity ?? it.quantity) || 0
        totalUnitsRequested += reqQ
        if (r.status !== 'pending_coordinator') {
          totalUnitsApproved += appQ
        }
      }
    }

    const submittedDepts = activeDepartments.filter(d => submittedDeptIds.has(d.id))
    const missingDepts = activeDepartments.filter(d => !submittedDeptIds.has(d.id))

    return {
      totalDepts: activeDepartments.length,
      submittedDeptsCount: submittedDepts.length,
      missingDeptsCount: missingDepts.length,
      submittedDepts,
      missingDepts,
      pendingListsCount: pendingLists.length,
      approvedListsCount: approvedLists.length,
      distinctItemsCount: distinctItems.size,
      totalUnitsRequested,
      totalUnitsApproved,
      compliancePct: activeDepartments.length > 0
        ? Math.round((submittedDepts.length / activeDepartments.length) * 100)
        : 0,
    }
  }, [preEventRequests, activeDepartments])

  const filteredRequests = useMemo(() => {
    let results = modeRequests
    if (activeFilter !== 'all') {
      if (workflowMode === 'pre_event' && activeFilter === 'approved') {
        results = results.filter(r => r.status !== 'pending_coordinator' && r.status !== 'declined')
      } else {
        results = results.filter(r => r.status === activeFilter)
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      results = results.filter(r =>
        (r.department?.name || '').toLowerCase().includes(q) ||
        (r.requester?.full_name || '').toLowerCase().includes(q) ||
        (Array.isArray(r.items_json) && r.items_json.some(it => (it.name || '').toLowerCase().includes(q)))
      )
    }
    return results
  }, [modeRequests, activeFilter, searchQuery, workflowMode])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: modeRequests.length }
    for (const key of Object.keys(STATUS_CONFIG)) {
      if (workflowMode === 'pre_event' && key === 'approved') {
        c[key] = modeRequests.filter(r => r.status !== 'pending_coordinator' && r.status !== 'declined').length
      } else {
        c[key] = modeRequests.filter(r => r.status === key).length
      }
    }
    return c
  }, [modeRequests, workflowMode])

  const formatPendingAge = (isoDate: string) => {
    const ms = Math.max(0, Date.now() - new Date(isoDate).getTime())
    const mins = Math.floor(ms / 60000)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ${mins % 60}m`
    const days = Math.floor(hrs / 24)
    return `${days}d ${hrs % 24}h`
  }

  const handleQuickApprove = async (req: StoreRequestTicket) => {
    const baseItems = Array.isArray(req.items_json)
      ? req.items_json.map((it: any) => ({
          ...it,
          requested_quantity: it.requested_quantity ?? it.quantity ?? 1,
          approved_quantity: it.requested_quantity ?? it.quantity ?? 1,
          quantity: it.requested_quantity ?? it.quantity ?? 1,
        }))
      : []
    if (baseItems.length === 0) {
      showToast('Requisition has no line items to approve.', 'error')
      return
    }
    setQuickApprovingId(req.id)
    try {
      const res = await fetch('/api/update-store-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: req.id,
          status: 'approved',
          comments: 'Approved as requested',
          items_json: baseItems,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to approve requisition')
      showToast(`Approved ${req.department?.name || 'Department'} requisition as requested.`, 'success')
      loadData()
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error')
    } finally {
      setQuickApprovingId(null)
    }
  }

  const handleAction = async (status: ReqStatus) => {
    if (!selectedReq) return

    let finalItems: any[] | undefined = undefined
    if (status === 'approved') {
      const validItems = editableItems
        .filter(it => it.approved_quantity > 0)
        .map(it => ({
          inventory_item_id: it.inventory_item_id || null,
          name: it.name,
          requested_quantity: it.requested_quantity,
          approved_quantity: it.approved_quantity,
          quantity: it.approved_quantity,
          category: it.category || 'consumable',
          unit: it.unit || 'pcs',
        }))

      if (validItems.length === 0) {
        showToast('Cannot approve a list with 0 items. Please use Decline instead.', 'error')
        return
      }
      finalItems = validItems
    }

    setLoading(true)

    if (isMock) {
      showToast(
        selectedReq.request_type === 'pre_event'
          ? `Pre-Event Needs List ${status === 'approved' ? 'Approved for Market Purchase' : 'Declined'} (Mock)!`
          : `Request ${status === 'approved' ? 'Approved' : 'Declined'} successfully (Mock)!`,
        'success'
      )
      setRequests(prev => prev.map(r => r.id === selectedReq.id ? {
        ...r,
        status,
        reviewer_comments: actionComments,
        items_json: finalItems || r.items_json
      } : r))
      setSelectedReq(null)
      setActionComments('')
      setEditableItems([])
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/update-store-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedReq.id,
          status,
          reviewerComments: actionComments,
          items_json: finalItems
        })
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update request')
      }

      showToast(
        selectedReq.request_type === 'pre_event'
          ? `Pre-Event Needs List ${status === 'approved' ? 'Approved & Added to Market List' : 'Declined'}!`
          : `Store Requisition ${status === 'approved' ? 'Approved' : 'Declined'} successfully!`,
        'success'
      )
      setSelectedReq(null)
      setActionComments('')
      setEditableItems([])
      loadData()
    } catch (err: any) {
      showToast(`Failed to update request: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelegate = async () => {
    if (!selectedReq) return
    setLoading(true)
    const targetUserId = delegateId === 'none' ? null : delegateId

    if (isMock) {
      showToast('Authority delegated successfully (Mock)!', 'success')
      setRequests(prev => prev.map(r => r.id === selectedReq.id ? { ...r, assigned_approver_id: targetUserId || undefined } : r))
      setSelectedReq(null)
      setDelegateId('none')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/delegate-store-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedReq.id,
          assignedApproverId: targetUserId,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Delegation failed')

      showToast('Authority delegated successfully!', 'success')
      setSelectedReq(null)
      setDelegateId('none')
      loadData()
    } catch (err: any) {
      showToast(`Failed to delegate: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const isSelectedPreEvent = selectedReq?.request_type === 'pre_event'

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Top Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-2.5 border-b border-border/40 bg-background/50 backdrop-blur-xs">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Command Centre
        </button>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-700 dark:text-emerald-400">
            {profile?.role === 'national_coordinator' && isGeneralSecretary(profile)
              ? 'General Secretary Approval Console'
              : 'National Materials & Requisitions Oversight'}
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 md:px-6 py-8 space-y-6">
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-bold tracking-widest text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 uppercase">
                {activeEvent?.name || 'Current Event'} · Materials Governance
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {workflowMode === 'pre_event'
                ? 'Pre-Event Departmental Needs Lists (For Market Purchase)'
                : 'Live Event Store Requisitions (From Stores Stock)'}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {workflowMode === 'pre_event'
                ? 'Digitised pre-event department needs lists for Gen Sec & National Coordinator approval before Stores goes to the market.'
                : 'Review and approve live store requests from departments collecting items from Central Stores during the event.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => router.push('/dashboard/market-list')}
              className="text-xs h-9 font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Consolidated Market List ({preEventAnalytics.distinctItemsCount} Items)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  showToast('Generating Strategic Stores Audit Report (DOCX)...', 'info')
                  const res = await fetch('/api/export-stores-report')
                  if (!res.ok) {
                    const errText = await res.text()
                    showToast(`Export failed: ${errText || res.statusText}`, 'error')
                    return
                  }
                  const blob = await res.blob()
                  const url = window.URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = url
                  link.setAttribute('download', `DTCE_Stores_Requisition_and_Materials_Flow_Report.docx`)
                  document.body.appendChild(link)
                  link.click()
                  window.URL.revokeObjectURL(url)
                  document.body.removeChild(link)
                  showToast('Stores Audit Report downloaded successfully!', 'success')
                } catch (err: any) {
                  showToast(`Download failed: ${err.message}`, 'error')
                }
              }}
              className="text-xs h-9 font-semibold cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export DOCX Report
            </Button>
            <Button size="sm" variant="outline" onClick={() => loadData()} className="text-xs h-9 cursor-pointer">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Two Distinct Workflow Mode Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="tablist">
          <button
            role="tab"
            aria-selected={workflowMode === 'pre_event'}
            onClick={() => { setWorkflowMode('pre_event'); setActiveFilter('all') }}
            className={`text-left rounded-2xl border-2 p-4 transition-all cursor-pointer ${
              workflowMode === 'pre_event'
                ? 'border-emerald-500 bg-emerald-500/10 shadow-xs'
                : 'border-border bg-card hover:bg-muted/40'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-foreground leading-snug">
                <ClipboardList className={`w-5 h-5 shrink-0 ${workflowMode === 'pre_event' ? 'text-emerald-700 dark:text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`} />
                1. Pre-Event Needs Lists (Market Purchase)
              </span>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0">
                {preEventRequests.length} Lists · {preEventAnalytics.pendingListsCount} Pending
              </span>
            </div>
            <span className="block text-xs text-muted-foreground mt-1">
              Lists sent by HODs before the event so Stores knows what to purchase at the market.
            </span>
          </button>

          <button
            role="tab"
            aria-selected={workflowMode === 'during_event'}
            onClick={() => { setWorkflowMode('during_event'); setActiveFilter('all') }}
            className={`text-left rounded-2xl border-2 p-4 transition-all cursor-pointer ${
              workflowMode === 'during_event'
                ? 'border-blue-500 bg-blue-500/10 shadow-xs'
                : 'border-border bg-card hover:bg-muted/40'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-foreground leading-snug">
                <Package className={`w-5 h-5 shrink-0 ${workflowMode === 'during_event' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                2. Live Event Store Requisitions (From Store)
              </span>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30 whitespace-nowrap shrink-0">
                {duringEventRequests.length} Requests
              </span>
            </div>
            <span className="block text-xs text-muted-foreground mt-1">
              Live requests during the event for items already purchased and stocked in Central Stores.
            </span>
          </button>
        </div>

        {/* AT-A-GLANCE PRE-EVENT ANALYTICS PANEL (Shown when in Pre-Event Needs List Mode) */}
        {workflowMode === 'pre_event' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Depts Submitted</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-700 dark:text-emerald-400" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-foreground mt-1.5 block">
                  {preEventAnalytics.submittedDeptsCount} <span className="text-xs font-sans text-muted-foreground">/ {preEventAnalytics.totalDepts}</span>
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 font-semibold block mt-0.5">
                  {preEventAnalytics.compliancePct}% submission rate
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowMissingDepts(prev => !prev)}
                className="text-left bg-card rounded-xl p-4 border border-border/50 hover:border-red-500/40 shadow-xs cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">Yet to Submit</span>
                  <AlertCircle className="w-3.5 h-3.5 text-red-700 dark:text-red-400" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-red-500 mt-1.5 block">
                  {preEventAnalytics.missingDeptsCount}
                </span>
                <span className="text-[11px] text-blue-700 dark:text-blue-400 underline block mt-0.5">
                  {showMissingDepts ? 'Hide department names' : 'Click to view who has not sent'}
                </span>
              </button>

              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Awaiting Approval</span>
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-amber-500 mt-1.5 block">
                  {preEventAnalytics.pendingListsCount}
                </span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  Needs lists to review
                </span>
              </div>

              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Approved Lists</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-700 dark:text-emerald-400" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 mt-1.5 block">
                  {preEventAnalytics.approvedListsCount}
                </span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  Added to Market List
                </span>
              </div>

              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Market Items Volume</span>
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-blue-500 mt-1.5 block">
                  {preEventAnalytics.distinctItemsCount} <span className="text-xs font-sans text-muted-foreground">items</span>
                </span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  {preEventAnalytics.totalUnitsApproved.toLocaleString()} / {preEventAnalytics.totalUnitsRequested.toLocaleString()} units approved
                </span>
              </div>
            </div>

            {showMissingDepts && (
              <Card className="bg-card border border-border/60 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Department Pre-Event Needs Submission Status
                  </span>
                  <button
                    onClick={() => setShowMissingDepts(false)}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1">Close <X className="h-3.5 w-3.5" /></span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <span className="font-bold text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 block">
                      <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Submitted ({preEventAnalytics.submittedDepts.length})</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {preEventAnalytics.submittedDepts.length === 0 ? (
                        <span className="text-muted-foreground italic">None yet</span>
                      ) : (
                        preEventAnalytics.submittedDepts.map(d => (
                          <span key={d.id} className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                            {d.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="font-bold text-red-700 dark:text-red-400 block">
                      ⏳ Yet to Submit ({preEventAnalytics.missingDepts.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {preEventAnalytics.missingDepts.length === 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 font-semibold">All departments have submitted!</span>
                      ) : (
                        preEventAnalytics.missingDepts.map(d => (
                          <span key={d.id} className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20 font-medium">
                            {d.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Filter Tabs & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-2 rounded-2xl border border-border/50">
          <div className="flex overflow-x-auto sm:flex-wrap items-center gap-1 p-1 bg-muted/40 dark:bg-slate-800/40 rounded-xl border border-border/30">
            {(workflowMode === 'pre_event' ? PRE_EVENT_FILTER_TABS : DURING_EVENT_FILTER_TABS).map(tab => {
              const count = counts[tab.key] || 0
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`text-xs font-semibold px-3 py-1.5 min-h-[36px] rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    activeFilter === tab.key
                      ? 'bg-background text-foreground shadow-xs border border-border/50 font-bold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted/60 text-muted-foreground">
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <Input
            placeholder="Search department, HOD, or item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 h-9 text-xs bg-background/60 border-border/60"
          />
        </div>

        {/* Main List */}
        <div className="space-y-4">
          {filteredRequests.length === 0 ? (
            <Card className="bg-card rounded-xl p-12 text-center space-y-3 border border-border/50">
              <span className="flex justify-center text-muted-foreground">{workflowMode === 'pre_event' ? <ClipboardList className="h-10 w-10" /> : <Package className="h-10 w-10" />}</span>
              <p className="text-sm font-semibold text-muted-foreground">
                {workflowMode === 'pre_event'
                  ? 'No Pre-Event Departmental Needs Lists found matching this filter.'
                  : 'No Live Event Store Requisitions found matching this filter.'}
              </p>
            </Card>
          ) : (
            filteredRequests
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map(req => {
                const isPre = req.request_type === 'pre_event'
                const statusCfg = isPre && req.status !== 'pending_coordinator' && req.status !== 'declined'
                  ? { label: 'Approved for Market Purchase', bg: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)' }
                  : STATUS_CONFIG[req.status] || STATUS_CONFIG.pending_coordinator

                return (
                  <div
                    key={req.id}
                    className="bg-card rounded-xl border border-border/50 p-4 sm:p-5 space-y-3 transition-all hover:border-border"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-extrabold text-foreground">
                            {req.department?.name || 'Department'} — {isPre ? 'Pre-Event Needs List' : 'Store Requisition'}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isPre
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25'
                              : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25'
                          }`}>
                            <span className="inline-flex items-center gap-1">{isPre ? <><ShoppingCart className="h-3 w-3" /> For Market Purchase</> : <><Package className="h-3 w-3" /> From Store Stock</>}</span>
                          </span>
                          <span className="text-xs font-mono text-muted-foreground">
                            #{req.id.substring(0, 8)}
                          </span>
                          {req.status === 'pending_coordinator' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 whitespace-nowrap">
                              <Clock className="h-3 w-3" /> Pending {formatPendingAge(req.created_at)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground block mt-0.5">
                          Submitted by: <strong>{req.requester?.full_name || req.requester?.email || 'HOD'}</strong> • {new Date(req.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0 w-fit"
                        style={{ background: statusCfg.bg, color: statusCfg.color, border: statusCfg.border }}
                      >
                        {statusCfg.label}
                      </span>
                    </div>

                    {/* Items */}
                    <div className="p-3 bg-background/50 border border-border rounded-lg space-y-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block font-sans">
                        {isPre ? `Pre-Event Needs List (${Array.isArray(req.items_json) ? req.items_json.length : 0} items):` : `Requisition Items (${Array.isArray(req.items_json) ? req.items_json.length : 0} items):`}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                        {Array.isArray(req.items_json) && req.items_json.map((it: any, itIdx: number) => {
                          const reqQty = it.requested_quantity ?? it.quantity
                          const appQty = it.approved_quantity ?? it.quantity
                          const isAdjusted = req.status !== 'pending_coordinator' && reqQty !== undefined && appQty !== undefined && reqQty !== appQty

                          return (
                            <div key={itIdx} className="flex justify-between items-center p-2 rounded-lg bg-background/60 border border-border/40">
                              <div>
                                <span className="text-foreground font-semibold block">{it.name}</span>
                                <span className="text-[10px] text-muted-foreground uppercase">{it.unit || 'pcs'} · {it.category || 'consumable'}</span>
                              </div>
                              <div className="flex items-center gap-2 font-mono">
                                {isAdjusted ? (
                                  <span className="text-xs">
                                    <span className="line-through text-muted-foreground mr-1">Req: {reqQty}</span>
                                    <span className="font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Approved: {appQty}</span>
                                  </span>
                                ) : (
                                  <span className="font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                                    {appQty || reqQty} {it.unit || 'pcs'}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {req.reviewer_comments && (
                      <div className="text-[11px] p-2.5 rounded-lg text-muted-foreground" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)' }}>
                        <strong className="text-amber-500">Review Remarks:</strong> {req.reviewer_comments}
                      </div>
                    )}

                    {/* Action trigger button */}
                    <div className="flex gap-2 justify-end pt-1">
                      {req.status === 'pending_coordinator' ? (
                        (profile?.role !== 'coordinator' || req.assigned_approver_id === profile.id) ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleQuickApprove(req)}
                              disabled={quickApprovingId === req.id}
                              className="text-xs h-8.5 px-3.5 cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs whitespace-nowrap"
                            >
                              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> 1-Click Approve</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => selectReqForReview(req)}
                              className="text-xs h-8.5 px-4 cursor-pointer border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-bold shadow-xs whitespace-nowrap"
                            >
                              <span className="inline-flex items-center gap-1.5">{isPre ? 'Review & Edit Market List' : 'Review & Edit Quantities'} <ArrowRight className="h-3.5 w-3.5" /></span>
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-semibold text-muted-foreground bg-slate-800/40 px-2.5 py-1 rounded-full border border-slate-700/50">
                            Read-Only (Unassigned)
                          </span>
                        )
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selectReqForReview(req)}
                          className="text-xs h-8 px-3 cursor-pointer"
                        >
                          View Details
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
          )}

          <DataTablePagination
            currentPage={currentPage}
            totalPages={Math.ceil(filteredRequests.length / pageSize)}
            totalItems={filteredRequests.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>

        {/* Review Modal Overlay */}
        {selectedReq && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/50 dark:bg-slate-950/80 backdrop-blur-md animate-fade-in-up"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedReq(null)
            }}
          >
            <Card className="w-full max-w-xl bg-card border border-blue-500/40 text-foreground shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3 border-b border-border">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                      isSelectedPreEvent
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-blue-500/15 text-blue-700 dark:text-blue-700 dark:text-blue-400 border-blue-500/30'
                    }`}>
                      {isSelectedPreEvent ? 'Pre-Event Needs List (Market Purchase)' : 'Live Event Store Requisition'}
                    </span>
                  </div>
                  <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                    Review: {selectedReq.department?.name}
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    ID: #{selectedReq.id.substring(0, 8)} • {Array.isArray(selectedReq.items_json) ? selectedReq.items_json.length : 0} line item(s)
                  </p>
                </div>
                <button
                  onClick={() => setSelectedReq(null)}
                  className="h-9 w-9 flex items-center justify-center shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto">
                {selectedReq.status !== 'pending_coordinator' ? (
                  <div className="space-y-4 pt-2">
                    <div className="p-3.5 rounded-xl bg-muted/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                          {isSelectedPreEvent ? 'Needs List Breakdown' : 'Requisition Items Breakdown'}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">Processed Audit Log</span>
                      </div>
                      <div className="space-y-2">
                        {Array.isArray(selectedReq.items_json) && selectedReq.items_json.map((it: any, idx: number) => (
                          <div key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-2.5 rounded-lg bg-background border border-border text-xs">
                            <div>
                              <span className="font-semibold text-foreground block">{it.name}</span>
                              <span className="text-[10px] text-muted-foreground uppercase">{it.unit || 'pcs'} · {it.category || 'consumable'}</span>
                            </div>
                            <div className="font-mono text-xs">
                              <span className="text-muted-foreground mr-2">Requested: {it.requested_quantity ?? it.quantity}</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                Approved: {it.approved_quantity ?? it.quantity} {it.unit || 'pcs'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedReq.reviewer_comments && (
                      <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs space-y-1">
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-700 dark:text-amber-400 uppercase tracking-widest block">Reviewer Remarks:</span>
                        <p className="text-foreground/90 leading-relaxed">{selectedReq.reviewer_comments}</p>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-muted/40 border border-border text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Status: <strong className="text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 uppercase">{selectedReq.status.replace('_', ' ')}</strong></span>
                      <span className="text-muted-foreground font-semibold">Read-Only Completed Audit Record</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-foreground uppercase tracking-widest block">
                        {isSelectedPreEvent ? 'Approve Quantities for Market Purchase' : 'Edit Approved Quantities'}
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {isSelectedPreEvent
                          ? 'Review the items this department requested for this event. Approved quantities will be added to the Consolidated Stores Market List for purchase.'
                          : 'Adjust quantities or remove line items before approving. Original requested amounts are preserved.'}
                      </p>

                      <div className="space-y-2">
                        {editableItems.map((item, idx) => {
                          const catItem = catalogItems.find(c =>
                            (item.inventory_item_id && c.id === item.inventory_item_id) ||
                            c.name.toLowerCase() === item.name.toLowerCase()
                          )
                          const availableStock = catItem
                            ? Math.max(0, (catItem.current_stock || 0) - (catItem.reserved_stock || 0))
                            : 0
                          const isExceeding = !isSelectedPreEvent && catItem && item.approved_quantity > availableStock

                          return (
                            <div key={idx} className="p-3 rounded-xl bg-muted/50 border border-border space-y-2 text-xs">
                              <div className="flex flex-wrap justify-between items-center gap-2">
                                <div className="min-w-0">
                                  <span className="font-bold text-foreground block">{item.name}</span>
                                  <span className="text-[10px] text-muted-foreground uppercase">{item.unit || 'pcs'} · {item.category || 'consumable'}</span>
                                </div>
                                <span className="text-[10px] text-foreground bg-muted px-2 py-0.5 rounded font-mono">
                                  Requested: {item.requested_quantity} {item.unit || 'pcs'}
                                </span>
                              </div>

                              {/* Live Stock Context Banner ONLY for During-Event Store Requisitions (or informative existing stock for Pre-Event) */}
                              {isSelectedPreEvent ? (
                                catItem && catItem.current_stock > 0 ? (
                                  <div className="flex items-center justify-between p-2 rounded-lg text-[11px] font-mono bg-background border border-border text-foreground/90">
                                    <span>Already in store from previous event: <strong>{catItem.current_stock} {catItem.unit || 'pcs'}</strong></span>
                                    <span className="text-emerald-700 dark:text-emerald-400 text-[10px]">Market purchase item</span>
                                  </div>
                                ) : null
                              ) : catItem ? (
                                <div className={`flex items-center justify-between p-2 rounded-lg text-[11px] font-mono border ${
                                  isExceeding ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-slate-950 border-border text-foreground'
                                }`}>
                                  <div className="flex items-center gap-1.5 font-bold flex-wrap">
                                    <span>Available:</span>
                                    <span>{availableStock} {catItem.unit || 'pcs'}</span>
                                    {(catItem.reserved_stock || 0) > 0 && (
                                      <span className="text-[10px] font-normal text-muted-foreground">
                                        (On Hand: {catItem.current_stock}, Reserved: {catItem.reserved_stock})
                                      </span>
                                    )}
                                    {availableStock <= catItem.low_stock_threshold && (
                                      <span className="text-[9px] font-bold text-red-700 dark:text-red-400 bg-red-500/10 px-1.5 py-0.2 rounded border border-red-500/20">
                                        <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Low Stock</span>
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">
                                    Threshold: {catItem.low_stock_threshold}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                                  Custom Item — Will be fulfilled manually by Stores
                                </div>
                              )}

                              {/* Approval Quantity Input */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                                <div className="flex items-center gap-2">
                                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">
                                    {isSelectedPreEvent ? 'Approve to Buy:' : 'Grant Qty:'}
                                  </Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={item.approved_quantity}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0
                                      setEditableItems(prev => prev.map((it, i) => i === idx ? { ...it, approved_quantity: val } : it))
                                    }}
                                    className="w-20 h-9 text-xs font-mono bg-background border-input text-foreground"
                                  />
                                  <span className="text-[11px] text-muted-foreground font-mono">{item.unit || 'pcs'}</span>
                                </div>

                                {isExceeding ? (
                                  <span className="text-[10px] font-bold text-red-700 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-red-700 dark:text-red-400" /> Exceeds Stock ({catItem.current_stock})
                                  </span>
                                ) : item.approved_quantity !== item.requested_quantity ? (
                                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                    Adjusted
                                  </span>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={() => setEditableItems(prev => prev.filter((_, i) => i !== idx))}
                                  className="ml-auto h-9 w-9 flex items-center justify-center shrink-0 text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-bold rounded-lg text-xs hover:bg-red-500/10"
                                  title="Remove item"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Delegate selector */}
                    {(profile?.role === 'super_admin' || profile?.role === 'national_coordinator') && (
                      <div className="space-y-2 pb-4 border-b border-border">
                        <Label htmlFor="del-user" className="text-xs font-bold text-foreground uppercase tracking-widest">Delegate Approval Task</Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <ModernSelect
                            id="del-user"
                            value={delegateId}
                            onChange={(e) => setDelegateId(e.target.value)}
                            className="w-full min-w-0 h-10 sm:h-9 rounded-xl px-3 text-xs font-medium text-foreground bg-background border border-input outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer sm:flex-1"
                          >
                            <option value="none" >none</option>
                            {approvers
                              .filter(a => (a.role === 'coordinator' || !a.role) && a.id !== profile?.id)
                              .map((a) => (
                                <option key={a.id} value={a.id} >
                                  {a.full_name || a.username || a.email} (Coordinator)
                                </option>
                              ))}
                          </ModernSelect>
                          <Button onClick={handleDelegate} disabled={loading} size="sm" className="w-full sm:w-auto h-10 sm:h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer shadow-xs shrink-0">
                            Assign
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Review comments */}
                    <div className="space-y-2">
                      <Label htmlFor="review-comments" className="text-xs font-bold text-foreground uppercase tracking-widest">Review Comments</Label>
                      <Textarea
                        id="review-comments"
                        value={actionComments}
                        onChange={(e) => setActionComments(e.target.value)}
                        placeholder={isSelectedPreEvent ? 'Add remarks for HOD or Stores market team...' : 'Add approval comments or reasons for declining...'}
                        rows={3}
                        className="bg-background border-input text-foreground placeholder:text-muted-foreground text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-2 pt-2">
                      <Button onClick={() => handleAction('declined')} disabled={loading} variant="destructive" className="w-full min-h-[40px] text-xs font-bold py-2.5 cursor-pointer">
                        Decline
                      </Button>
                      <Button onClick={() => handleAction('approved')} disabled={loading} className="w-full min-h-[40px] text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 shadow-xs cursor-pointer">
                        <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> {isSelectedPreEvent ? 'Approve for Market List' : 'Approve Store Request'}</span>
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}

export default function AdminRequisitionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-muted-foreground">Loading requisitions console...</p>
      </div>
    }>
      <AdminRequisitionsContent />
    </Suspense>
  )
}
