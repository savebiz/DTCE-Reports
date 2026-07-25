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
        name: it.name,
        requested_quantity: it.requested_quantity ?? it.quantity,
        approved_quantity: it.approved_quantity ?? it.quantity,
        category: it.category
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
      const { data: reqsData } = await supabase
        .from('store_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (reqsData) {
        const enhanced = await fetchEnhancedStoreRequests(supabase, reqsData)
        setRequests(enhanced)
      }

      const { data: allUsers } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['super_admin', 'coordinator', 'national_coordinator', 'assistant'])
      setApprovers(allUsers || [])
    } else {
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
          requester: { full_name: 'Elder Mark (HOD)', email: 'mark.accommodation@dtce.org' },
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
    channelName: 'nc-requisitions-console',
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

  const handleAction = async (status: 'approved' | 'declined') => {
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
      showToast(`Request ${status} successfully!`, 'success')
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
        throw new Error(data.error || 'Failed to update status')
      }

      showToast(`Requisition order ${status}!`, 'success')
      setSelectedReq(null)
      setActionComments('')
      setEditableItems([])
      loadData()
    } catch (err: any) {
      showToast(`Failed to update status: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelegate = async () => {
    if (!selectedReq) return
    setLoading(true)
    const supabase = getClient()
    const targetDelegateId = delegateId === 'none' ? null : delegateId

    if (isMock) {
      showToast('Approver assigned successfully!', 'success')
      setSelectedReq(null)
      setDelegateId('none')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase
        .from('store_requests')
        .update({
          assigned_approver_id: targetDelegateId
        })
        .eq('id', selectedReq.id)

      if (error) throw error

      showToast('Approver assigned successfully!', 'success')
      setSelectedReq(null)
      setDelegateId('none')
      loadData()
    } catch (err: any) {
      showToast(`Delegation failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Oversight Store Requisitions Console</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review, approve, adjust quantities, and delegate store requests across all convention departments.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="text-xs h-9 cursor-pointer w-fit"
          >
            ← Back to Executive Dashboard
          </Button>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-card p-3 rounded-xl border border-border">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTER_TABS.map(tab => {
              const active = activeFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'bg-background/40 hover:bg-background/80 text-muted-foreground hover:text-foreground border border-border/40'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    active ? 'bg-slate-950/20 text-slate-950 font-bold' : 'bg-muted/60 text-muted-foreground'
                  }`}>
                    {counts[tab.key] || 0}
                  </span>
                </button>
              )
            })}
          </div>

          <Input
            placeholder="Search department, requester, or item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 h-9 text-xs bg-background/60 border-border/60"
          />
        </div>

        {/* Batch action bar if items selected */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-xs animate-fade-in">
            <span className="font-semibold text-amber-500">
              {selectedIds.size} pending requisition(s) selected
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => handleBatchAction('declined')} disabled={loading} className="text-xs h-8">
                Batch Decline
              </Button>
              <Button size="sm" onClick={() => handleBatchAction('approved')} disabled={loading} className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
                Batch Approve
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Requisitions List Column */}
          <div className="lg:col-span-2 space-y-4">
            {loading && requests.length === 0 ? (
              <TableSkeleton rows={4} cols={3} />
            ) : filteredRequests.length === 0 ? (
              <Card className="glass-card border-none p-12 text-center text-xs text-muted-foreground italic">
                No store requisitions match your filter or search criteria.
              </Card>
            ) : (
              filteredRequests.map(req => {
                const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending_coordinator
                const isSelected = selectedReq?.id === req.id

                return (
                  <div
                    key={req.id}
                    className={`p-4 rounded-xl border transition-all space-y-3 ${
                      isSelected
                        ? 'bg-amber-500/5 border-amber-500/50 shadow-md'
                        : 'bg-background/40 border-border hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-start gap-2.5">
                        {req.status === 'pending_coordinator' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(req.id)}
                            onChange={() => toggleSelect(req.id)}
                            className="mt-1 h-4 w-4 rounded border-border accent-amber-500 cursor-pointer"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm">
                              {req.department?.name || 'Department'}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              #{req.id.substring(0, 8)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground block mt-0.5">
                            Requester: <strong>{req.requester?.full_name || req.requester?.email || 'HOD'}</strong> • {new Date(req.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: statusCfg.bg, color: statusCfg.color, border: statusCfg.border }}
                      >
                        {statusCfg.label}
                      </span>
                    </div>

                    {/* Structured Vertical Item List Layout */}
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

                    {/* Status Timeline */}
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                      {(['pending_coordinator', 'approved', 'in_progress', 'ready_for_collection', 'delivered'] as ReqStatus[]).map((stage, i) => {
                        const stageOrder = ['pending_coordinator', 'approved', 'in_progress', 'partially_fulfilled', 'ready_for_collection', 'delivered']
                        const stageIdx = stageOrder.indexOf(stage)
                        const currentIdx = stageOrder.indexOf(req.status)
                        const isCompleted = req.status !== 'declined' && currentIdx >= stageIdx
                        const stageLabel = stage === 'pending_coordinator' ? 'Submitted' : stage === 'in_progress' ? 'Stores Processing' : stage === 'ready_for_collection' ? 'Ready Collection' : STATUS_CONFIG[stage]?.label || stage
                        return (
                          <React.Fragment key={stage}>
                            {i > 0 && (
                              <div
                                className="h-[1px] flex-1 min-w-[8px]"
                                style={{ background: isCompleted ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)' }}
                              />
                            )}
                            <span
                              className="font-semibold px-1.5 py-0.5 rounded"
                              style={{
                                color: isCompleted ? '#34D399' : 'rgba(255,255,255,0.3)',
                                background: isCompleted ? 'rgba(16,185,129,0.08)' : 'transparent',
                              }}
                            >
                              {stageLabel}
                            </span>
                          </React.Fragment>
                        )
                      })}
                      {req.status === 'declined' && (
                        <span className="font-semibold px-1.5 py-0.5 rounded text-red-400 bg-red-500/8 ml-auto">
                          ✕ Declined
                        </span>
                      )}
                    </div>

                    {/* Reviewer remarks */}
                    {req.reviewer_comments && (
                      <div className="text-[11px] p-2.5 rounded-lg text-muted-foreground" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)' }}>
                        <strong className="text-amber-500">Review Remarks:</strong> {req.reviewer_comments}
                      </div>
                    )}

                    {/* Actions */}
                    {req.status === 'pending_coordinator' && (
                      <div className="flex gap-2 justify-end pt-1">
                        <Button size="sm" variant="outline" onClick={() => selectReqForReview(req)} className="text-xs h-8 cursor-pointer border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-semibold">
                          Review &amp; Edit Quantities ➔
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Action Form Column (Sticky review) */}
          <div className="lg:col-span-1">
            {selectedReq ? (
              <Card className="glass-card border-none sticky top-20">
                <CardHeader>
                  <div className="text-base font-bold text-foreground uppercase tracking-wider">
                    Review: {selectedReq.department?.name} Request
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    ID: {selectedReq.id.substring(0, 8)} • {selectedReq.items_json.length} line item(s)
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Editable Line Items Section */}
                  <div className="space-y-2.5 pb-4 border-b border-border">
                    <Label className="text-xs font-bold text-amber-500 uppercase tracking-wider block">
                      Edit Approved Quantities
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Adjust quantities or remove line items before approving. Original requested amounts are preserved.
                    </p>

                    <div className="space-y-2">
                      {editableItems.map((item, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-background/60 border border-border/60 space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-foreground">{item.name}</span>
                            <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded font-mono">
                              Asked for: {item.requested_quantity}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
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
                            {item.approved_quantity !== item.requested_quantity && (
                              <span className="text-[10px] text-amber-400 font-bold">
                                Adjusted
                              </span>
                            )}
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
                      ))}
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

                  <Button size="sm" variant="ghost" onClick={() => setSelectedReq(null)} className="w-full text-xs mt-2">
                    Cancel Review
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="glass-card border-none p-6 text-center text-xs text-muted-foreground italic sticky top-20">
                Select a pending requisition ticket from the list to approve, decline, or delegate authority.
              </Card>
            )}
          </div>
        </div>
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
