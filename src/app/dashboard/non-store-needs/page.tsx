'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Wrench, Building2, Armchair, CheckCircle2, Clock, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ModernSelect } from '@/components/ui/modern-select'
import { showToast } from '@/components/ui/toast'
import {
  NON_STORE_ASSIGNEE_OPTIONS,
  NON_STORE_STATUS_OPTIONS,
  type NeedType,
  type NonStoreStatus,
} from '@/lib/needs/need-types'
import type { NonStoreItemRow } from '@/app/api/needs/non-store/route'

type TypeFilter = 'all' | Exclude<NeedType, 'store_supply'>
type StatusFilter = 'all' | NonStoreStatus

export default function NonStoreNeedsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [eventName, setEventName] = useState('Current Event')
  const [items, setItems] = useState<NonStoreItemRow[]>([])
  const [canManage, setCanManage] = useState(false)

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, { nonStoreStatus: NonStoreStatus; assignedTo: string; actionNote: string }>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/needs/non-store', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load non-store needs')
      const data = await res.json()
      setEventName(data?.event?.name || 'Current Event')
      setItems(data?.items || [])
      setCanManage(Boolean(data?.canManage))
    } catch (e: any) {
      showToast(e?.message || 'Failed to load non-store needs', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const rowKey = (r: NonStoreItemRow) => `${r.requestId}:${r.itemIndex}`

  const getVal = (r: NonStoreItemRow) => {
    const k = rowKey(r)
    return (
      drafts[k] || {
        nonStoreStatus: r.nonStoreStatus,
        assignedTo: r.assignedTo,
        actionNote: r.actionNote,
      }
    )
  }

  const updateDraft = (r: NonStoreItemRow, patch: Partial<{ nonStoreStatus: NonStoreStatus; assignedTo: string; actionNote: string }>) => {
    const k = rowKey(r)
    const cur = getVal(r)
    setDrafts((prev) => ({ ...prev, [k]: { ...cur, ...patch } }))
  }

  const saveRow = async (r: NonStoreItemRow) => {
    const k = rowKey(r)
    const val = getVal(r)
    setSavingKey(k)
    try {
      const res = await fetch('/api/needs/non-store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: r.requestId,
          itemIndex: r.itemIndex,
          nonStoreStatus: val.nonStoreStatus,
          assignedTo: val.assignedTo,
          actionNote: val.actionNote,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Update failed')
      }
      setItems((prev) =>
        prev.map((it) =>
          rowKey(it) === k
            ? {
                ...it,
                nonStoreStatus: val.nonStoreStatus,
                assignedTo: val.assignedTo,
                actionNote: val.actionNote,
              }
            : it
        )
      )
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[k]
        return next
      })
      showToast(`Updated "${r.name}"`, 'success')
    } catch (e: any) {
      showToast(e?.message || 'Failed to save changes', 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return items.filter((it) => {
      if (typeFilter !== 'all' && it.needType !== typeFilter) return false
      if (statusFilter !== 'all' && it.nonStoreStatus !== statusFilter) return false
      if (
        q &&
        !it.name.toLowerCase().includes(q) &&
        !it.departmentName.toLowerCase().includes(q) &&
        !it.assignedTo.toLowerCase().includes(q)
      ) {
        return false
      }
      return true
    })
  }, [items, typeFilter, statusFilter, searchQuery])

  const counts = useMemo(
    () => ({
      total: items.length,
      equipment: items.filter((i) => i.needType === 'equipment_servicing').length,
      furniture: items.filter((i) => i.needType === 'furniture_logistics').length,
      venue: items.filter((i) => i.needType === 'venue_facility').length,
      resolved: items.filter((i) => i.nonStoreStatus === 'resolved').length,
    }),
    [items]
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-2.5 border-b border-border/40 bg-background/50 backdrop-blur-xs print:hidden">
        <button
          onClick={() => router.push('/dashboard/store-requisitions?mode=pre_event')}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Pre-Event Needs Lists
        </button>

        <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
          Non-Store Equipment, Logistics &amp; Facility Tracker
        </span>
      </div>

      <main className="mx-auto max-w-6xl px-4 md:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-widest uppercase text-amber-700 dark:text-amber-400 mb-1">
              {eventName} · Non-Store Action Tracker
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              Equipment, Furniture &amp; Facility Requests
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Departmental requests that are not Store consumables (printers, servicing, tables/chairs, office space &amp; repairs). Excluded from Stores&apos; Market Purchase List.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="h-9 text-xs font-semibold cursor-pointer">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="glass-card border-none p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Total Non-Store</span>
            <span className="text-2xl font-extrabold font-mono text-foreground mt-1 block">{counts.total}</span>
          </Card>
          <Card className="glass-card border-none p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <Wrench className="h-3 w-3" /> Equipment / ICT
            </span>
            <span className="text-2xl font-extrabold font-mono text-blue-600 dark:text-blue-400 mt-1 block">{counts.equipment}</span>
          </Card>
          <Card className="glass-card border-none p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <Armchair className="h-3 w-3" /> Furniture
            </span>
            <span className="text-2xl font-extrabold font-mono text-purple-600 dark:text-purple-400 mt-1 block">{counts.furniture}</span>
          </Card>
          <Card className="glass-card border-none p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Venue / Facility
            </span>
            <span className="text-2xl font-extrabold font-mono text-amber-700 dark:text-amber-400 mt-1 block">{counts.venue}</span>
          </Card>
          <Card className="glass-card border-none p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Resolved
            </span>
            <span className="text-2xl font-extrabold font-mono text-emerald-700 dark:text-emerald-400 mt-1 block">{counts.resolved}</span>
          </Card>
        </div>

        {/* Filters */}
        <Card className="glass-card border-none print:hidden">
          <CardContent className="pt-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {([
                ['all', 'All Categories'],
                ['equipment_servicing', 'Equipment / ICT'],
                ['furniture_logistics', 'Furniture / Logistics'],
                ['venue_facility', 'Venue / Facility'],
              ] as [TypeFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    typeFilter === key
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ModernSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold"
              >
                <option value="all">All Action Statuses</option>
                {NON_STORE_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </ModernSelect>

              <div className="relative">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                <Input
                  placeholder="Search item, dept, assignee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 w-56 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card className="glass-card border-none">
          <CardHeader>
            <CardTitle className="text-base font-bold text-foreground">
              Non-Store Requests ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-10 text-center text-xs text-muted-foreground">Loading non-store requests…</p>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center space-y-1.5">
                <p className="text-sm font-semibold text-muted-foreground">No non-store requests found.</p>
                <p className="text-xs text-muted-foreground">
                  When HODs submit Equipment, Furniture, or Venue/Facility items on their Pre-Event Needs List, they route here automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => {
                  const k = rowKey(r)
                  const val = getVal(r)
                  const dirty = Boolean(drafts[k])
                  return (
                    <div key={k} className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-foreground">{r.name}</span>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                              {r.needTypeLabel}
                            </span>
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {r.requestStatus === 'pending_coordinator' ? 'Awaiting NEC Approval' : 'NEC Approved'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Department: <strong className="text-foreground">{r.departmentName}</strong> · Qty:{' '}
                            <strong className="font-mono text-foreground">{r.approvedQuantity} {r.unit}</strong>
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] font-bold">
                          {val.nonStoreStatus === 'resolved' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Resolved
                            </span>
                          ) : val.nonStoreStatus === 'in_progress' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400">
                              <Clock className="h-3 w-3" /> In Progress
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                              <Clock className="h-3 w-3" /> Pending Action
                            </span>
                          )}
                        </div>
                      </div>

                      {canManage ? (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-2 border-t border-border/60">
                          <div className="md:col-span-3">
                            <ModernSelect
                              aria-label={`Assign ${r.name}`}
                              value={val.assignedTo}
                              onChange={(e) => updateDraft(r, { assignedTo: e.target.value })}
                              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold"
                            >
                              {NON_STORE_ASSIGNEE_OPTIONS.map((a) => (
                                <option key={a} value={a}>{a}</option>
                              ))}
                            </ModernSelect>
                          </div>
                          <div className="md:col-span-3">
                            <ModernSelect
                              aria-label={`Status for ${r.name}`}
                              value={val.nonStoreStatus}
                              onChange={(e) => updateDraft(r, { nonStoreStatus: e.target.value as NonStoreStatus })}
                              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold"
                            >
                              {NON_STORE_STATUS_OPTIONS.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </ModernSelect>
                          </div>
                          <div className="md:col-span-4">
                            <Input
                              placeholder="Action note (e.g. Photocopier sent for servicing)..."
                              value={val.actionNote}
                              onChange={(e) => updateDraft(r, { actionNote: e.target.value })}
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Button
                              size="sm"
                              onClick={() => saveRow(r)}
                              disabled={!dirty || savingKey === k}
                              className="w-full h-9 text-xs font-bold cursor-pointer"
                            >
                              {savingKey === k ? 'Saving…' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground pt-2 border-t border-border/60">
                          Assigned to: <strong className="text-foreground">{r.assignedTo}</strong>
                          {r.actionNote ? ` · Note: ${r.actionNote}` : ''}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
