'use client'

import React, { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription'
import { fetchEnhancedStoreRequests } from '@/utils/batch-queries'
import { TableSkeleton } from '@/components/ui/skeleton-loader'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { CheckCircle2, Package, ClipboardList } from 'lucide-react'
import { getCurrentEventId, getDepartmentAssignment } from '@/lib/events/current-event'
import { UnassignedDepartmentGate } from '@/components/unassigned-department-gate'

interface RequestItem {
  inventory_item_id?: string | null
  name: string
  quantity: number
  requested_quantity?: number
  approved_quantity?: number
  fulfilled_quantity?: number
  category?: string
  unit?: string
}

interface RequisitionTicket {
  id: string
  items_json: RequestItem[]
  status: 'pending_coordinator' | 'approved' | 'declined' | 'in_progress' | 'partially_fulfilled' | 'ready_for_collection' | 'delivered'
  request_type?: 'pre_event' | 'during_event'
  reviewer_comments?: string
  reviewed_at?: string
  created_at: string
  requester?: {
    full_name: string
    email: string
  }
  department?: {
    name: string
  }
}

function StoreFulfillmentContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [departmentName, setDepartmentName] = useState('Stores')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [fulfillDrafts, setFulfillDrafts] = useState<Record<string, Record<number, number>>>({})
  const [inventoryStockMap, setInventoryStockMap] = useState<Record<string, { current_stock: number; reserved_stock: number }>>({})
  const [requisitions, setRequisitions] = useState<RequisitionTicket[]>([])
  const [preEventListsCount, setPreEventListsCount] = useState(0)
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'processing' | 'partially_fulfilled' | 'ready' | 'delivered'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, searchQuery])

  const loadData = useCallback(async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true)
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

    let activeProfile = prof
    if (!activeProfile) {
      const meta = (user.user_metadata || {}) as any
      activeProfile = {
        id: user.id,
        email: user.email || '',
        full_name: meta?.full_name || 'Stores HOD',
        role: meta?.role || 'hod',
        department_id: meta?.department_id || null
      }
    }

    const currentEventId = await getCurrentEventId(supabase)

    if (!isMock && (activeProfile.role === 'hod' || activeProfile.role === 'assistant')) {
      const assignment = await getDepartmentAssignment(supabase, activeProfile.id, currentEventId)
      activeProfile.department_id = assignment?.department_id ?? null
      if (!activeProfile.department_id) {
        setProfile(activeProfile)
        if (showLoadingSpinner) setLoading(false)
        return
      }
    }

    if (activeProfile.department_id) {
      const { data: dbDept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', activeProfile.department_id)
        .maybeSingle()
      if (dbDept) setDepartmentName(dbDept.name)
    }

    setProfile(activeProfile)

    // Load Requisitions (Separate Pre-Event Market Lists from Live During-Event Store Requisitions)
    if (!isMock) {
      let reqsQuery = supabase
        .from('store_requests')
        .select('*')
      if (currentEventId) reqsQuery = reqsQuery.eq('event_id', currentEventId)
      const { data: reqsData } = await reqsQuery.order('created_at', { ascending: false })

      if (reqsData) {
        const preLists = reqsData.filter((r: any) => r.request_type === 'pre_event')
        setPreEventListsCount(preLists.length)

        const duringReqs = reqsData.filter((r: any) => (r.request_type || 'during_event') === 'during_event')
        const enhanced = await fetchEnhancedStoreRequests(supabase, duringReqs)
        setRequisitions(enhanced)
      }

      const { data: invRows } = await supabase
        .from('inventory_items')
        .select('id, current_stock, reserved_stock')
      if (invRows) {
        const stockMap: Record<string, { current_stock: number; reserved_stock: number }> = {}
        invRows.forEach((row: any) => {
          stockMap[row.id] = {
            current_stock: Number(row.current_stock) || 0,
            reserved_stock: Number(row.reserved_stock) || 0,
          }
        })
        setInventoryStockMap(stockMap)
      }
    } else {
      setPreEventListsCount(2)
      setRequisitions([
        {
          id: 'req-mock-2',
          request_type: 'during_event',
          items_json: [
            { name: 'Stand Fans', quantity: 4, requested_quantity: 5, approved_quantity: 4 },
            { name: 'A4 Paper Rims', quantity: 5, requested_quantity: 5, approved_quantity: 5 }
          ],
          status: 'approved',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          requester: { full_name: 'Pastor Victor', email: 'acc@dtce.org' },
          department: { name: 'Accommodation' }
        }
      ])
    }

    if (showLoadingSpinner) setLoading(false)
  }, [router])

  useRealtimeSubscription({
    channelName: 'stores-fulfillment-hub',
    subscriptions: [{ table: 'store_requests' }],
    onDataChange: () => loadData(false),
  })

  useEffect(() => {
    loadData(true)
  }, [loadData])

  const handleUpdateStatus = async (
    reqId: string,
    newStatus: 'pending_coordinator' | 'approved' | 'in_progress' | 'partially_fulfilled' | 'ready_for_collection' | 'delivered' | 'declined'
  ) => {
    setActionLoading(true)
    const labelMap: Record<string, string> = {
      pending_coordinator: 'Pending Approval',
      approved: 'Approved',
      in_progress: 'In Progress',
      partially_fulfilled: 'Partially Fulfilled',
      ready_for_collection: 'Ready for Collection',
      delivered: 'Delivered',
      declined: 'Declined'
    }

    if (isMock) {
      showToast(`Requisition updated to ${labelMap[newStatus]} (Mock)`, 'success')
      setRequisitions(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus } : r))
      setActionLoading(false)
      return
    }

    try {
      const targetReq = requisitions.find(r => r.id === reqId)
      const draftForReq = fulfillDrafts[reqId] || {}
      let itemsPayload: RequestItem[] | undefined = undefined
      if (targetReq && Array.isArray(targetReq.items_json) && ['partially_fulfilled', 'ready_for_collection', 'delivered'].includes(newStatus)) {
        itemsPayload = targetReq.items_json.map((it, idx) => {
          const appQty = Number(it.approved_quantity ?? it.quantity) || 0
          const prevFulfilled = Number(it.fulfilled_quantity) || 0
          const fallbackVal = (newStatus === 'delivered' || newStatus === 'ready_for_collection')
            ? (prevFulfilled > 0 ? prevFulfilled : appQty)
            : prevFulfilled
          const draftVal = draftForReq[idx] !== undefined ? draftForReq[idx] : fallbackVal
          return {
            ...it,
            fulfilled_quantity: Math.min(appQty, Math.max(prevFulfilled, Number(draftVal) || 0)),
          }
        })
      }

      const res = await fetch('/api/update-store-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: reqId, status: newStatus, items_json: itemsPayload })
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update requisition')
      }

      showToast(`Requisition updated to ${labelMap[newStatus]}!`, 'success')
      loadData(false)
    } catch (err: any) {
      showToast(`Failed to update requisition: ${err.message}`, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const filteredRequisitions = requisitions.filter(r => {
    const matchesSearch =
      (r.department?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.requester?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (Array.isArray(r.items_json) && r.items_json.some(it => (it.name || '').toLowerCase().includes(searchQuery.toLowerCase())))

    if (!matchesSearch) return false

    if (activeTab === 'pending') return r.status === 'pending_coordinator'
    if (activeTab === 'approved') return r.status === 'approved'
    if (activeTab === 'processing') return r.status === 'in_progress'
    if (activeTab === 'partially_fulfilled') return r.status === 'partially_fulfilled'
    if (activeTab === 'ready') return r.status === 'ready_for_collection'
    if (activeTab === 'delivered') return r.status === 'delivered'
    return true
  })

  const pendingCount = requisitions.filter(r => r.status === 'pending_coordinator').length
  const approvedCount = requisitions.filter(r => r.status === 'approved').length
  const processingCount = requisitions.filter(r => r.status === 'in_progress' || r.status === 'partially_fulfilled').length
  const readyCount = requisitions.filter(r => r.status === 'ready_for_collection').length
  const deliveredCount = requisitions.filter(r => r.status === 'delivered').length

  if (!isMock && profile && !profile.department_id && (profile.role === 'hod' || profile.role === 'assistant')) {
    return <UnassignedDepartmentGate />
  }

  return (
    <div className="min-h-screen transition-colors duration-200" style={{ background: 'var(--background)' }}>
      {/* Breadcrumb Strip */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-border/40 bg-background/50 backdrop-blur-xs">
        <button
          onClick={() => router.push('/my-department')}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <span>←</span> Back to {departmentName} Dashboard
        </button>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-blue-500">
            Phase 2 · Live Event Store Counter Fulfillment
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 md:px-6 py-8 space-y-6">
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-[11px] font-bold tracking-widest text-blue-500 uppercase">Stores Department Console</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Live Event Store Requisitions &amp; Counter Fulfillment
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Prepare and hand out items requested by departments from Central Stores stock during the live event.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => router.push('/my-department/market-list')}
              className="text-xs font-bold h-9 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              🛒 Pre-Event Market List ({preEventListsCount} Dept Lists)
            </Button>
            <Button
              onClick={() => router.push('/my-department/inventory')}
              variant="outline"
              className="text-xs font-semibold h-9 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 cursor-pointer w-fit"
            >
              📦 Store Inventory &amp; Stock
            </Button>
            <Button
              onClick={() => loadData(true)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold h-9 px-3.5 border-border/70 hover:bg-accent/60 transition-colors shadow-xs cursor-pointer"
            >
              🔄 Refresh
            </Button>
          </div>
        </div>

        {/* Helpful separation notice if pre-event lists exist */}
        {preEventListsCount > 0 && requisitions.length === 0 && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-foreground">
                Looking for Pre-Event Departmental Needs Lists for Market Purchase?
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {preEventListsCount} department pre-event needs list(s) have been submitted for market procurement. Those are consolidated in the <strong>Market List</strong> (not here in the live store counter queue).
              </p>
            </div>
            <Button
              onClick={() => router.push('/my-department/market-list')}
              className="shrink-0 h-9 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              Open Market List →
            </Button>
          </div>
        )}

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Live Store Requests</span>
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground mt-2 mb-0.5 tracking-tight font-mono block">{requisitions.length}</span>
            <span className="text-[10px] text-muted-foreground font-medium">During-event requests</span>
          </Card>
          <Card className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Pending Approval</span>
            <span className="text-3xl sm:text-4xl font-extrabold text-amber-600 dark:text-amber-400 mt-2 mb-0.5 tracking-tight font-mono block">{pendingCount}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Awaiting Coordinator</span>
          </Card>
          <Card className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">In Processing</span>
            <span className="text-3xl sm:text-4xl font-extrabold text-purple-600 dark:text-purple-400 mt-2 mb-0.5 tracking-tight font-mono block">{processingCount}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Being prepared at Stores</span>
          </Card>
          <Card className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Delivered</span>
            <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2 mb-0.5 tracking-tight font-mono block">{deliveredCount}</span>
            <span className="text-[10px] text-muted-foreground font-medium">Handed over to depts</span>
          </Card>
        </div>

        {/* Segmented Filter Control */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-2 rounded-2xl border border-border/50">
          <div className="flex overflow-x-auto sm:flex-wrap items-center gap-1 p-1 bg-muted/40 dark:bg-slate-800/40 rounded-xl border border-border/30">
            {[
              { id: 'all', label: 'All', count: requisitions.length },
              { id: 'pending', label: 'Pending', count: pendingCount },
              { id: 'approved', label: 'Approved', count: approvedCount },
              { id: 'processing', label: 'In Progress', count: requisitions.filter(r => r.status === 'in_progress').length },
              { id: 'partially_fulfilled', label: 'Partially Fulfilled', count: requisitions.filter(r => r.status === 'partially_fulfilled').length },
              { id: 'ready', label: 'Ready for Collection', count: readyCount },
              { id: 'delivered', label: 'Delivered', count: deliveredCount },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`text-xs font-semibold px-3 py-1.5 min-h-[36px] rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-xs border border-border/50 font-bold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.id ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted/60 text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <Input
            placeholder="Search by department or item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 h-9 text-xs bg-background/60 border-border/60 focus:bg-background transition-colors"
          />
        </div>

        {/* Requisition List Item Cards */}
        {loading ? (
          <TableSkeleton rows={4} cols={3} />
        ) : filteredRequisitions.length === 0 ? (
          <Card className="bg-card rounded-xl p-12 text-center space-y-3 border border-border/50 shadow-xs">
            <span className="text-4xl block">📦</span>
            <p className="text-sm font-semibold text-muted-foreground">No live store requisitions match your filter criteria.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredRequisitions
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map(req => (
              <Card
                key={req.id}
                className="relative bg-card rounded-xl border border-border/50 overflow-hidden shadow-xs"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 sm:w-1.5"
                  style={{
                    backgroundColor:
                      req.status === 'pending_coordinator' ? '#F59E0B' :
                      req.status === 'approved' ? '#3B82F6' :
                      req.status === 'in_progress' ? '#8B5CF6' :
                      req.status === 'partially_fulfilled' ? '#EC4899' :
                      (req.status as string) === 'ready_for_collection' ? '#F59E0B' :
                      req.status === 'delivered' ? '#10B981' : '#EF4444'
                  }}
                />

                <CardHeader className="pl-5 sm:pl-6 pr-4 sm:pr-6 py-3.5 border-b border-border/40 bg-muted/20 dark:bg-slate-900/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-foreground tracking-tight">
                          {req.department?.name || 'Department'} Store Requisition
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Requested by <strong className="text-foreground font-semibold">{req.requester?.full_name}</strong> • Submitted {new Date(req.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full whitespace-nowrap w-fit"
                        style={
                          req.status === 'pending_coordinator' ? { background: 'rgba(245,158,11,0.12)', color: '#D97706', border: '1px solid rgba(245,158,11,0.3)' } :
                          req.status === 'approved' ? { background: 'rgba(59,130,246,0.12)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.3)' } :
                          req.status === 'in_progress' ? { background: 'rgba(139,92,246,0.12)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.3)' } :
                          req.status === 'partially_fulfilled' ? { background: 'rgba(236,72,153,0.12)', color: '#DB2777', border: '1px solid rgba(236,72,153,0.3)' } :
                          (req.status as string) === 'ready_for_collection' ? { background: 'rgba(245,158,11,0.2)', color: '#D97706', border: '1px solid rgba(245,158,11,0.4)' } :
                          req.status === 'delivered' ? { background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)' } :
                          { background: 'rgba(239,68,68,0.12)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.3)' }
                        }
                      >
                        {req.status === 'pending_coordinator' ? 'Pending Approval' :
                         req.status === 'approved' ? 'Approved' :
                         req.status === 'in_progress' ? 'In Progress' :
                         req.status === 'partially_fulfilled' ? 'Partially Fulfilled' :
                         (req.status as string) === 'ready_for_collection' ? 'Ready for Collection' :
                         req.status === 'delivered' ? 'Delivered' : 'Declined'}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pl-5 sm:pl-6 pr-4 sm:pr-6 pt-4 pb-4 space-y-4">
                  <div className="p-3 bg-muted/30 dark:bg-slate-900/40 rounded-xl border border-border/50 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Requested Material Items</span>
                    <div className="space-y-1.5">
                      {req.items_json && Array.isArray(req.items_json) && req.items_json.map((item, idx) => {
                        const reqQty = item.requested_quantity ?? item.quantity
                        const appQty = item.approved_quantity ?? item.quantity
                        const prevFulfilled = Number(item.fulfilled_quantity) || 0
                        const isAdjusted = reqQty !== undefined && appQty !== undefined && reqQty !== appQty
                        const canEditIssued = req.status === 'in_progress' || req.status === 'partially_fulfilled' || (req.status as string) === 'ready_for_collection'
                        const currentIssuedVal = fulfillDrafts[req.id]?.[idx] ?? (prevFulfilled > 0 ? prevFulfilled : appQty)
                        const stockInfo = item.inventory_item_id ? inventoryStockMap[item.inventory_item_id] : undefined
                        const availStock = stockInfo ? Math.max(0, stockInfo.current_stock - stockInfo.reserved_stock) : null

                        return (
                          <div key={idx} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-background/60 border border-border/40 text-xs">
                            <div>
                              <span className="font-semibold text-foreground">{item.name}</span>
                              {stockInfo && (
                                <span className={`ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                  availStock === 0
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                    : 'bg-slate-500/10 text-muted-foreground border-border'
                                }`}>
                                  In Stock: {stockInfo.current_stock} · Reserved: {stockInfo.reserved_stock} · Avail: {availStock}
                                </span>
                              )}
                              {prevFulfilled > 0 && prevFulfilled < appQty && (
                                <span className="ml-2 text-[10px] font-bold text-pink-500 bg-pink-500/10 px-1.5 py-0.5 rounded border border-pink-500/20">
                                  Issued: {prevFulfilled} / {appQty} (Backorder: {appQty - prevFulfilled})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 font-mono">
                              {isAdjusted ? (
                                <span className="text-xs">
                                  <span className="line-through text-muted-foreground mr-1">Req: {reqQty}</span>
                                  <span className="font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Approved: {appQty}</span>
                                </span>
                              ) : (
                                <span className="font-bold text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                  × {appQty || reqQty} {item.unit || ''}
                                </span>
                              )}
                              {canEditIssued && (
                                <div className="flex items-center gap-1 pl-2 border-l border-border">
                                  <span className="text-[10px] text-muted-foreground font-sans">Issue:</span>
                                  <input
                                    type="number"
                                    min={prevFulfilled}
                                    max={appQty}
                                    aria-label={`Issued quantity for ${item.name}`}
                                    value={currentIssuedVal}
                                    onChange={(e) => {
                                      const v = Math.min(appQty, Math.max(prevFulfilled, Number(e.target.value) || 0))
                                      setFulfillDrafts(prev => ({
                                        ...prev,
                                        [req.id]: { ...(prev[req.id] || {}), [idx]: v }
                                      }))
                                    }}
                                    className="w-16 h-7 rounded border border-border bg-background px-1.5 text-xs font-mono text-center"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {req.reviewer_comments && (
                    <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                      <strong>Coordinator Notes:</strong> {req.reviewer_comments}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border/40">
                    <div>
                      {req.status === 'pending_coordinator' && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold italic flex items-center gap-1.5">
                          <span>⏳</span> Awaiting Approval
                        </span>
                      )}
                      {req.status === 'approved' && (
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Approved — Ready for Store Counter Preparation
                        </span>
                      )}
                      {(req.status as string) === 'ready_for_collection' && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-amber-400" /> Set Aside at Stores — Ready for Department Collection
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {req.status === 'approved' && (
                        <Button
                          size="sm"
                          disabled={actionLoading}
                          onClick={() => handleUpdateStatus(req.id, 'in_progress')}
                          className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs min-h-[38px] sm:h-9 shadow-xs cursor-pointer"
                        >
                          Start Processing
                        </Button>
                      )}

                      {req.status === 'in_progress' && (
                        <>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleUpdateStatus(req.id, 'ready_for_collection')}
                            className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs min-h-[38px] sm:h-9 shadow-xs cursor-pointer"
                          >
                            Mark Ready for Collection
                          </Button>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleUpdateStatus(req.id, 'partially_fulfilled')}
                            className="bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs min-h-[38px] sm:h-9 shadow-xs cursor-pointer"
                          >
                            Partial Delivery
                          </Button>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleUpdateStatus(req.id, 'delivered')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs min-h-[38px] sm:h-9 shadow-xs cursor-pointer"
                          >
                            Mark Delivered
                          </Button>
                        </>
                      )}

                      {(req.status as string) === 'ready_for_collection' && (
                        <>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleUpdateStatus(req.id, 'delivered')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs min-h-[38px] sm:h-9 shadow-xs cursor-pointer"
                          >
                            Mark Handed Over / Delivered
                          </Button>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleUpdateStatus(req.id, 'partially_fulfilled')}
                            className="bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs min-h-[38px] sm:h-9 shadow-xs cursor-pointer"
                          >
                            Partial Handover
                          </Button>
                        </>
                      )}

                      {req.status === 'partially_fulfilled' && (
                        <>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleUpdateStatus(req.id, 'ready_for_collection')}
                            className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs min-h-[38px] sm:h-9 shadow-xs cursor-pointer"
                          >
                            Mark Ready for Collection
                          </Button>
                          <Button
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleUpdateStatus(req.id, 'delivered')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs min-h-[38px] sm:h-9 shadow-xs cursor-pointer"
                          >
                            Mark Fully Delivered
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="pt-2">
              <DataTablePagination
                currentPage={currentPage}
                totalPages={Math.ceil(filteredRequisitions.length / pageSize)}
                totalItems={filteredRequisitions.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function StoreFulfillmentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm font-mono text-muted-foreground">Loading Stores Fulfillment...</div>}>
      <StoreFulfillmentContent />
    </Suspense>
  )
}
