'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

interface RequestItem {
  name: string
  quantity: number
  category: 'durable' | 'consumable'
}

type ReqStatus = 'pending_coordinator' | 'approved' | 'declined' | 'in_progress' | 'partially_fulfilled' | 'delivered'

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
  pending_coordinator: { label: 'Pending', bg: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' },
  approved:           { label: 'Approved', bg: 'rgba(59,130,246,0.1)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' },
  in_progress:        { label: 'In Progress', bg: 'rgba(139,92,246,0.1)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.2)' },
  partially_fulfilled:{ label: 'Partial', bg: 'rgba(236,72,153,0.1)', color: '#DB2777', border: '1px solid rgba(236,72,153,0.2)' },
  declined:           { label: 'Declined', bg: 'rgba(239,68,68,0.1)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' },
  delivered:          { label: 'Delivered', bg: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' },
}

const FILTER_TABS: { key: ReqStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending_coordinator', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'partially_fulfilled', label: 'Partial' },
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

  // Filter & Search State
  const [activeFilter, setActiveFilter] = useState<ReqStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
      // Check if they are a delegated approver instead
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
      // Fetch all requests
      const { data: reqsData } = await supabase
        .from('store_requests')
        .select('*')
        .order('created_at', { ascending: false })

      // Fetch requester and department details
      if (reqsData) {
        const enhanced: StoreRequestTicket[] = await Promise.all(
          reqsData.map(async (r: any) => {
            const { data: reqProfile } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', r.requester_profile_id)
              .maybeSingle()
            
            const { data: dept } = await supabase
              .from('departments')
              .select('name')
              .eq('id', r.department_id)
              .maybeSingle()

            return {
              ...r,
              requester: reqProfile || { full_name: 'Unknown HOD', email: '' },
              department: dept || { name: 'Unknown Department' }
            }
          })
        )
        setRequests(enhanced)
      }

      // Fetch all potential reviewers (admins/coordinators/assistants)
      const { data: allUsers } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['super_admin', 'coordinator', 'national_coordinator', 'assistant'])
      setApprovers(allUsers || [])
    } else {
      // Mock requests
      setRequests([
        {
          id: 'req-mock-1',
          items_json: [{ name: 'Analgesics', quantity: 200, category: 'consumable' }],
          status: 'pending_coordinator',
          created_at: new Date().toISOString(),
          requester_profile_id: 'user-hod-med',
          department_id: 'dept-10',
          requester: { full_name: 'Dr. Smith (HOD)', email: 'smith.medical@dtce.org' },
          department: { name: 'Medical' }
        },
        {
          id: 'req-mock-2',
          items_json: [{ name: 'Mattresses', quantity: 50, category: 'durable' }, { name: 'Pillows', quantity: 50, category: 'durable' }],
          status: 'approved',
          created_at: new Date(Date.now() - 86400000).toISOString(),
          requester_profile_id: 'user-hod-accomm',
          department_id: 'dept-1',
          reviewer_comments: 'Approved for convention setup.',
          requester: { full_name: 'Elder Mark (HOD)', email: 'mark.accommodation@dtce.org' },
          department: { name: 'Accommodation' }
        },
        {
          id: 'req-mock-3',
          items_json: [{ name: 'Extension Cords', quantity: 20, category: 'durable' }],
          status: 'in_progress',
          created_at: new Date(Date.now() - 172800000).toISOString(),
          requester_profile_id: 'user-hod-tech',
          department_id: 'dept-5',
          reviewer_comments: 'Stores is gathering items.',
          requester: { full_name: 'Bro. James (HOD)', email: 'james.technical@dtce.org' },
          department: { name: 'Technical' }
        }
      ])
      setApprovers([
        { id: 'user-coord', email: 'coordinator@dtce.org', full_name: 'Coordinator Jane', role: 'coordinator' } as any,
        { id: 'user-asst-med', email: 'assistant@dtce.org', full_name: 'Nurse Kelly', role: 'assistant' } as any
      ])
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // ── Filtering & Search ─────────────────────────────────────────────────
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

  // ── Summary Counts ─────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length }
    for (const key of Object.keys(STATUS_CONFIG)) {
      c[key] = requests.filter(r => r.status === key).length
    }
    return c
  }, [requests])

  // ── Batch Selection ────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllPending = () => {
    const pendingIds = filteredRequests
      .filter(r => r.status === 'pending_coordinator')
      .map(r => r.id)
    setSelectedIds(new Set(pendingIds))
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

  // ── Single Action ──────────────────────────────────────────────────────
  const handleAction = async (status: 'approved' | 'declined') => {
    if (!selectedReq) return
    setLoading(true)

    if (isMock) {
      showToast(`Request ${status} successfully!`, 'success')
      setRequests(prev => prev.map(r => r.id === selectedReq.id ? { ...r, status, reviewer_comments: actionComments } : r))
      setSelectedReq(null)
      setActionComments('')
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
          reviewerComments: actionComments
        })
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update status')
      }

      showToast(`Requisition order ${status}!`, 'success')
      setSelectedReq(null)
      setActionComments('')
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
      showToast('Approver delegated successfully!', 'success')
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

      showToast('Authority delegated successfully!', 'success')
      setSelectedReq(null)
      setDelegateId('none')
      loadData()
    } catch (err: any) {
      showToast(`Delegation failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const pendingSelectedCount = [...selectedIds].filter(id => {
    const r = requests.find(req => req.id === id)
    return r?.status === 'pending_coordinator'
  }).length

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Store Requisitions Console</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Approve, decline, or delegate incoming material requisition orders.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="text-xs h-9 cursor-pointer w-fit"
          >
            ← Back to Dashboard
          </Button>
        </div>

        {/* Summary KPI Bar (Stripe Pattern Elevation & Typography) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 animate-fade-in-up">
          {FILTER_TABS.map(tab => {
            const count = counts[tab.key] || 0
            const isActive = activeFilter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`bg-card rounded-xl p-3 text-[11px] text-left transition-all duration-150 cursor-pointer border ${
                  isActive
                    ? 'border-amber-500/50 shadow-sm font-bold bg-amber-500/5 dark:bg-amber-500/10'
                    : 'border-border/50 hover:border-border text-muted-foreground shadow-xs'
                }`}
              >
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">{tab.label}</span>
                <span className="text-2xl font-extrabold font-mono text-foreground mt-1 block tracking-tight">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Search & Batch Actions Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search department, item, or requester..."
              className="pl-9 h-9 text-xs bg-card border-border text-foreground"
            />
          </div>

          {activeFilter === 'pending_coordinator' && filteredRequests.length > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={selectAllPending} className="text-xs h-8">
                Select All Pending ({counts.pending_coordinator || 0})
              </Button>
              {pendingSelectedCount > 0 && (
                <>
                  <Button
                    size="sm"
                    onClick={() => handleBatchAction('approved')}
                    disabled={loading}
                    className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    Approve ({pendingSelectedCount})
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleBatchAction('declined')}
                    disabled={loading}
                    className="text-xs h-8 font-semibold"
                  >
                    Decline ({pendingSelectedCount})
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Requests List Column */}
          <div className="lg:col-span-2 space-y-4">
            {filteredRequests.length === 0 ? (
              <Card className="glass-card border-none p-8 text-center">
                <p className="text-xs text-muted-foreground italic">
                  {searchQuery ? 'No requisitions match your search.' : 'No requisition logs found for this filter.'}
                </p>
              </Card>
            ) : (
              filteredRequests.map((req) => {
                const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending_coordinator
                const isSelected = selectedIds.has(req.id)
                return (
                  <div
                    key={req.id}
                    className="glass-card p-4 space-y-3 transition-all duration-200"
                    style={{
                      borderColor: isSelected ? statusCfg.color : undefined,
                      borderWidth: isSelected ? '1.5px' : undefined,
                    }}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-start gap-3">
                        {req.status === 'pending_coordinator' && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(req.id)}
                            className="mt-1 h-4 w-4 rounded border-border accent-amber-500 cursor-pointer"
                          />
                        )}
                        <div>
                          <span className="text-[13px] font-bold text-foreground block">
                            {req.department?.name} Department
                          </span>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            Submitted by {req.requester?.full_name || req.requester?.email} on {new Date(req.created_at).toLocaleDateString()}
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

                    {/* Items list */}
                    <div className="p-3 bg-background/40 border border-border rounded-lg space-y-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block font-sans">Items requested:</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {req.items_json.map((it, itIdx) => (
                          <div key={itIdx} className="flex justify-between border-b border-border/40 pb-1">
                            <span className="text-foreground">{it.name} <span className="text-[10px] text-muted-foreground capitalize">({it.category})</span></span>
                            <span className="font-bold text-foreground font-mono">x {it.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Status Timeline */}
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {(['pending_coordinator', 'approved', 'in_progress', 'delivered'] as ReqStatus[]).map((stage, i) => {
                        const stageIdx = ['pending_coordinator', 'approved', 'in_progress', 'partially_fulfilled', 'delivered'].indexOf(stage)
                        const currentIdx = ['pending_coordinator', 'approved', 'in_progress', 'partially_fulfilled', 'delivered'].indexOf(req.status)
                        const isCompleted = req.status !== 'declined' && currentIdx >= stageIdx
                        const stageLabel = stage === 'pending_coordinator' ? 'Submitted' : stage === 'in_progress' ? 'Processing' : STATUS_CONFIG[stage]?.label || stage
                        return (
                          <React.Fragment key={stage}>
                            {i > 0 && (
                              <div
                                className="h-[1px] flex-1 min-w-[12px]"
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

                    {/* Reviewed timestamp */}
                    {req.reviewed_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Reviewed on {new Date(req.reviewed_at).toLocaleDateString()} at {new Date(req.reviewed_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}

                    {/* Actions */}
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
                    ID: {selectedReq.id.substring(0, 8)} • {selectedReq.items_json.length} item(s)
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
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
