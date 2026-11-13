'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { showToast } from '@/components/ui/toast'
import { isMock } from '@/utils/supabase'
import { PackageCheck, ShoppingBag, CheckCircle2, Clock, AlertCircle, Printer, Download } from 'lucide-react'

interface MarketItem {
  key: string
  inventoryItemId?: string | null
  name: string
  unit: string
  category: string
  requested: number
  approved: number
  awaiting: number
  currentStoreStock: number
  stockedFromMarket: number
  departments: { id: string; name: string; qty: number; requestedQty?: number; approvedQty?: number; status?: string }[]
  batch: number | null
  qtyBought: number
  qtyReceived: number
  unitCost?: number | null
  supplierName?: string
  receiptRef?: string
  note: string
}

interface DeptRow {
  id: string
  name: string
  hod: string | null
  submitted: number
  pending: number
  approved: number
  declined: number
  totalItemsCount?: number
  totalUnitsRequested?: number
  totalUnitsApproved?: number
  latestRequestId?: string | null
  latestSubmittedAt?: string | null
}

interface MarketAnalytics {
  totalDepartments: number
  departmentsSubmitted: number
  departmentsNotSubmitted: number
  departmentsPendingApproval: number
  departmentsApproved: number
  totalDistinctItems: number
  totalUnitsRequested: number
  totalUnitsApproved: number
  totalUnitsAwaiting: number
  totalUnitsBought: number
  totalUnitsReceived: number
  totalUnitsStocked: number
  totalActualSpend?: number
}

interface MarketListData {
  event: { id: string; name: string; status: string | null; requisitionClosesAt: string | null }
  canEdit: boolean
  canApprove?: boolean
  analytics?: MarketAnalytics
  items: MarketItem[]
  departments: DeptRow[]
}

type BatchFilter = 'all' | 'none' | number
type DeptFilter = 'all' | 'submitted' | 'pending' | 'approved' | 'not_sent'

