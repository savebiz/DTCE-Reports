'use client'

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NumberField } from '@/components/ui/number-field'
import { Label } from '@/components/ui/label'
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription'
import { Truck, RefreshCw, ClipboardList, Package, Copy, ArrowRight, Lock, Unlock } from 'lucide-react'
import { getCurrentEvent, getDepartmentAssignment } from '@/lib/events/current-event'
import { evaluateRequisitionWindow } from '@/lib/events/requisition-windows'
import { UnassignedDepartmentGate } from '@/components/unassigned-department-gate'

interface RequestItem {
  inventory_item_id?: string | null
  name: string
  quantity: number
  requested_quantity?: number
  approved_quantity?: number
  category?: string
  unit?: string
  return_status?: string
  returned_quantity?: number
}

interface StoreRequestTicket {
  id: string
  items_json: RequestItem[]
  status: 'pending_coordinator' | 'approved' | 'declined' | 'in_progress' | 'partially_fulfilled' | 'ready_for_collection' | 'delivered'
  reviewer_comments?: string
  reviewed_at?: string
  created_at: string
  request_type?: 'pre_event' | 'during_event'
  assigned_approver?: {
    full_name: string
    email: string
  }
}

const COMMON_UNITS = ['pcs', 'packs', 'cartons', 'reams', 'rolls', 'bottles', 'litres', 'kg', 'bags', 'sets', 'dozens', 'pairs']

function StoreRequestContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [deptName, setDeptName] = useState<string>('')
  const [activeEvent, setActiveEvent] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<StoreRequestTicket[]>([])

  // Active workflow tab: 'pre_event' (Pre-Congress Needs List for Market) vs 'during_event' (Live Store Requisition)
  const [requestType, setRequestType] = useState<'pre_event' | 'during_event'>('pre_event')

  // Shared item builder state
  const [catalogItems, setCatalogItems] = useState<any[]>([])
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('free_text')
  const [items, setItems] = useState<RequestItem[]>([])
  const [itemName, setItemName] = useState('')
  const [itemUnit, setItemUnit] = useState('pcs')
  const [itemCategory, setItemCategory] = useState<'consumable' | 'durable'>('consumable')
  const [itemQty, setItemQty] = useState(1)
  const [copying, setCopying] = useState(false)

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
        department_id: meta.department_id || null
      }
    }

    const currentEvent = await getCurrentEvent(supabase)
    if (currentEvent) {
      setActiveEvent(currentEvent)
      const preW = evaluateRequisitionWindow(currentEvent, 'pre_event')
      const liveW = evaluateRequisitionWindow(currentEvent, 'during_event')
      if (liveW.isOpen && !preW.isOpen) {
        setRequestType('during_event')
      }
    }

    // Resolve department assignment strictly for current event for HODs/Assistants
    if (!isMock && activeProfile?.id && (activeProfile.role === 'hod' || activeProfile.role === 'assistant')) {
      const assignment = await getDepartmentAssignment(supabase, activeProfile.id, currentEvent?.id)
      activeProfile.department_id = assignment?.department_id || null
    }
    setProfile(activeProfile)

    if (activeProfile?.department_id && !isMock) {
      const { data: d } = await supabase
        .from('departments')
        .select('name')
        .eq('id', activeProfile.department_id)
        .maybeSingle()
      if (d?.name) setDeptName(d.name)
    }

    // Fetch inventory catalog items
    const { data: invData } = await supabase
      .from('inventory_items')
      .select('*')
      .order('name', { ascending: true })

    if (invData && invData.length > 0) {
      setCatalogItems(invData)
    } else if (isMock) {
      const { mockInventoryItems } = require('@/utils/supabase/mockData')
      setCatalogItems(mockInventoryItems)
    }

    // Fetch department's requests for the current event
    if (!isMock && activeProfile?.department_id) {
      let reqsQuery = supabase
        .from('store_requests')
        .select(`
          id,
          items_json,
          status,
          reviewer_comments,
          reviewed_at,
          created_at,
          request_type,
          assigned_approver_id
        `)
        .eq('department_id', activeProfile.department_id)
      if (currentEvent?.id) reqsQuery = reqsQuery.eq('event_id', currentEvent.id)
      const { data: reqsData } = await reqsQuery.order('created_at', { ascending: false })

      if (reqsData) {
        const enhancedReqs = await Promise.all(
          reqsData.map(async (r: any) => {
            if (r.assigned_approver_id) {
              const { data: appData } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', r.assigned_approver_id)
                .maybeSingle()
              if (appData) {
                return { ...r, assigned_approver: appData }
              }
            }
            return r
          })
        )
        setRequests(enhancedReqs)
      }
    } else if (isMock) {
      setRequests([
        {
          id: 'req-mock-1',
          request_type: 'pre_event',
          items_json: [{ name: 'Analgesics (Paracetamol)', quantity: 200, requested_quantity: 200, approved_quantity: 200, category: 'consumable', unit: 'packs' }],
          status: 'approved',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          reviewer_comments: 'Approved for Congress market purchase.'
        }
      ])
    }
  }, [router])

  useRealtimeSubscription({
    channelName: `hod-store-request-${profile?.department_id || profile?.id}`,
    subscriptions: [
      {
        table: 'store_requests',
        filter: profile?.department_id ? `department_id=eq.${profile.department_id}` : undefined,
      },
    ],
    onDataChange: () => loadData(),
    enabled: !!profile?.id,
  })

  useEffect(() => {
    loadData()
  }, [loadData])

  // Separate requests by workflow stage so they never clash
  const preEventLists = useMemo(
    () => requests.filter(r => r.request_type === 'pre_event'),
    [requests]
  )
  const duringEventRequisitions = useMemo(
    () => requests.filter(r => (r.request_type || 'during_event') === 'during_event'),
    [requests]
  )

  const approvedPreEventItems = useMemo(() => {
    const map: Record<string, RequestItem> = {}
    for (const req of preEventLists) {
      if (req.status === 'declined') continue
      for (const it of req.items_json || []) {
        const key = (it.name || '').trim().toLowerCase()
        if (!key) continue
        const qty = Number(it.approved_quantity ?? it.requested_quantity ?? it.quantity) || 1
        const matchedCat = catalogItems.find(
          c => (it.inventory_item_id && c.id === it.inventory_item_id) || String(c.name || '').trim().toLowerCase() === key
        )
        if (!map[key]) {
          map[key] = {
            inventory_item_id: matchedCat?.id || it.inventory_item_id || null,
            name: matchedCat?.name || it.name,
            unit: matchedCat?.unit || it.unit || 'pcs',
            category: matchedCat?.category || it.category || 'consumable',
            quantity: qty,
          }
        } else {
          map[key].quantity += qty
        }
      }
    }
    return Object.values(map)
  }, [preEventLists, catalogItems])

  const handleAddItem = () => {
    if (requestType === 'pre_event') {
      // Pre-Event Needs List: clean market item builder (links to catalog ID silently if name matches)
      const name = itemName.trim()
      if (!name) {
        showToast('Please enter the item name your department needs', 'error')
        return
      }
      const matchedCatalog = catalogItems.find(
        c => String(c.name || '').trim().toLowerCase() === name.toLowerCase()
      )
      const newItem: RequestItem = {
        inventory_item_id: matchedCatalog?.id || null,
        name: matchedCatalog?.name || name,
        category: matchedCatalog?.category || itemCategory,
        unit: matchedCatalog?.unit || itemUnit || 'pcs',
        quantity: Math.max(1, itemQty),
      }
      setItems(prev => [...prev, newItem])
      setItemName('')
      setItemQty(1)
      return
    }

    // During-Event Store Requisition: picks from Store Inventory Catalog or custom fallback
    let newItem: RequestItem
    if (selectedCatalogId && selectedCatalogId !== 'free_text') {
      const catMatch = catalogItems.find(c => c.id === selectedCatalogId)
      if (!catMatch) return
      newItem = {
        inventory_item_id: catMatch.id,
        name: catMatch.name,
        category: catMatch.category,
        unit: catMatch.unit,
        quantity: Math.max(1, itemQty)
      }
    } else {
      const name = itemName.trim()
      if (!name) {
        showToast('Please enter an item name', 'error')
        return
      }
      newItem = {
        inventory_item_id: null,
        name,
        category: itemCategory,
        unit: itemUnit || 'pcs',
        quantity: Math.max(1, itemQty)
      }
    }

    setItems(prev => [...prev, newItem])
    setItemName('')
    setSelectedCatalogId('free_text')
    setItemQty(1)
  }

  // Copy items from the department's earlier event (e.g. Convention) into Pre-Event Needs List
  const handleCopyLastList = async () => {
    if (!profile?.department_id || isMock) return
    setCopying(true)
    try {
      const supabase = getClient()
      const { data } = await supabase
        .from('store_requests')
        .select('items_json, event_id, status, created_at')
        .eq('department_id', profile.department_id)
        .order('created_at', { ascending: false })
        .limit(50)
      const previous = (data || []).find((r: any) => r.status !== 'declined' && r.event_id !== activeEvent?.id)
      if (!previous || !Array.isArray(previous.items_json) || previous.items_json.length === 0) {
        showToast('No earlier event list found for your department.', 'error')
        return
      }
      const copied: RequestItem[] = previous.items_json.map((it: any) => ({
        inventory_item_id: it.inventory_item_id || null,
        name: it.name,
        category: it.category || 'consumable',
        unit: it.unit || 'pcs',
        quantity: Math.max(1, Number(it.requested_quantity ?? it.quantity) || 1),
      }))
      setItems(prev => [...prev, ...copied])
      showToast(`Copied ${copied.length} items from your previous event list. Adjust quantities if needed, then send.`, 'success')
    } finally {
      setCopying(false)
    }
  }

  // Seamless Link: Pull items from the department's Approved Pre-Event Needs List into a Live Store Requisition
  const handleLoadFromPreEventList = (sourceItems?: RequestItem[]) => {
    const listToLoad = sourceItems && sourceItems.length > 0 ? sourceItems : approvedPreEventItems
    if (listToLoad.length === 0) {
      showToast('No pre-event needs list items found for your department yet.', 'error')
      return
    }
    const mapped: RequestItem[] = []
    let unstockedCount = 0
    listToLoad.forEach(it => {
      const key = String(it.name || '').trim().toLowerCase()
      const matchedCat = catalogItems.find(
        c => (it.inventory_item_id && c.id === it.inventory_item_id) || String(c.name || '').trim().toLowerCase() === key
      )
      if (!matchedCat) {
        unstockedCount += 1
        return
      }
      mapped.push({
        inventory_item_id: matchedCat.id,
        name: matchedCat.name,
        unit: matchedCat.unit || it.unit || 'pcs',
        category: matchedCat.category || it.category || 'consumable',
        quantity: Math.max(1, Number(it.approved_quantity ?? it.requested_quantity ?? it.quantity) || 1),
      })
    })
    setRequestType('during_event')
    if (mapped.length === 0) {
      showToast('None of the items on your Pre-Event Needs List are stocked in Central Stores inventory yet.', 'warning')
      return
    }
    setItems(mapped)
    if (unstockedCount > 0) {
      showToast(`Loaded ${mapped.length} stocked item(s). ${unstockedCount} item(s) are not yet stocked by Stores and were skipped.`, 'warning')
    } else {
      showToast(`Loaded ${mapped.length} item(s) from your Pre-Event Needs List for Store collection!`, 'success')
    }
  }

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleChangeQty = (index: number, qty: number) => {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, quantity: Math.max(1, qty || 1) } : it)))
  }

  const handleSubmitRequest = async () => {
    const windowState = evaluateRequisitionWindow(activeEvent, requestType)
    if (!windowState.isOpen) {
      showToast(windowState.message, 'error')
      return
    }

    if (items.length === 0) {
      showToast(
        requestType === 'pre_event'
          ? 'Please add at least one item to your Pre-Event Needs List'
          : 'Please add at least one item to your Store Requisition',
        'error'
      )
      return
    }

    if (!profile?.department_id) {
      showToast('Department profile missing. Please log in again.', 'error')
      return
    }

    setLoading(true)

    if (isMock) {
      showToast(
        requestType === 'pre_event'
          ? 'Pre-Event Needs List submitted for market purchase (Mock)!'
          : 'Store Requisition submitted (Mock)!',
        'success'
      )
      setRequests(prev => [
        {
          id: `req-${Date.now()}`,
          request_type: requestType,
          items_json: items,
          status: 'pending_coordinator',
          created_at: new Date().toISOString()
        },
        ...prev
      ])
      setItems([])
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/inventory/submit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: profile.department_id,
          requestType,
          items
        })
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to submit request')
      }

      showToast(
        requestType === 'pre_event'
          ? 'Pre-Event Needs List sent! The General Secretary & National Coordinator will review and approve it for market purchase.'
          : 'Live Store Requisition sent for approval and Stores collection!',
        'success'
      )
      setItems([])
      loadData()
    } catch (err: any) {
      showToast(`Submission failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const preEventWindow = evaluateRequisitionWindow(activeEvent, 'pre_event')
  const liveWindow = evaluateRequisitionWindow(activeEvent, 'during_event')
  const activeWindow = requestType === 'pre_event' ? preEventWindow : liveWindow

  if (!isMock && profile && !profile.department_id && (profile.role === 'hod' || profile.role === 'assistant')) {
    return <UnassignedDepartmentGate />
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-500">
                {deptName || 'Department'} · Materials &amp; Store Portal
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {requestType === 'pre_event'
                ? 'Pre-Event Departmental Needs List (For Market Purchase)'
                : 'Live Event Store Requisitions (From Stores Stock)'}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {requestType === 'pre_event'
                ? `${activeEvent?.name || 'Upcoming Event'}: Submit the list of items your department needs bought at the market before the event begins.`
                : `${activeEvent?.name || 'Current Event'}: Request items directly from Central Stores warehouse after items have been purchased and stocked.`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/my-department')}
            className="text-xs h-9 cursor-pointer w-fit"
          >
            ← Back to Department Home
          </Button>
        </div>

        {/* Two Distinct Workflow Stage Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="tablist" aria-label="Select process stage">
          <button
            role="tab"
            aria-selected={requestType === 'pre_event'}
            onClick={() => { setRequestType('pre_event'); setItems([]) }}
            className={`text-left rounded-2xl border-2 p-4 transition-all cursor-pointer ${
              requestType === 'pre_event'
                ? 'border-emerald-500 bg-emerald-500/10 shadow-xs'
                : 'border-border bg-card hover:bg-muted/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-base font-extrabold text-foreground">
                <ClipboardList className={`w-5 h-5 ${requestType === 'pre_event' ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                1. Pre-Event Needs List (Market Purchase)
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${preEventWindow.isOpen ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'}`}>
                  {preEventWindow.isOpen ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {preEventWindow.isOpen ? 'Open' : 'Locked'}
                </span>
                <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  {preEventLists.length} Sent
                </span>
              </div>
            </div>
            <span className="block text-xs text-muted-foreground mt-1.5 leading-relaxed">
              <strong>Before the event:</strong> Send your department&apos;s full list of required items to the Gen Sec &amp; National Coordinator so Stores can go to the market and buy them.
            </span>
          </button>

          <button
            role="tab"
            aria-selected={requestType === 'during_event'}
            onClick={() => { setRequestType('during_event'); setItems([]) }}
            className={`text-left rounded-2xl border-2 p-4 transition-all cursor-pointer ${
              requestType === 'during_event'
                ? 'border-blue-500 bg-blue-500/10 shadow-xs'
                : 'border-border bg-card hover:bg-muted/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-base font-extrabold text-foreground">
                <Package className={`w-5 h-5 ${requestType === 'during_event' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                2. Live Event Store Requisition (From Store)
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${liveWindow.isOpen ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-slate-500/15 text-muted-foreground border border-border'}`}>
                  {liveWindow.isOpen ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {liveWindow.isOpen ? 'Open' : 'Locked'}
                </span>
                <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/30">
                  {duringEventRequisitions.length} Sent
                </span>
              </div>
            </div>
            <span className="block text-xs text-muted-foreground mt-1.5 leading-relaxed">
              <strong>During the event:</strong> Request items directly from Central Stores warehouse once Stores has returned from the market and stocked the shelves.
            </span>
          </button>
        </div>

        {/* STAGE 1: PRE-EVENT NEEDS LIST (MARKET PURCHASE) */}
        {requestType === 'pre_event' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Build Pre-Event Needs List */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="glass-card border-emerald-500/30">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-emerald-500" />
                    Build Pre-Event Needs List
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    List every item your department needs bought at the market for {activeEvent?.name || 'Congress'}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!preEventWindow.isOpen && (
                    <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
                      <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Pre-Event Needs List Locked</span>
                        <span>{preEventWindow.message}</span>
                      </div>
                    </div>
                  )}
                  <fieldset disabled={!preEventWindow.isOpen} className="space-y-4 disabled:opacity-50 disabled:pointer-events-none">
                  <Button
                    onClick={handleCopyLastList}
                    disabled={copying}
                    variant="outline"
                    className="w-full h-11 text-xs font-bold border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copying ? 'Copying previous list…' : 'Copy My Department List from Last Convention'}
                  </Button>

                  <div className="space-y-2">
                    <Label htmlFor="pre-item-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Item Name / Description
                    </Label>
                    <Input
                      id="pre-item-name"
                      list="common-market-items"
                      value={itemName}
                      onChange={(e) => {
                        const val = e.target.value
                        setItemName(val)
                        const match = catalogItems.find(c => String(c.name || '').toLowerCase() === val.trim().toLowerCase())
                        if (match) {
                          if (match.unit) setItemUnit(match.unit)
                          if (match.category === 'durable' || match.category === 'consumable') setItemCategory(match.category)
                        }
                      }}
                      placeholder="e.g. A4 Paper, Whiteboard Markers, Tissue Packs..."
                      className="input-dark text-foreground h-10 text-sm"
                    />
                    <datalist id="common-market-items">
                      {catalogItems.map((cat: any) => (
                        <option key={cat.id} value={cat.name} />
                      ))}
                    </datalist>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="pre-item-unit" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        Unit
                      </Label>
                      <select
                        id="pre-item-unit"
                        value={itemUnit}
                        onChange={e => setItemUnit(e.target.value)}
                        className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                      >
                        {COMMON_UNITS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pre-item-cat" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        Item Type
                      </Label>
                      <select
                        id="pre-item-cat"
                        value={itemCategory}
                        onChange={e => setItemCategory(e.target.value as 'consumable' | 'durable')}
                        className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                      >
                        <option value="consumable">Consumable (Used up)</option>
                        <option value="durable">Durable / Equipment</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pre-item-qty" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Quantity Needed for Event
                    </Label>
                    <NumberField
                      id="pre-item-qty"
                      value={itemQty}
                      onChange={setItemQty}
                      min={1}
                      className="input-dark text-foreground font-mono"
                    />
                  </div>

                  <Button onClick={handleAddItem} className="w-full h-11 text-xs font-bold cursor-pointer" variant="outline">
                    + Add Item to Needs List
                  </Button>

                  {/* Added Pre-Event Items */}
                  {items.length > 0 && (
                    <div className="pt-4 border-t border-border space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">
                          Needs List Draft ({items.length} {items.length === 1 ? 'item' : 'items'})
                        </span>
                        <button
                          onClick={() => setItems([])}
                          className="text-[11px] text-muted-foreground hover:text-red-400 cursor-pointer"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {items.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 bg-background/50 border border-border p-2.5 rounded-xl text-xs">
                            <div className="min-w-0">
                              <span className="font-bold text-foreground block truncate">{it.name}</span>
                              <span className="text-[10px] text-muted-foreground uppercase">
                                {it.unit || 'pcs'} · {it.category === 'durable' ? 'Durable Equipment' : 'Consumable'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <input
                                type="number"
                                min={1}
                                inputMode="numeric"
                                aria-label={`Quantity of ${it.name}`}
                                value={it.quantity}
                                onChange={(e) => handleChangeQty(idx, Number(e.target.value))}
                                className="w-16 h-9 rounded-lg border border-border bg-background px-2 text-xs font-mono text-foreground text-center"
                              />
                              <button
                                onClick={() => handleRemoveItem(idx)}
                                aria-label={`Remove ${it.name}`}
                                className="w-8 h-9 rounded-lg text-red-500 hover:bg-red-500/10 font-bold text-base cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={handleSubmitRequest}
                        disabled={loading || !preEventWindow.isOpen}
                        className="w-full mt-3 h-12 text-sm font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                      >
                        {loading ? 'Sending Needs List…' : `📤 Submit Pre-Event Needs List (${items.length} Items)`}
                      </Button>
                    </div>
                  )}
                  </fieldset>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Submitted Pre-Event Needs Lists */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="glass-card border-none">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">
                      Submitted Pre-Event Needs Lists ({preEventLists.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Lists sent to the General Secretary &amp; National Coordinator for market purchase before the event.
                    </CardDescription>
                  </div>
                  {approvedPreEventItems.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLoadFromPreEventList()}
                      className="text-xs h-9 font-bold border-blue-500/40 text-blue-400 hover:bg-blue-500/10 cursor-pointer flex items-center gap-1.5"
                    >
                      Request Approved Items from Store <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {preEventLists.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border border-dashed border-border space-y-2">
                      <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto opacity-60" />
                      <p className="text-sm font-semibold text-foreground">No Pre-Event Needs List submitted yet for {activeEvent?.name || 'this event'}.</p>
                      <p className="text-xs text-muted-foreground">
                        Use the form on the left (or copy your previous Convention list) to send your department&apos;s needs list for market procurement.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {preEventLists.map((req) => (
                        <div key={req.id} className="border border-emerald-500/25 rounded-xl p-4 space-y-3 bg-background/25">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-foreground">
                                  Pre-Event Market Needs List
                                </span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Market Purchase
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground block mt-0.5">
                                Submitted on {new Date(req.created_at).toLocaleDateString()} · #{req.id.substring(0, 8)}
                              </span>
                            </div>
                            <span
                              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0"
                              style={
                                req.status === 'pending_coordinator'
                                  ? { background: 'rgba(245,158,11,0.12)', color: '#D97706', border: '1px solid rgba(245,158,11,0.3)' }
                                  : req.status === 'declined'
                                  ? { background: 'rgba(239,68,68,0.12)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.3)' }
                                  : { background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)' }
                              }
                            >
                              {req.status === 'pending_coordinator'
                                ? 'Awaiting Gen Sec / Nat. Coordinator Approval'
                                : req.status === 'declined'
                                ? 'Declined'
                                : '✓ Approved for Market Purchase'}
                            </span>
                          </div>

                          <div className="p-3 bg-background/40 border border-border rounded-lg space-y-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                              Items on Needs List ({Array.isArray(req.items_json) ? req.items_json.length : 0}):
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              {Array.isArray(req.items_json) && req.items_json.map((it: any, itIdx: number) => {
                                const reqQty = it.requested_quantity ?? it.quantity
                                const appQty = it.approved_quantity ?? it.quantity
                                const isAdjusted = req.status !== 'pending_coordinator' && reqQty !== undefined && appQty !== undefined && reqQty !== appQty

  return (
                                  <div key={itIdx} className="flex justify-between items-center p-2 rounded-lg bg-background/60 border border-border/50">
                                    <div>
                                      <span className="text-foreground font-semibold block">{it.name}</span>
                                      <span className="text-[10px] text-muted-foreground uppercase">{it.unit || 'pcs'} · {it.category || 'consumable'}</span>
                                    </div>
                                    <div className="font-mono text-xs shrink-0">
                                      {isAdjusted ? (
                                        <span>
                                          <span className="line-through text-muted-foreground mr-1">{reqQty}</span>
                                          <span className="font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                            Approved: {appQty}
                                          </span>
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
                            <div className="rounded-lg p-3 text-[11px] space-y-1 bg-amber-500/5 border border-amber-500/15 text-amber-600 dark:text-amber-400">
                              <span className="font-bold uppercase tracking-wider block">Approval Remarks:</span>
                              <p className="leading-relaxed">{req.reviewer_comments}</p>
                            </div>
                          )}

                          {req.status !== 'pending_coordinator' && req.status !== 'declined' && (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] text-emerald-500 font-medium">
                                ✓ Consolidated into Stores Market List for purchase.
                              </span>
                              <button
                                onClick={() => handleLoadFromPreEventList(req.items_json)}
                                className="text-xs font-bold text-blue-500 hover:text-blue-400 underline cursor-pointer"
                              >
                                Request these items from Store during event →
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          /* STAGE 2: LIVE EVENT STORE REQUISITION (FROM STORES STOCK) */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Request from Store Stock */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="glass-card border-blue-500/30">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-500" />
                    Request Items from Store
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Request items from Central Stores warehouse during the event for collection.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!liveWindow.isOpen && (
                    <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
                      <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Live Event Store Requisition Locked</span>
                        <span>{liveWindow.message}</span>
                      </div>
                    </div>
                  )}
                  <fieldset disabled={!liveWindow.isOpen} className="space-y-4 disabled:opacity-50 disabled:pointer-events-none">
                  {/* Seamless Link from Approved Pre-Event Needs List */}
                  {approvedPreEventItems.length > 0 && (
                    <Button
                      onClick={() => handleLoadFromPreEventList()}
                      variant="outline"
                      className="w-full h-11 text-xs font-bold border-blue-500/40 text-blue-400 hover:bg-blue-500/10 cursor-pointer flex items-center justify-center gap-2"
                    >
                      📥 Load Items from My Approved Pre-Event Needs List ({approvedPreEventItems.length})
                    </Button>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Select Item from Store Stock
                    </Label>
                    <Select
                      value={selectedCatalogId}
                      onValueChange={(val: any) => {
                        const nextVal = val || 'free_text'
                        setSelectedCatalogId(nextVal)
                        if (nextVal !== 'free_text') {
                          const match = catalogItems.find(c => c.id === nextVal)
                          if (match) {
                            setItemName(match.name)
                            if (match.unit) setItemUnit(match.unit)
                          }
                        } else {
                          setItemName('')
                        }
                      }}
                    >
                      <SelectTrigger className="w-full text-xs input-dark">
                        <SelectValue placeholder="Choose from Store Inventory">
                          {(() => {
                            const match = catalogItems.find(c => c.id === selectedCatalogId)
                            if (!match) return null
                            const canSeeStockQty = ['super_admin', 'coordinator', 'national_coordinator'].includes(profile?.role || '') || deptName.toLowerCase().includes('store')
                            return canSeeStockQty
                              ? `${match.name} (${match.current_stock} ${match.unit || 'pcs'} in stock)`
                              : match.unit ? `${match.name} (${match.unit})` : match.name
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {catalogItems.map((cat: any) => {
                          const canSeeStockQty = ['super_admin', 'coordinator', 'national_coordinator'].includes(profile?.role || '') || deptName.toLowerCase().includes('store')
                          const label = canSeeStockQty
                            ? `${cat.name} (${cat.current_stock} ${cat.unit || 'pcs'} in stock)`
                            : cat.unit ? `${cat.name} (${cat.unit})` : cat.name

  return (
                            <SelectItem key={cat.id} value={cat.id} className="cursor-pointer">
                              {label}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedCatalogId === 'free_text' ? (
                    <div className="space-y-2">
                      <Label htmlFor="item-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        Item Name
                      </Label>
                      <Input
                        id="item-name"
                        value={itemName}
                        onChange={(e) => setItemName(e.target.value)}
                        placeholder="Enter item name..."
                        className="input-dark text-foreground"
                      />
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-0.5">
                      <span className="text-emerald-400 font-bold block">✓ Available in Store Catalog</span>
                      <p className="text-[10px] text-muted-foreground">
                        Fulfilled from Central Stores stock upon approval.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="item-qty" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Quantity to Collect
                    </Label>
                    <NumberField
                      id="item-qty"
                      value={itemQty}
                      onChange={setItemQty}
                      min={1}
                      className="input-dark text-foreground font-mono"
                    />
                  </div>

                  <Button onClick={handleAddItem} className="w-full h-11 text-xs font-bold cursor-pointer" variant="outline">
                    + Add Item to Store Request
                  </Button>

                  {items.length > 0 && (
                    <div className="pt-4 border-t border-border space-y-2">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">
                        Store Request Items ({items.length}):
                      </span>
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {items.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 bg-background/40 border border-border p-2.5 rounded-xl text-xs text-foreground">
                            <span className="font-semibold truncate">{it.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <input
                                type="number"
                                min={1}
                                inputMode="numeric"
                                aria-label={`Quantity of ${it.name}`}
                                value={it.quantity}
                                onChange={(e) => handleChangeQty(idx, Number(e.target.value))}
                                className="w-16 h-9 rounded-lg border border-border bg-background px-2 text-xs font-mono text-foreground text-center"
                              />
                              <span className="text-muted-foreground text-[11px]">{it.unit || 'pcs'}</span>
                              <button
                                onClick={() => handleRemoveItem(idx)}
                                aria-label={`Remove ${it.name}`}
                                className="w-8 h-9 rounded-lg text-red-500 hover:bg-red-500/10 font-bold text-base cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={handleSubmitRequest}
                        disabled={loading || !liveWindow.isOpen}
                        className="w-full mt-3 h-12 text-sm font-extrabold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-xs"
                      >
                        {loading ? 'Sending Request…' : `📦 Send Store Requisition (${items.length} Items)`}
                      </Button>
                    </div>
                  )}
                  </fieldset>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Live Event Store Requisitions History */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="glass-card border-none">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-foreground">
                    Live Event Store Requisitions ({duringEventRequisitions.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Track approval, preparation, collection at Central Stores, and durable equipment returns during the event.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {duringEventRequisitions.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border border-dashed border-border space-y-2">
                      <Package className="w-8 h-8 text-muted-foreground mx-auto opacity-60" />
                      <p className="text-sm font-semibold text-foreground">No live store requisitions submitted during the event yet.</p>
                      <p className="text-xs text-muted-foreground">
                        Once Stores has purchased and stocked the items for {activeEvent?.name || 'Congress'}, request your items here for collection.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {duringEventRequisitions.map((req) => (
                        <div key={req.id} className="border border-border rounded-xl p-4 space-y-3 bg-background/25">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <span className="text-sm font-bold text-foreground block">
                                Store Counter Requisition
                              </span>
                              <span className="text-xs font-semibold text-muted-foreground block">
                                Sent on {new Date(req.created_at).toLocaleDateString()} · #{req.id.substring(0, 8)}
                              </span>
                            </div>
                            <span
                              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                              style={
                                req.status === 'pending_coordinator' ? { background: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' } :
                                req.status === 'approved' ? { background: 'rgba(59,130,246,0.1)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' } :
                                req.status === 'in_progress' ? { background: 'rgba(139,92,246,0.1)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.2)' } :
                                req.status === 'partially_fulfilled' ? { background: 'rgba(236,72,153,0.1)', color: '#DB2777', border: '1px solid rgba(236,72,153,0.2)' } :
                                req.status === 'ready_for_collection' ? { background: 'rgba(245,158,11,0.2)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.4)' } :
                                req.status === 'delivered' ? { background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' } :
                                { background: 'rgba(239,68,68,0.1)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' }
                              }
                            >
                              {req.status === 'pending_coordinator' ? 'Waiting for Approval' :
                               req.status === 'partially_fulfilled' ? 'Partially Fulfilled' :
                               req.status === 'in_progress' ? 'In Progress at Stores' :
                               req.status === 'ready_for_collection' ? 'Ready for Collection' :
                               req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                            </span>
                          </div>

                          <div className="p-3 bg-background/40 border border-border rounded-lg space-y-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Requisition Items:</span>
                            <div className="space-y-1.5 text-xs">
                              {Array.isArray(req.items_json) && req.items_json.map((it: any, itIdx: number) => {
                                const reqQty = it.requested_quantity ?? it.quantity
                                const appQty = it.approved_quantity ?? it.quantity
                                const isAdjusted = reqQty !== undefined && appQty !== undefined && reqQty !== appQty

                                const isDurable = it.category === 'durable' || (it.return_status && it.return_status !== 'not_applicable')
                                const isOutstanding = it.return_status === 'outstanding' || (!it.return_status && isDurable && req.status === 'delivered')
                                const isInitiated = it.return_status === 'return_initiated'

  return (
                                  <div key={itIdx} className="flex flex-col gap-1.5 p-2 rounded-lg bg-background/60 border border-border/50">
                                    <div className="flex justify-between items-center">
                                      <span className="text-foreground font-semibold">{it.name}</span>
                                      <div className="flex items-center gap-2">
                                        {isAdjusted ? (
                                          <span className="font-mono text-xs">
                                            <span className="line-through text-muted-foreground mr-1">Req: {reqQty}</span>
                                            <span className="font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Approved: {appQty}</span>
                                          </span>
                                        ) : (
                                          <span className="font-mono font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                                            × {appQty || reqQty}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {isDurable && req.status === 'delivered' && (
                                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/40 mt-1">
                                        <span className="text-muted-foreground">Durable Return Status:</span>
                                        {isInitiated ? (
                                          <span className="font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 flex items-center gap-1">
                                            <Truck className="w-3 h-3" /> Return Initiated
                                          </span>
                                        ) : isOutstanding ? (
                                          <button
                                            onClick={async () => {
                                              try {
                                                const res = await fetch('/api/inventory/initiate-return', {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ requestId: req.id, itemIndex: itIdx })
                                                })
                                                if (res.ok) {
                                                  showToast('Return initiated! Stores notified.', 'success')
                                                  loadData()
                                                } else {
                                                  const errData = await res.json().catch(() => ({}))
                                                  showToast(errData.error || 'Failed to initiate return.', 'error')
                                                }
                                              } catch (err: any) {
                                                showToast(`Failed: ${err.message}`, 'error')
                                              }
                                            }}
                                            className="font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-0.5 rounded border border-amber-500/30 cursor-pointer transition-colors flex items-center gap-1"
                                          >
                                            <RefreshCw className="w-3 h-3" /> Initiate Return
                                          </button>
                                        ) : (
                                          <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                            ✓ {it.return_status?.replace('_', ' ')}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {req.assigned_approver && (
                            <div className="text-[11px] text-muted-foreground flex gap-1.5 items-center">
                              <span>➡️</span>
                              <span>Delegated to review by: <strong>{req.assigned_approver.full_name || req.assigned_approver.email}</strong></span>
                            </div>
                          )}

                          {req.reviewer_comments && (
                            <div className="rounded-lg p-3 text-[11px] space-y-1 bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400">
                              <span className="font-bold uppercase tracking-wider block">Reviewer Remarks:</span>
                              <p className="leading-relaxed">{req.reviewer_comments}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function StoreRequestPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-muted-foreground">Loading Department Materials &amp; Store Portal...</p>
      </div>
    }>
      <StoreRequestContent />
    </Suspense>
  )
}
