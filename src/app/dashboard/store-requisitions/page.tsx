'use client'

import React, { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription'
import { fetchEnhancedStoreRequests } from '@/utils/batch-queries'
import { TableSkeleton } from '@/components/ui/skeleton-loader'
import { AlertTriangle, X } from 'lucide-react'

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

// ── Status display config ───────────────────────────────────────────────
const STATUS_CONFIG: Record<ReqStatus, { label: string; bg: string; color: string; border: string }> = {
  pending_coordinator:  { label: 'Pending', bg: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' },
  approved:            { label: 'Approved', bg: 'rgba(59,130,246,0.1)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' },
  in_progress:         { label: 'In Progress', bg: 'rgba(139,92,246,0.1)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.2)' },
  partially_fulfilled: { label: 'Partial', bg: 'rgba(236,72,153,0.1)', color: '#DB2777', border: '1px solid rgba(236,72,153,0.2)' },
  ready_for_collection:{ label: 'Ready for Collection', bg: 'rgba(245,158,11,0.2)', color: '#D97706', border: '1px solid rgba(245,158,11,0.4)' },
  declined:            { label: 'Declined', bg: 'rgba(239,68,68,0.1)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' },
  delivered:           { label: 'Delivered', bg: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' },
}

const FILTER_TABS: { key: ReqStatus | 'all'; label: string }[] = [
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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<StoreRequestTicket[]>([])
  
  // Available reviewers list for delegation dropdown
  const [approvers, setApprovers] = useState<Profile[]>([])
  const [catalogItems, setCatalogItems] = useState<any[]>([])
  
  // Review Modal State
  const [selectedReq, setSelectedReq] = useState<StoreRequestTicket | null>(null)
  const [actionComments, setActionComments] = useState('')
  const [delegateId, setDelegateId] = useState<string>('none')
  const [editableItems, setEditableItems] = useState<EditableItem[]>([])

  // Filter & Search State
  const [activeFilter, setActiveFilter] = useState<ReqStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
        const { data: hasAssigned } = await supabase
          .from('store_requests')
          .select('id')
          .eq('assigned_approver_id', activeProfile.id)
          .limit(1)
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
      const [reqsRes, usersRes, invRes] = await Promise.all([
        supabase.from('store_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').in('role', ['super_admin', 'coordinator', 'national_coordinator', 'assistant']),
        supabase.from('inventory_items').select('*')
      ])

      if (reqsRes.data) {
        const enhanced = await fetchEnhancedStoreRequests(supabase, reqsRes.data)
        setRequests(enhanced)
      }
      if (usersRes.data) setApprovers(usersRes.data)
      if (invRes.data) setCatalogItems(invRes.data)
    } else {
      const { store: mockStore } = require('@/utils/supabase/mockClient')
      setCatalogItems(mockStore.inventoryItems || [])
      setRequests([
        {
          id: 'req-mock-1',
          items_json: [{ name: 'Analgesics', quantity: 200, requested_quantity: 200, approved_quantity: 200, category: 'consumable' }],
          status: 'pending_coordinator',
          created_at: new Date().toISOString(),
          requester_profile_id: 'user-hod-med',
          department_id: 'dept-10',
          requester: { full_name: 'Dr. Smith (HOD)', email: 'smith.medical@dtce.org' },
          department: { name: 'Medical' }
        },
        {
          id: 'req-mock-2',
          items_json: [
            { name: 'Mattresses', quantity: 50, requested_quantity: 50, approved_quantity: 50 },
            { name: 'Pillows', quantity: 50, requested_quantity: 50, approved_quantity: 40 }
          ],
          status: 'approved',
          created_at: new Date(Date.now() - 86400000).toISOString(),
          requester_profile_id: 'user-hod-accomm',
          department_id: 'dept-1',
          reviewer_comments: 'Approved with adjusted pillow quantity.',
          reviewed_at: new Date(Date.now() - 86400000).toISOString(),
          requester: { full_name: 'Elder Robert', email: 'robert.accomm@dtce.org' },
          department: { name: 'Accommodation' }
        }
      ])
      setApprovers([
        { id: 'user-coord', email: 'coordinator@dtce.org', full_name: 'Coordinator Jane', role: 'coordinator' } as any,
        { id: 'user-asst-med', email: 'assistant@dtce.org', full_name: 'Nurse Kelly', role: 'assistant' } as any
      ])
    }
  }, [router])

  // Shared Platform-Wide Realtime Subscription for National Coordinator Console
  useRealtimeSubscription({
    channelName: 'admin-store-requisitions',
    subscriptions: [{ table: 'store_requests' }],
    onDataChange: () => loadData(),
  })

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredRequests = useMemo(() => {
    let results = requests
    if (activeFilter !== 'all') {
      results = results.filter(r => r.status === activeFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      results = results.filter(r =>
        (r.department?.name || '').toLowerCase().includes(q) ||
        (r.requester?.full_name || '').toLowerCase().includes(q) ||
        r.items_json.some(it => it.name.toLowerCase().includes(q))
      )
    }
    return results
  }, [requests, activeFilter, searchQuery])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length }
    for (const key of Object.keys(STATUS_CONFIG)) {
      c[key] = requests.filter(r => r.status === key).length
    }
    return c
  }, [requests])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBatchAction = async (status: 'approved' | 'declined') => {
    if (selectedIds.size === 0) return
    setLoading(true)

    try {
      for (const id of selectedIds) {
        if (isMock) {
          setRequests(prev => prev.map(r => selectedIds.has(r.id) ? { ...r, status, reviewer_comments: `Batch ${status}` } : r))
        } else {
          await fetch('/api/update-store-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestId: id,
              status,
              reviewerComments: `Batch ${status} by coordinator`
            })
          })
        }
      }

      showToast(`${selectedIds.size} requisition(s) ${status} successfully!`, 'success')
      setSelectedIds(new Set())
      if (!isMock) loadData()
    } catch (err: any) {
      showToast(`Batch action failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (status: ReqStatus) => {
    if (!selectedReq) return

    let finalItems: any[] | undefined = undefined
    if (status === 'approved') {
      const validItems = editableItems
        .filter(it => it.approved_quantity > 0)
        .map(it => ({
          name: it.name,
          requested_quantity: it.requested_quantity,
          approved_quantity: it.approved_quantity,
          quantity: it.approved_quantity,
          category: it.category || 'unclassified'
        }))

      if (validItems.length === 0) {
        showToast('Cannot approve a requisition with 0 items. Please use Decline instead.', 'error')
        return
      }
      finalItems = validItems
    }

    setLoading(true)

    if (isMock) {
      showToast(`Request ${status === 'approved' ? 'Approved' : 'Declined'} successfully (Mock)!`, 'success')
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
          itemsJson: finalItems
        })
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update request')
      }

      showToast(`Request ${status === 'approved' ? 'Approved' : 'Declined'} successfully!`, 'success')
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

    const supabase = getClient()
    try {
      const { error } = await supabase
        .from('store_requests')
        .update({ assigned_approver_id: targetUserId })
        .eq('id', selectedReq.id)

      if (error) throw error

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

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Integrated Breadcrumb Strip */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-border/40 bg-background/50 backdrop-blur-xs">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <span>←</span> Back to Command Centre
        </button>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-500">Oversight Store Requisitions</span>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 md:px-6 py-8 space-y-6">
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span className="text-[11px] font-bold tracking-widest text-amber-500 uppercase">National Oversight</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              Store Requisitions Console
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Review, approve, or adjust material requisitions from all convention departments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => loadData()} className="text-xs h-9">
              🔄 Refresh Requests
            </Button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-2 rounded-2xl border border-border/50">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-muted/40 dark:bg-slate-800/40 rounded-xl border border-border/30">
            {FILTER_TABS.map(tab => {
              const count = counts[tab.key] || 0
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
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
            placeholder="Search department or item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 h-9 text-xs bg-background/60 border-border/60"
          />
        </div>

        {/* Main List */}
        <div className="space-y-4">
          {filteredRequests.length === 0 ? (
            <Card className="bg-card rounded-xl p-12 text-center space-y-3 border border-border/50">
              <span className="text-4xl block">📦</span>
              <p className="text-sm font-semibold text-muted-foreground">No store requisitions found matching this filter.</p>
            </Card>
          ) : (
            filteredRequests.map(req => {
              const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending_coordinator

              return (
                <div
                  key={req.id}
                  className="bg-card rounded-xl border border-border/50 p-4 sm:p-5 space-y-3 transition-all hover:border-border"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-foreground">
                          {req.department?.name || 'Department'} Requisition
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          #{req.id.substring(0, 8)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Requester: <strong>{req.requester?.full_name || req.requester?.email || 'HOD'}</strong> • {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex-shrink-0 w-fit"
                      style={{ background: statusCfg.bg, color: statusCfg.color, border: statusCfg.border }}
                    >
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Requisition Items */}
                  <div className="p-3 bg-background/50 border border-border rounded-lg space-y-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block font-sans">Requisition Items:</span>
                    <div className="space-y-1.5 text-xs">
                      {req.items_json.map((it: any, itIdx: number) => {
                        const reqQty = it.requested_quantity ?? it.quantity
                        const appQty = it.approved_quantity ?? it.quantity
                        const isAdjusted = reqQty !== undefined && appQty !== undefined && reqQty !== appQty

                        return (
                          <div key={itIdx} className="flex justify-between items-center p-2 rounded-lg bg-background/60 border border-border/40">
                            <span className="text-foreground font-semibold">{it.name}</span>
                            <div className="flex items-center gap-2 font-mono">
                              {isAdjusted ? (
                                <span className="text-xs">
                                  <span className="line-through text-muted-foreground mr-1">Req: {reqQty}</span>
                                  <span className="font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Approved: {appQty}</span>
                                </span>
                              ) : (
                                <span className="font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                                  × {appQty || reqQty}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Review remarks */}
                  {req.reviewer_comments && (
                    <div className="text-[11px] p-2.5 rounded-lg text-muted-foreground" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)' }}>
                      <strong className="text-amber-500">Review Remarks:</strong> {req.reviewer_comments}
                    </div>
                  )}

                  {/* Action trigger button */}
                  {req.status === 'pending_coordinator' && (
                    <div className="flex gap-2 justify-end pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => selectReqForReview(req)}
                        className="text-xs h-8.5 px-4 cursor-pointer border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-bold shadow-xs"
                      >
                        Review &amp; Edit Quantities ➔
                      </Button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Requisition Review Glassmorphism Modal Overlay */}
        {selectedReq && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in-up"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedReq(null)
            }}
          >
            <Card className="w-full max-w-xl bg-[#0B1726]/96 border border-blue-500/30 text-slate-100 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
                <div>
                  <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                    Review: {selectedReq.department?.name} Request
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    ID: #{selectedReq.id.substring(0, 8)} • {selectedReq.items_json.length} line item(s)
                  </p>
                </div>
                <button
                  onClick={() => setSelectedReq(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </CardHeader>
              <CardContent className="space-y-4 p-5 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Editable Line Items Section */}
                <div className="space-y-2.5 pb-4 border-b border-border">
                  <Label className="text-xs font-bold text-amber-500 uppercase tracking-wider block">
                    Edit Approved Quantities
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Adjust quantities or remove line items before approving. Original requested amounts are preserved.
                  </p>

                  <div className="space-y-2">
                    {editableItems.map((item, idx) => {
                      const catItem = catalogItems.find(c =>
                        (item.inventory_item_id && c.id === item.inventory_item_id) ||
                        c.name.toLowerCase() === item.name.toLowerCase()
                      )
                      const isExceeding = catItem && item.approved_quantity > catItem.current_stock

                      return (
                        <div key={idx} className="p-3 rounded-xl bg-background/60 border border-border/60 space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-foreground">{item.name}</span>
                            <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded font-mono">
                              Requested: {item.requested_quantity} {item.unit || ''}
                            </span>
                          </div>

                          {/* Live Stock Context Banner */}
                          {catItem ? (
                            <div className={`flex items-center justify-between p-2 rounded-lg text-[11px] font-mono border ${
                              catItem.current_stock <= catItem.low_stock_threshold
                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            }`}>
                              <div className="flex items-center gap-1.5 font-bold">
                                <span>Currently in stock:</span>
                                <span>{catItem.current_stock} {catItem.unit || 'pcs'}</span>
                                {catItem.current_stock <= catItem.low_stock_threshold && (
                                  <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.2 rounded border border-red-500/20">
                                    ⚠️ Low Stock
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                Threshold: {catItem.low_stock_threshold}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                              ⚠️ Uncatalogued Item — Not tracked in stock inventory
                            </div>
                          )}

                          {/* Approval Quantity Input & Validation Warning */}
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                            <div className="flex items-center gap-2">
                              <Label className="text-[10px] font-semibold text-muted-foreground uppercase">Grant Qty:</Label>
                              <Input
                                type="number"
                                min={0}
                                value={item.approved_quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0
                                  setEditableItems(prev => prev.map((it, i) => i === idx ? { ...it, approved_quantity: val } : it))
                                }}
                                className="w-20 h-7 text-xs font-mono bg-card text-foreground"
                              />
                            </div>

                            {isExceeding ? (
                              <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-red-400" /> Exceeds Stock ({catItem.current_stock})
                              </span>
                            ) : item.approved_quantity !== item.requested_quantity ? (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                Adjusted
                              </span>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => setEditableItems(prev => prev.filter((_, i) => i !== idx))}
                              className="ml-auto text-red-400 hover:text-red-300 font-bold px-1.5 py-0.5 rounded text-xs hover:bg-red-500/10"
                              title="Remove item"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Delegate selector */}
                <div className="space-y-2 pb-4 border-b border-border">
                  <Label htmlFor="del-user" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Delegate Approval Task</Label>
                  <div className="flex gap-2">
                    <Select
                      value={delegateId}
                      onValueChange={(val) => setDelegateId(val || 'none')}
                    >
                      <SelectTrigger id="del-user" className="h-9 text-foreground bg-card border-border flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Delegate (None)</SelectItem>
                        {approvers
                          .filter(a => a.id !== profile?.id)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.full_name || a.email} ({a.role === 'national_coordinator' ? 'Nat. Coord.' : a.role})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleDelegate} disabled={loading} size="sm" variant="outline" className="h-9">
                      Assign
                    </Button>
                  </div>
                </div>

                {/* Standard review comments */}
                <div className="space-y-2">
                  <Label htmlFor="review-comments" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Review Comments</Label>
                  <Textarea
                    id="review-comments"
                    value={actionComments}
                    onChange={(e) => setActionComments(e.target.value)}
                    placeholder="Add approval comments or reasons for declining..."
                    rows={3}
                    className="input-dark text-foreground text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button onClick={() => handleAction('declined')} disabled={loading} variant="destructive" className="w-full text-xs font-semibold">
                    Decline
                  </Button>
                  <Button onClick={() => handleAction('approved')} disabled={loading} className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                    Approve Order
                  </Button>
                </div>
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