function deptStatus(d: DeptRow): { label: string; className: string } {
  if (d.submitted === 0) return { label: 'Not sent yet', className: 'bg-muted text-muted-foreground border border-border' }
  if (d.pending > 0) return { label: 'Awaiting Approval', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' }
  if (d.approved > 0) return { label: 'Approved for Market', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' }
  return { label: 'Declined', className: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30' }
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function MarketListView({ backHref }: { backHref: string }) {
  const router = useRouter()
  const [data, setData] = useState<MarketListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [batchFilter, setBatchFilter] = useState<BatchFilter>('all')
  const [deptFilter, setDeptFilter] = useState<DeptFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Partial<MarketItem>>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [stockingAll, setStockingAll] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (isMock) {
      setData({
        event: { id: 'evt-mock', name: 'Congress 2026', status: 'requisition_open', requisitionClosesAt: null },
        canEdit: true,
        canApprove: true,
        analytics: {
          totalDepartments: 34,
          departmentsSubmitted: 2,
          departmentsNotSubmitted: 32,
          departmentsPendingApproval: 1,
          departmentsApproved: 1,
          totalDistinctItems: 3,
          totalUnitsRequested: 290,
          totalUnitsApproved: 200,
          totalUnitsAwaiting: 90,
          totalUnitsBought: 150,
          totalUnitsReceived: 150,
          totalUnitsStocked: 0,
        },
        items: [],
        departments: [],
      })
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/needs/market-list?type=pre_event')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load the market list')
      setData(json)
      setDrafts({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the market list')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const items = useMemo(() => {
    let all = data?.items || []
    if (batchFilter === 'none') all = all.filter(i => i.batch == null)
    else if (batchFilter !== 'all') all = all.filter(i => i.batch === batchFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      all = all.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.departments.some(d => d.name.toLowerCase().includes(q))
      )
    }
    return all
  }, [data, batchFilter, searchQuery])

  const filteredDepartments = useMemo(() => {
    const rows = data?.departments || []
    if (deptFilter === 'submitted') return rows.filter(d => d.submitted > 0)
    if (deptFilter === 'pending') return rows.filter(d => d.pending > 0)
    if (deptFilter === 'approved') return rows.filter(d => d.approved > 0 && d.pending === 0)
    if (deptFilter === 'not_sent') return rows.filter(d => d.submitted === 0)
    return rows
  }, [data, deptFilter])

  const analytics: MarketAnalytics = useMemo(() => {
    if (data?.analytics) return data.analytics
    const rows = data?.departments || []
    const itms = data?.items || []
    return {
      totalDepartments: rows.length,
      departmentsSubmitted: rows.filter(d => d.submitted > 0).length,
      departmentsNotSubmitted: rows.filter(d => d.submitted === 0).length,
      departmentsPendingApproval: rows.filter(d => d.pending > 0).length,
      departmentsApproved: rows.filter(d => d.approved > 0 && d.pending === 0).length,
      totalDistinctItems: itms.length,
      totalUnitsRequested: itms.reduce((s, r) => s + (r.requested || r.approved + r.awaiting), 0),
      totalUnitsApproved: itms.reduce((s, r) => s + r.approved, 0),
      totalUnitsAwaiting: itms.reduce((s, r) => s + r.awaiting, 0),
      totalUnitsBought: itms.reduce((s, r) => s + r.qtyBought, 0),
      totalUnitsReceived: itms.reduce((s, r) => s + r.qtyReceived, 0),
      totalUnitsStocked: itms.reduce((s, r) => s + (r.stockedFromMarket || 0), 0),
    }
  }, [data])

  const unstockedReceivedItems = useMemo(() => {
    return (data?.items || []).filter(i => i.qtyReceived > (i.stockedFromMarket || 0))
  }, [data])

  const value = <K extends keyof MarketItem>(item: MarketItem, field: K): MarketItem[K] =>
    (drafts[item.key]?.[field] as MarketItem[K]) ?? item[field]

  const setDraft = (key: string, patch: Partial<MarketItem>) =>
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const save = async (item: MarketItem) => {
    const boughtVal = Number(value(item, 'qtyBought')) || 0
    const receivedVal = Number(value(item, 'qtyReceived')) || 0
    if (receivedVal > boughtVal) {
      showToast(`Warning: Received (${receivedVal}) exceeds Bought (${boughtVal}) for ${item.name}.`, 'warning')
    }
    setSavingKey(item.key)
    try {
      const res = await fetch('/api/needs/market-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: item.key,
          name: item.name,
          unit: item.unit,
          batch: value(item, 'batch'),
          qtyBought: value(item, 'qtyBought'),
          qtyReceived: value(item, 'qtyReceived'),
          unitCost: value(item, 'unitCost'),
          supplierName: value(item, 'supplierName'),
          receiptRef: value(item, 'receiptRef'),
          note: value(item, 'note'),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      showToast(`Saved market entry: ${item.name}`, 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const handleStockReceivedToInventory = async () => {
    if (Object.keys(drafts).length > 0) {
      showToast('You have unsaved market row edits. Please save your changes before stocking to Store Inventory.', 'warning')
      return
    }
    if (unstockedReceivedItems.length === 0) {
      showToast('All received market items have already been stocked into Store Inventory.', 'info')
      return
    }
    setStockingAll(true)
    try {
      const res = await fetch('/api/needs/market-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stock_to_inventory',
          items: unstockedReceivedItems.map(i => ({
            key: i.key,
            name: i.name,
            unit: i.unit,
            category: i.category,
            qtyReceived: i.qtyReceived,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to stock items into inventory')
      showToast(`Stocked ${json.stockedCount} item(s) (${json.totalUnitsAdded} total units) into Central Stores Inventory!`, 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to stock items', 'error')
    } finally {
      setStockingAll(false)
    }
  }

  const downloadCsv = () => {
    const header = ['Item', 'Unit', 'Category', 'Requested Qty', 'Approved Qty (To Buy)', 'Awaiting Approval', 'Already In Store Stock', 'Market Trip', 'Bought', 'Received', 'Stocked to Store', 'Unit Cost (NGN)', 'Total Cost (NGN)', 'Supplier', 'Receipt Ref', 'Departments Breakdown', 'Note']
    const lines = items.map(i => [
      i.name,
      i.unit,
      i.category,
      i.requested || (i.approved + i.awaiting),
      i.approved,
      i.awaiting,
      i.currentStoreStock ?? 0,
      i.batch ? `Trip ${i.batch}` : '',
      i.qtyBought,
      i.qtyReceived,
      i.stockedFromMarket ?? 0,
      i.unitCost ?? 0,
      (i.qtyBought || 0) * (i.unitCost || 0),
      i.supplierName || '',
      i.receiptRef || '',
      i.departments.map(d => `${d.name} (${d.qty})`).join('; '),
      i.note,
    ].map(csvCell).join(','))
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pre-event-market-list-${(data?.event.name || 'event').replace(/\s+/g, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const canEdit = !!data?.canEdit
  const submissionRate = analytics.totalDepartments > 0
    ? Math.round((analytics.departmentsSubmitted / analytics.totalDepartments) * 100)
    : 0

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-border print:hidden">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-500">
                Phase 1 · Pre-Event Needs &amp; Market Procurement
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {data?.event.name || 'Current Event'} — Consolidated Market List
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Digitised departmental pre-event needs lists for market purchase, approval analytics, and seamless store inventory stocking.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && unstockedReceivedItems.length > 0 && (
              <Button
                onClick={handleStockReceivedToInventory}
                disabled={stockingAll}
                className="h-10 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <PackageCheck className="w-4 h-4" />
                {stockingAll ? 'Stocking Inventory…' : `📦 Stock Received Items into Store (${unstockedReceivedItems.length})`}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/store-requisitions?mode=pre_event')}
              className="h-10 px-4 text-xs font-semibold cursor-pointer"
            >
              📋 Review Department Lists {analytics.departmentsPendingApproval > 0 ? `(${analytics.departmentsPendingApproval} Pending)` : ''}
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="h-10 px-3.5 text-xs cursor-pointer flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
            <Button variant="outline" onClick={downloadCsv} className="h-10 px-3.5 text-xs cursor-pointer flex items-center gap-1.5" disabled={items.length === 0}>
              <Download className="w-3.5 h-3.5" /> Export Excel (CSV)
            </Button>
            <Button variant="outline" onClick={() => router.push(backHref)} className="h-10 px-3.5 text-xs cursor-pointer">
              ← Back
            </Button>
          </div>
        </div>

        {/* Process Workflow Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-2xl border border-border/60 bg-card/60 print:hidden">
          <div className="flex items-start gap-3 p-2.5 rounded-xl bg-background/60 border border-border/40">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-500 font-bold text-xs">1</span>
            <div>
              <p className="text-xs font-bold text-foreground">HODs Submit Pre-Event Needs List</p>
              <p className="text-[11px] text-muted-foreground">Departments submit what they need bought before the event (replacing WhatsApp lists).</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2.5 rounded-xl bg-background/60 border border-border/40">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 font-bold text-xs">2</span>
            <div>
              <p className="text-xs font-bold text-foreground">Gen Sec &amp; Nat. Coordinator Approve</p>
              <p className="text-[11px] text-muted-foreground">Approved lists automatically consolidate here per item so Stores can go to the market.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2.5 rounded-xl bg-background/60 border border-border/40">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 font-bold text-xs">3</span>
            <div>
              <p className="text-xs font-bold text-foreground">Stores Buys &amp; Stocks Store Inventory</p>
              <p className="text-[11px] text-muted-foreground">Stores records market purchases and stocks received items into Store Inventory for the live event.</p>
            </div>
          </div>
        </div>

        {loading && <p className="text-sm font-mono text-muted-foreground animate-pulse">Loading pre-event market analytics…</p>}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* At-a-Glance Pre-Event Analytics KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Depts Submitted</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-foreground mt-1.5 block">
                  {analytics.departmentsSubmitted} <span className="text-xs font-sans text-muted-foreground">/ {analytics.totalDepartments}</span>
                </span>
                <span className="text-[11px] text-emerald-500 font-semibold block mt-0.5">
                  {submissionRate}% submission rate
                </span>
              </div>

              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Yet to Submit</span>
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-red-500 mt-1.5 block">
                  {analytics.departmentsNotSubmitted}
                </span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  Departments pending list
                </span>
              </div>

              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Awaiting Approval</span>
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-amber-500 mt-1.5 block">
                  {analytics.departmentsPendingApproval}
                </span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  {analytics.totalUnitsAwaiting.toLocaleString()} units waiting
                </span>
              </div>

              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Distinct Market Items</span>
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-blue-500 mt-1.5 block">
                  {analytics.totalDistinctItems}
                </span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  {analytics.totalUnitsApproved.toLocaleString()} units approved
                </span>
              </div>

              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Bought at Market</span>
                  <ShoppingBag className="w-3.5 h-3.5 text-purple-500" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-purple-500 mt-1.5 block">
                  {analytics.totalUnitsBought.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  {analytics.totalUnitsReceived.toLocaleString()} units received
                  {analytics.totalActualSpend ? ` · ₦${analytics.totalActualSpend.toLocaleString()}` : ''}
                </span>
              </div>

              <div className="bg-card rounded-xl p-4 border border-border/50 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Stocked in Store</span>
                  <PackageCheck className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <span className="text-2xl font-extrabold font-mono text-emerald-500 mt-1.5 block">
                  {analytics.totalUnitsStocked.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  Ready for live Congress
                </span>
              </div>
            </div>

            {/* Department Submission & Approval Tracker */}
            <Card className="glass-card border-none">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-foreground">
                    Department Pre-Event Needs Submission Tracker ({analytics.departmentsSubmitted} of {analytics.totalDepartments} Sent)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click any submitted department to review or adjust their pre-event needs list.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 print:hidden">
                  {([
                    ['all', `All (${data.departments.length})`],
                    ['pending', `Awaiting Approval (${analytics.departmentsPendingApproval})`],
                    ['approved', `Approved (${analytics.departmentsApproved})`],
                    ['not_sent', `Not Sent Yet (${analytics.departmentsNotSubmitted})`],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setDeptFilter(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        deptFilter === key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filteredDepartments.map(d => {
                    const st = deptStatus(d)
                    return (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/40 p-3 hover:border-border transition-all"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{d.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {d.hod ? `HOD: ${d.hod}` : 'HOD assigned'}
                            {d.submitted > 0 && d.totalItemsCount ? ` · ${d.totalItemsCount} items (${d.totalUnitsRequested} units)` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${st.className}`}>
                            {st.label}
                          </span>
                          {d.latestRequestId && (
                            <button
                              onClick={() => router.push(`/dashboard/store-requisitions?mode=pre_event&id=${d.latestRequestId}`)}
                              className="text-xs font-bold text-blue-500 hover:text-blue-400 underline cursor-pointer print:hidden"
                            >
                              {d.pending > 0 ? 'Review' : 'View'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Consolidated Market Purchase Table */}
            <Card className="glass-card border-none">
              <CardHeader className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">
                      Consolidated Market Purchase List ({items.length} Distinct Items)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Aggregated across all department pre-event needs lists. Click an item name to see which departments requested it.
                    </p>
                  </div>
                  <Input
                    placeholder="Search item or department…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full sm:w-64 h-9 text-xs print:hidden"
                  />
                </div>

                <div className="flex flex-wrap gap-2 print:hidden">
                  {(['all', 1, 2, 3, 'none'] as BatchFilter[]).map(b => (
                    <button
                      key={String(b)}
                      onClick={() => setBatchFilter(b)}
                      className={`h-9 px-3.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        batchFilter === b
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      {b === 'all' ? 'All Items' : b === 'none' ? 'Unassigned Trip' : `Market Trip ${b}`}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">No pre-event market items matching this filter yet.</p>
                    <p className="text-xs text-muted-foreground">Once HODs submit their Pre-Event Needs Lists, their items will consolidate here automatically.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                          <th className="py-3 pr-3 font-semibold">Item &amp; Unit</th>
                          <th className="py-3 pr-3 font-semibold text-right">Approved to Buy</th>
                          <th className="py-3 pr-3 font-semibold text-right">Waiting Approval</th>
                          <th className="py-3 pr-3 font-semibold text-right">In Store Stock</th>
                          <th className="py-3 pr-3 font-semibold">Market Trip</th>
                          <th className="py-3 pr-3 font-semibold">Bought</th>
                          <th className="py-3 pr-3 font-semibold">Received</th>
                          {canEdit && <th className="py-3 font-semibold print:hidden">Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(item => {
                          const dirty = !!drafts[item.key]
                          const received = Number(value(item, 'qtyReceived')) || 0
                          const short = item.approved > 0 && received < item.approved
                          const unstockedDelta = Math.max(0, item.qtyReceived - (item.stockedFromMarket || 0))
                          return (
                            <React.Fragment key={item.key}>
                              <tr className="border-b border-border/60 align-middle hover:bg-muted/10">
                                <td className="py-3 pr-3">
                                  <button
                                    onClick={() => setOpenKey(openKey === item.key ? null : item.key)}
                                    className="text-left font-bold text-foreground hover:underline cursor-pointer"
                                    aria-expanded={openKey === item.key}
                                  >
                                    {item.name}
                                  </button>
                                  <span className="block text-xs text-muted-foreground">
                                    {item.unit} · {item.category} · {item.departments.length} dept{item.departments.length === 1 ? '' : 's'}
                                  </span>
                                </td>
                                <td className="py-3 pr-3 text-right font-mono text-base font-extrabold text-emerald-500">
                                  {item.approved}
                                </td>
                                <td className="py-3 pr-3 text-right font-mono text-amber-500 font-semibold">
                                  {item.awaiting > 0 ? item.awaiting : '–'}
                                </td>
                                <td className="py-3 pr-3 text-right font-mono text-xs text-muted-foreground">
                                  {item.currentStoreStock || 0} {item.unit}
                                  {item.stockedFromMarket > 0 && (
                                    <span className="block text-[10px] text-emerald-500 font-semibold">
                                      +{item.stockedFromMarket} stocked from market
                                    </span>
                                  )}
                                  {unstockedDelta > 0 && (
                                    <span className="block text-[10px] text-amber-500 font-semibold">
                                      {unstockedDelta} received ready to stock
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 pr-3">
                                  {canEdit ? (
                                    <select
                                      aria-label={`Market trip for ${item.name}`}
                                      value={value(item, 'batch') ?? ''}
                                      onChange={e => setDraft(item.key, { batch: e.target.value ? Number(e.target.value) : null })}
                                      className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
                                    >
                                      <option value="">Not set</option>
                                      <option value="1">Trip 1</option>
                                      <option value="2">Trip 2</option>
                                      <option value="3">Trip 3</option>
                                      <option value="4">Trip 4</option>
                                    </select>
                                  ) : (
                                    <span>{item.batch ? `Trip ${item.batch}` : '–'}</span>
                                  )}
                                </td>
                                <td className="py-3 pr-3">
                                  {canEdit ? (
                                    <input
                                      type="number" min={0} inputMode="numeric"
                                      aria-label={`Quantity bought for ${item.name}`}
                                      value={value(item, 'qtyBought')}
                                      onChange={e => setDraft(item.key, { qtyBought: Math.max(0, Number(e.target.value) || 0) })}
                                      className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-xs font-mono"
                                    />
                                  ) : <span className="font-mono">{item.qtyBought}</span>}
                                </td>
                                <td className="py-3 pr-3">
                                  {canEdit ? (
                                    <input
                                      type="number" min={0} inputMode="numeric"
                                      aria-label={`Quantity received for ${item.name}`}
                                      value={value(item, 'qtyReceived')}
                                      onChange={e => setDraft(item.key, { qtyReceived: Math.max(0, Number(e.target.value) || 0) })}
                                      className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-xs font-mono"
                                    />
                                  ) : <span className="font-mono">{item.qtyReceived}</span>}
                                  {short && received > 0 && (
                                    <span className="block text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                                      {item.approved - received} short
                                    </span>
                                  )}
                                </td>
                                {canEdit && (
                                  <td className="py-3 print:hidden">
                                    <Button
                                      onClick={() => save(item)}
                                      disabled={!dirty || savingKey === item.key}
                                      size="sm"
                                      className="h-9 px-3.5 text-xs font-bold cursor-pointer"
                                    >
                                      {savingKey === item.key ? 'Saving…' : 'Save'}
                                    </Button>
                                  </td>
                                )}
                              </tr>
                              {openKey === item.key && (
                                <tr className="border-b border-border/60 bg-muted/30">
                                  <td colSpan={canEdit ? 8 : 7} className="py-3 px-4">
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                      Departmental Breakdown for {item.name}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {item.departments.length === 0 ? (
                                        <span className="text-xs text-muted-foreground">No departments listed.</span>
                                      ) : (
                                        item.departments.map(d => (
                                          <span
                                            key={d.id}
                                            className={`text-xs rounded-lg border px-3 py-1.5 ${
                                              d.status === 'approved'
                                                ? 'border-emerald-500/30 bg-emerald-500/10 text-foreground'
                                                : 'border-amber-500/30 bg-amber-500/10 text-foreground'
                                            }`}
                                          >
                                            {d.name}: <strong className="font-mono">{d.qty} {item.unit}</strong>{' '}
                                            <span className="text-[10px] text-muted-foreground">
                                              ({d.status === 'approved' ? 'Approved' : 'Awaiting approval'})
                                            </span>
                                          </span>
                                        ))
                                      )}
                                    </div>
                                    {canEdit && (
                                      <div className="mt-3 space-y-2">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                          <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            aria-label={`Unit cost for ${item.name}`}
                                            placeholder="Unit Cost (₦)"
                                            value={value(item, 'unitCost') ?? ''}
                                            onChange={e => setDraft(item.key, { unitCost: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })}
                                            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-mono"
                                          />
                                          <input
                                            aria-label={`Supplier for ${item.name}`}
                                            placeholder="Supplier / Vendor Name"
                                            value={value(item, 'supplierName') || ''}
                                            onChange={e => setDraft(item.key, { supplierName: e.target.value })}
                                            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                                          />
                                          <input
                                            aria-label={`Receipt ref for ${item.name}`}
                                            placeholder="Receipt / Invoice Ref #"
                                            value={value(item, 'receiptRef') || ''}
                                            onChange={e => setDraft(item.key, { receiptRef: e.target.value })}
                                            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                                          />
                                        </div>
                                        <input
                                          aria-label={`Note for ${item.name}`}
                                          placeholder="Market note (brand, shortfall reason, quality note)"
                                          value={value(item, 'note') || ''}
                                          onChange={e => setDraft(item.key, { note: e.target.value })}
                                          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                                        />
                                      </div>
                                    )}
                                    {!canEdit && (item.note || item.unitCost || item.supplierName || item.receiptRef) && (
                                      <p className="mt-2 text-xs text-muted-foreground">
                                        {item.unitCost ? `Unit Cost: ₦${Number(item.unitCost).toLocaleString()} · ` : ''}
                                        {item.supplierName ? `Supplier: ${item.supplierName} · ` : ''}
                                        {item.receiptRef ? `Receipt: ${item.receiptRef} · ` : ''}
                                        {item.note ? `Note: ${item.note}` : ''}
                                      </p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
