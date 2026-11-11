'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { showToast } from '@/components/ui/toast'
import { isMock } from '@/utils/supabase'

interface MarketItem {
  key: string
  name: string
  unit: string
  category: string
  approved: number
  awaiting: number
  departments: { id: string; name: string; qty: number }[]
  batch: number | null
  qtyBought: number
  qtyReceived: number
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
}

interface MarketListData {
  event: { id: string; name: string; status: string | null; requisitionClosesAt: string | null }
  canEdit: boolean
  items: MarketItem[]
  departments: DeptRow[]
}

type ListType = 'pre_event' | 'during_event'
type BatchFilter = 'all' | 'none' | number

function deptStatus(d: DeptRow): { label: string; className: string } {
  if (d.submitted === 0) return { label: 'Not sent yet', className: 'bg-muted text-muted-foreground' }
  if (d.pending > 0) return { label: 'Waiting for approval', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
  if (d.approved > 0) return { label: 'Approved', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
  return { label: 'Declined', className: 'bg-red-500/15 text-red-700 dark:text-red-400' }
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function MarketListView({ backHref }: { backHref: string }) {
  const router = useRouter()
  const [listType, setListType] = useState<ListType>('pre_event')
  const [data, setData] = useState<MarketListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [batchFilter, setBatchFilter] = useState<BatchFilter>('all')
  const [drafts, setDrafts] = useState<Record<string, Partial<MarketItem>>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (isMock) {
      setData({
        event: { id: 'evt-mock', name: 'Congress 2026 (demo)', status: 'requisition_open', requisitionClosesAt: null },
        canEdit: true,
        items: [],
        departments: [],
      })
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/needs/market-list?type=${listType}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load the market list')
      setData(json)
      setDrafts({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the market list')
    } finally {
      setLoading(false)
    }
  }, [listType])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / tab change
    load()
  }, [load])

  const items = useMemo(() => {
    const all = data?.items || []
    if (batchFilter === 'all') return all
    if (batchFilter === 'none') return all.filter(i => i.batch == null)
    return all.filter(i => i.batch === batchFilter)
  }, [data, batchFilter])

  const deptCounts = useMemo(() => {
    const rows = data?.departments || []
    return {
      total: rows.length,
      sent: rows.filter(d => d.submitted > 0).length,
      waiting: rows.filter(d => d.pending > 0).length,
    }
  }, [data])

  const value = <K extends keyof MarketItem>(item: MarketItem, field: K): MarketItem[K] =>
    (drafts[item.key]?.[field] as MarketItem[K]) ?? item[field]

  const setDraft = (key: string, patch: Partial<MarketItem>) =>
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  const save = async (item: MarketItem) => {
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
          note: value(item, 'note'),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      showToast(`Saved: ${item.name}`, 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const downloadCsv = () => {
    const header = ['Item', 'Unit', 'Approved quantity', 'Awaiting approval', 'Market trip', 'Bought', 'Received', 'Departments', 'Note']
    const lines = items.map(i => [
      i.name, i.unit, i.approved, i.awaiting, i.batch ?? '', i.qtyBought, i.qtyReceived,
      i.departments.map(d => `${d.name} ${d.qty}`).join('; '), i.note,
    ].map(csvCell).join(','))
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `market-list-${(data?.event.name || 'event').replace(/\s+/g, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const canEdit = !!data?.canEdit

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Market List</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data?.event.name || 'Current event'}: what every department needs, added up per item.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()} className="h-11 px-4 text-sm">Print</Button>
            <Button variant="outline" onClick={downloadCsv} className="h-11 px-4 text-sm" disabled={items.length === 0}>Download (Excel)</Button>
            <Button variant="outline" onClick={() => router.push(backHref)} className="h-11 px-4 text-sm">← Back</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden" role="tablist">
          {([['pre_event', 'Needs before the event'], ['during_event', 'Requests during the event']] as const).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={listType === t}
              onClick={() => setListType(t)}
              className={`h-11 px-5 rounded-xl text-sm font-semibold border transition-colors ${listType === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-foreground hover:bg-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="text-base text-muted-foreground animate-pulse">Loading…</p>}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-base text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Department progress: who has sent their list */}
            <Card className="glass-card border-none">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-foreground">
                  Departments: {deptCounts.sent} of {deptCounts.total} have sent a list
                  {deptCounts.waiting > 0 && <span className="text-amber-600 dark:text-amber-400"> · {deptCounts.waiting} waiting for approval</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {data.departments.map(d => {
                    const st = deptStatus(d)
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
                          {d.hod && <p className="text-xs text-muted-foreground truncate">{d.hod}</p>}
                        </div>
                        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${st.className}`}>{st.label}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Consolidated items */}
            <Card className="glass-card border-none">
              <CardHeader className="space-y-3">
                <CardTitle className="text-lg font-bold text-foreground">Items to buy ({items.length})</CardTitle>
                <div className="flex flex-wrap gap-2 print:hidden">
                  {(['all', 1, 2, 'none'] as BatchFilter[]).map(b => (
                    <button
                      key={String(b)}
                      onClick={() => setBatchFilter(b)}
                      className={`h-10 px-4 rounded-lg text-sm border ${batchFilter === b ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground hover:bg-muted'}`}
                    >
                      {b === 'all' ? 'All items' : b === 'none' ? 'No trip yet' : `Market trip ${b}`}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  &quot;Approved&quot; counts only lists approved by the Gen Sec or National Coordinator. &quot;Waiting&quot; is still to be approved.
                </p>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-base text-muted-foreground">No items yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border">
                          <th className="py-3 pr-3 font-semibold">Item</th>
                          <th className="py-3 pr-3 font-semibold text-right">Approved</th>
                          <th className="py-3 pr-3 font-semibold text-right">Waiting</th>
                          <th className="py-3 pr-3 font-semibold">Market trip</th>
                          <th className="py-3 pr-3 font-semibold">Bought</th>
                          <th className="py-3 pr-3 font-semibold">Received</th>
                          {canEdit && <th className="py-3 font-semibold print:hidden"><span className="sr-only">Save</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(item => {
                          const dirty = !!drafts[item.key]
                          const received = Number(value(item, 'qtyReceived')) || 0
                          const short = item.approved > 0 && received < item.approved
                          return (
                            <React.Fragment key={item.key}>
                              <tr className="border-b border-border/60 align-middle">
                                <td className="py-3 pr-3">
                                  <button
                                    onClick={() => setOpenKey(openKey === item.key ? null : item.key)}
                                    className="text-left font-semibold text-foreground hover:underline"
                                    aria-expanded={openKey === item.key}
                                  >
                                    {item.name}
                                  </button>
                                  <span className="block text-xs text-muted-foreground">
                                    {item.unit} · {item.departments.length} dept{item.departments.length === 1 ? '' : 's'}
                                  </span>
                                </td>
                                <td className="py-3 pr-3 text-right font-mono text-base font-bold">{item.approved}</td>
                                <td className="py-3 pr-3 text-right font-mono text-muted-foreground">{item.awaiting || '–'}</td>
                                <td className="py-3 pr-3">
                                  {canEdit ? (
                                    <select
                                      aria-label={`Market trip for ${item.name}`}
                                      value={value(item, 'batch') ?? ''}
                                      onChange={e => setDraft(item.key, { batch: e.target.value ? Number(e.target.value) : null })}
                                      className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
                                    >
                                      <option value="">Not set</option>
                                      <option value="1">Trip 1</option>
                                      <option value="2">Trip 2</option>
                                      <option value="3">Trip 3</option>
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
                                      className="h-10 w-24 rounded-lg border border-border bg-background px-2 text-sm font-mono"
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
                                      className="h-10 w-24 rounded-lg border border-border bg-background px-2 text-sm font-mono"
                                    />
                                  ) : <span className="font-mono">{item.qtyReceived}</span>}
                                  {short && received > 0 && (
                                    <span className="block text-xs text-amber-600 dark:text-amber-400">{item.approved - received} short</span>
                                  )}
                                </td>
                                {canEdit && (
                                  <td className="py-3 print:hidden">
                                    <Button
                                      onClick={() => save(item)}
                                      disabled={!dirty || savingKey === item.key}
                                      className="h-10 px-4 text-sm"
                                    >
                                      {savingKey === item.key ? 'Saving…' : 'Save'}
                                    </Button>
                                  </td>
                                )}
                              </tr>
                              {openKey === item.key && (
                                <tr className="border-b border-border/60 bg-muted/30">
                                  <td colSpan={canEdit ? 7 : 6} className="py-3 px-3">
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">Approved per department</p>
                                    <div className="flex flex-wrap gap-2">
                                      {item.departments.length === 0
                                        ? <span className="text-sm text-muted-foreground">None approved yet.</span>
                                        : item.departments.map(d => (
                                          <span key={d.id} className="text-sm rounded-lg border border-border bg-background px-3 py-1">
                                            {d.name}: <strong className="font-mono">{d.qty}</strong>
                                          </span>
                                        ))}
                                    </div>
                                    {canEdit && (
                                      <input
                                        aria-label={`Note for ${item.name}`}
                                        placeholder="Note (e.g. bought at Balogun, brand, shortfall reason)"
                                        value={value(item, 'note') || ''}
                                        onChange={e => setDraft(item.key, { note: e.target.value })}
                                        className="mt-3 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                                      />
                                    )}
                                    {!canEdit && item.note && <p className="mt-2 text-sm text-muted-foreground">Note: {item.note}</p>}
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
