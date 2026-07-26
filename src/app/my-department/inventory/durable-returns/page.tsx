'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NumberField } from '@/components/ui/number-field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { TableSkeleton } from '@/components/ui/skeleton-loader'
import { ArrowLeft, Building2, PackageCheck, AlertTriangle, CheckCircle2, ShieldAlert, Clock, RefreshCw, Send, Layers, Truck, XCircle, AlertCircle } from 'lucide-react'

export interface OutstandingDurableItem {
  requestId: string
  departmentId: string
  departmentName: string
  itemIndex: number
  itemId: string
  itemName: string
  itemCode?: string
  quantityIssued: number
  quantityReturned: number
  outstandingQty: number
  returnStatus: 'outstanding' | 'return_initiated' | 'returned_damaged' | 'lost'
  deliveredAt: string
  conditionNote?: string
}

export default function DurableReturnsTrackerPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const [outstandingItems, setOutstandingItems] = useState<OutstandingDurableItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all')

  // Log Return Modal State
  const [isLogReturnOpen, setIsLogReturnOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<OutstandingDurableItem | null>(null)
  const [returnQty, setReturnQty] = useState(1)
  const [returnCondition, setReturnCondition] = useState<'good' | 'damaged' | 'lost'>('good')
  const [conditionNote, setConditionNote] = useState('')
  const [submittingReturn, setSubmittingReturn] = useState(false)

  // Event Close Modal State
  const [isCloseEventOpen, setIsCloseEventOpen] = useState(false)
  const [closingEvent, setClosingEvent] = useState(false)

  const loadOutstandingItems = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
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

    if (prof) setProfile(prof)

    if (isMock) {
      const { store: mockStore } = require('@/utils/supabase/mockClient')
      const mockReqs = mockStore.storeRequests || []
      const itemsList: OutstandingDurableItem[] = []

      mockReqs.forEach((req: any) => {
        if (['delivered', 'ready_for_collection', 'partially_fulfilled'].includes(req.status)) {
          const deptName = req.department?.name || req.department_name || 'Department'
          const reqItems = req.items_json || []

          reqItems.forEach((it: any, idx: number) => {
            const isDurable = it.category === 'durable' || (!it.category && (it.return_status === 'outstanding' || it.return_status === 'return_initiated'))
            const status = it.return_status || 'outstanding'
            const isUnresolved = ['outstanding', 'return_initiated', 'returned_damaged', 'lost'].includes(status)

            if (isDurable && isUnresolved && status !== 'not_applicable') {
              const issued = Number(it.approved_quantity ?? it.quantity) || 0
              const returned = Number(it.returned_quantity) || 0
              const outstanding = Math.max(0, issued - returned)

              if (outstanding > 0 || status === 'lost' || status === 'returned_damaged') {
                itemsList.push({
                  requestId: req.id,
                  departmentId: req.department_id || 'dept-1',
                  departmentName: deptName,
                  itemIndex: idx,
                  itemId: it.inventory_item_id || it.id || `item-${idx}`,
                  itemName: it.name,
                  itemCode: it.item_code,
                  quantityIssued: issued,
                  quantityReturned: returned,
                  outstandingQty: outstanding,
                  returnStatus: status,
                  deliveredAt: req.reviewed_at || req.updated_at || req.created_at,
                  conditionNote: it.condition_note
                })
              }
            }
          })
        }
      })

      setOutstandingItems(itemsList)
      if (showSpinner) setLoading(false)
      return
    }

    try {
      const { data: storeReqs, error } = await supabase
        .from('store_requests')
        .select('*, department:departments(name)')
        .in('status', ['delivered', 'ready_for_collection', 'partially_fulfilled'])

      if (error) throw error

      const itemsList: OutstandingDurableItem[] = []

      if (storeReqs) {
        storeReqs.forEach((req: any) => {
          const deptName = req.department?.name || 'Department'
          const reqItems = req.items_json || []

          reqItems.forEach((it: any, idx: number) => {
            const isDurable = it.category === 'durable' || (!it.category && (it.return_status === 'outstanding' || it.return_status === 'return_initiated'))
            const status = it.return_status || 'outstanding'
            const isUnresolved = ['outstanding', 'return_initiated', 'returned_damaged', 'lost'].includes(status)

            if (isDurable && isUnresolved && status !== 'not_applicable') {
              const issued = Number(it.approved_quantity ?? it.quantity) || 0
              const returned = Number(it.returned_quantity) || 0
              const outstanding = Math.max(0, issued - returned)

              if (outstanding > 0 || status === 'lost' || status === 'returned_damaged') {
                itemsList.push({
                  requestId: req.id,
                  departmentId: req.department_id,
                  departmentName: deptName,
                  itemIndex: idx,
                  itemId: it.inventory_item_id || it.id,
                  itemName: it.name,
                  itemCode: it.item_code,
                  quantityIssued: issued,
                  quantityReturned: returned,
                  outstandingQty: outstanding,
                  returnStatus: status,
                  deliveredAt: req.reviewed_at || req.updated_at || req.created_at,
                  conditionNote: it.condition_note
                })
              }
            }
          })
        })
      }

      setOutstandingItems(itemsList)
    } catch (err: any) {
      showToast(`Failed to load durable returns: ${err.message}`, 'error')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadOutstandingItems(true)
  }, [loadOutstandingItems])

  // Log Return Submit Handler
  const handleConfirmReturn = async () => {
    if (!selectedItem) return
    setSubmittingReturn(true)

    if (isMock) {
      const { store: mockStore } = require('@/utils/supabase/mockClient')
      const targetReq = mockStore.storeRequests?.find((r: any) => r.id === selectedItem.requestId)

      if (targetReq && targetReq.items_json) {
        const item = targetReq.items_json[selectedItem.itemIndex] || targetReq.items_json.find((i: any) => i.name === selectedItem.itemName)
        if (item) {
          const qty = Number(returnQty) || 1
          const prevRet = Number(item.returned_quantity) || 0
          const newRet = prevRet + qty

          let newStatus = 'returned'
          if (returnCondition === 'lost') {
            newStatus = 'lost'
          } else if (returnCondition === 'damaged') {
            newStatus = 'returned_damaged'
          } else {
            const issued = Number(item.approved_quantity ?? item.quantity) || 0
            newStatus = newRet >= issued ? 'returned' : 'outstanding'
          }

          item.return_status = newStatus
          item.returned_quantity = newRet
          item.condition_note = conditionNote.trim() || `Returned ${returnCondition}`

          // If Good or Damaged, restore stock on mock item
          if (returnCondition !== 'lost') {
            const mockInvItem = mockStore.inventoryItems?.find((i: any) => i.id === selectedItem.itemId || i.name === selectedItem.itemName)
            if (mockInvItem) {
              const newStock = mockInvItem.current_stock + qty
              mockInvItem.current_stock = newStock

              mockStore.inventoryTransactions?.push({
                id: `trans-return-${Date.now()}`,
                inventory_item_id: mockInvItem.id,
                transaction_type: 'return',
                quantity_change: qty,
                performed_by: profile?.id || 'user-admin',
                note: `[RETURN ${returnCondition.toUpperCase()} - ${selectedItem.departmentName}] ${conditionNote || ''}`,
                resulting_stock_level: newStock,
                created_at: new Date().toISOString()
              })
            }
          }
        }
      }

      showToast(`Return logged successfully for "${selectedItem.itemName}" (${returnCondition.toUpperCase()})! (Mock)`, 'success')
      setIsLogReturnOpen(false)
      setSelectedItem(null)
      setConditionNote('')
      setSubmittingReturn(false)
      loadOutstandingItems(false)
      return
    }

    try {
      const res = await fetch('/api/inventory/return-durable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedItem.requestId,
          itemIndex: selectedItem.itemIndex,
          itemId: selectedItem.itemId,
          returnedQuantity: returnQty,
          condition: returnCondition,
          conditionNote: conditionNote.trim()
        })
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      showToast(`Return logged successfully for "${selectedItem.itemName}" (${returnCondition.toUpperCase()})!`, 'success')
      setIsLogReturnOpen(false)
      setSelectedItem(null)
      setConditionNote('')
      loadOutstandingItems(false)
    } catch (err: any) {
      showToast(`Failed to log return: ${err.message}`, 'error')
    } finally {
      setSubmittingReturn(false)
    }
  }

  // Trigger Event Close Reminders
  const handleCloseEventAndRemind = async () => {
    setClosingEvent(true)

    if (isMock) {
      showToast('Event closed! Return reminders sent to all holding departments (Mock)', 'success')
      setIsCloseEventOpen(false)
      setClosingEvent(false)
      return
    }

    try {
      const res = await fetch('/api/events/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: 'event-active-1' })
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      showToast(`Event closed! Sent return reminders to ${data.notifiedDepartmentsCount} holding departments.`, 'success')
      setIsCloseEventOpen(false)
    } catch (err: any) {
      showToast(`Event close trigger failed: ${err.message}`, 'error')
    } finally {
      setClosingEvent(false)
    }
  }

  // Filter & Group Items by Department
  const filteredItems = outstandingItems.filter(item => {
    const matchesSearch =
      item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.itemCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.departmentName.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    if (selectedDeptFilter !== 'all' && item.departmentId !== selectedDeptFilter) return false
    return true
  })

  // Group by department name
  const groupedByDept: Record<string, OutstandingDurableItem[]> = {}
  filteredItems.forEach(item => {
    if (!groupedByDept[item.departmentName]) {
      groupedByDept[item.departmentName] = []
    }
    groupedByDept[item.departmentName].push(item)
  })

  // Unique departments list for dropdown
  const uniqueDepts = Array.from(new Set(outstandingItems.map(i => i.departmentName)))

  // KPIs
  const totalOutstandingQty = outstandingItems.filter(i => i.returnStatus === 'outstanding' || i.returnStatus === 'return_initiated').reduce((sum, i) => sum + i.outstandingQty, 0)
  const totalInitiatedCount = outstandingItems.filter(i => i.returnStatus === 'return_initiated').length
  const totalLostCount = outstandingItems.filter(i => i.returnStatus === 'lost').length
  const totalHoldingDepts = Object.keys(groupedByDept).length

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* 1. Header Navigation Strip */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-border/40 bg-background/50 backdrop-blur-xs">
        <button
          onClick={() => router.push('/my-department/inventory')}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Stores Inventory Console
        </button>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Durable Asset Accountability</span>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* 2. Header & Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-bold tracking-widest text-emerald-600 dark:text-emerald-400 uppercase">Stores &amp; National Coordinator Tracker</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Outstanding Durable Items Tracker
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Accountability view of equipment (fans, chairs, tables, speakers) borrowed by departments requiring return after events.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => loadOutstandingItems(true)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold h-9 border-border/70 hover:bg-accent/60 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <Button
              onClick={() => setIsCloseEventOpen(true)}
              size="sm"
              className="text-xs font-bold h-9 bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-xs"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" /> Event Close Reminders
            </Button>
          </div>
        </div>

        {/* 3. KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="glass-card bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Outstanding Items</span>
            <span className="text-2xl font-bold text-amber-500 font-mono">{totalOutstandingQty}</span>
            <span className="text-[10px] text-muted-foreground block">Currently holding by depts</span>
          </Card>

          <Card className="glass-card bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Holding Departments</span>
            <span className="text-2xl font-bold text-foreground font-mono">{totalHoldingDepts}</span>
            <span className="text-[10px] text-muted-foreground block">Active borrowing departments</span>
          </Card>

          <Card className="glass-card bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Return Initiated</span>
            <span className="text-2xl font-bold text-blue-400 font-mono">{totalInitiatedCount}</span>
            <span className="text-[10px] text-muted-foreground block">Heads-up from departments</span>
          </Card>

          <Card className="glass-card bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Reported Lost / Missing</span>
            <span className="text-2xl font-bold text-red-400 font-mono">{totalLostCount}</span>
            <span className="text-[10px] text-muted-foreground block">Unrestored stock balance</span>
          </Card>
        </div>

        {/* 4. Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl bg-card border border-border">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Filter by Dept:</span>
            <Select value={selectedDeptFilter} onValueChange={(val: any) => { if (val) setSelectedDeptFilter(val) }}>
              <SelectTrigger className="w-48 text-xs input-dark h-8">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200 max-h-60">
                <SelectItem value="all">All Departments</SelectItem>
                {uniqueDepts.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Input
            placeholder="Search item, code, or department..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 h-8 text-xs bg-background/60 border-border/60 focus:bg-background transition-colors"
          />
        </div>

        {/* 5. Grouped Department Accordion / Cards List */}
        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : Object.keys(groupedByDept).length === 0 ? (
          <Card className="glass-card p-12 text-center space-y-3 bg-card border-border">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <h3 className="text-base font-bold text-foreground">No Outstanding Durable Items</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              All borrowed durable equipment across all departments has been returned to Stores in optimal condition!
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByDept).map(([deptName, items]) => (
              <div key={deptName} className="glass-card overflow-hidden rounded-xl border border-border bg-card">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/20">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="h-4 w-4 text-blue-400" />
                    <h3 className="text-sm font-bold text-foreground">{deptName}</h3>
                    <span className="text-[11px] font-mono font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                      {items.reduce((sum, i) => sum + i.outstandingQty, 0)} Items Outstanding
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {items.length} Line Requisitions
                  </span>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                        <th className="p-3">Item Code</th>
                        <th className="p-3">Durable Equipment Name</th>
                        <th className="p-3 text-right">Issued</th>
                        <th className="p-3 text-right">Returned</th>
                        <th className="p-3 text-right">Outstanding</th>
                        <th className="p-3 text-center">Return Status</th>
                        <th className="p-3">Delivered Date</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-foreground">
                      {items.map((it, idx) => (
                        <tr key={`${it.requestId}_${idx}`} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-mono">
                            {it.itemCode ? (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                {it.itemCode}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[10px] italic">Unassigned</span>
                            )}
                          </td>
                          <td className="p-3 font-semibold text-foreground">
                            {it.itemName}
                            {it.conditionNote && (
                              <span className="block text-[10px] font-normal text-muted-foreground italic">
                                Note: {it.conditionNote}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-foreground">{it.quantityIssued}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">{it.quantityReturned}</td>
                          <td className="p-3 text-right font-mono font-bold text-amber-400 text-sm">{it.outstandingQty}</td>
                          <td className="p-3 text-center">
                            {it.returnStatus === 'return_initiated' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider animate-pulse flex items-center justify-center gap-1">
                                <Truck className="w-3 h-3" /> Return Initiated
                              </span>
                            ) : it.returnStatus === 'returned_damaged' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase tracking-wider flex items-center justify-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Returned Damaged
                              </span>
                            ) : it.returnStatus === 'lost' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider flex items-center justify-center gap-1">
                                <XCircle className="w-3 h-3" /> Lost / Missing
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider flex items-center justify-center gap-1">
                                <Clock className="w-3 h-3" /> Outstanding
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-muted-foreground text-[11px]">
                            {new Date(it.deliveredAt).toLocaleDateString()}
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedItem(it)
                                setReturnQty(it.outstandingQty || 1)
                                setIsLogReturnOpen(true)
                              }}
                              className="h-7 text-[11px] font-bold cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                              Log Return
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 6. LOG RETURN CONFIRMATION MODAL */}
        <Dialog open={isLogReturnOpen} onOpenChange={setIsLogReturnOpen}>
          <DialogContent className="bg-card border-border text-foreground max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-emerald-400" /> Log Authoritative Durable Return
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Confirm return of borrowed equipment to Stores and select physical item condition.
              </DialogDescription>
            </DialogHeader>

            {selectedItem && (
              <div className="space-y-4 py-2">
                <div className="p-3 rounded-xl bg-background/50 border border-border space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Department:</span>
                    <span className="font-bold text-foreground">{selectedItem.departmentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Item:</span>
                    <span className="font-bold text-amber-400">{selectedItem.itemName} {selectedItem.itemCode ? `[${selectedItem.itemCode}]` : ''}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Outstanding Qty:</span>
                    <span className="font-bold text-foreground">{selectedItem.outstandingQty} units</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quantity Returned</Label>
                  <NumberField
                    value={returnQty}
                    onChange={setReturnQty}
                    min={1}
                    max={selectedItem.outstandingQty || 100}
                    className="input-dark text-xs font-mono font-bold text-emerald-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Condition *</Label>
                  <Select value={returnCondition} onValueChange={(val: any) => setReturnCondition(val)}>
                    <SelectTrigger className="w-full text-xs input-dark">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                      <SelectItem value="good">✓ Good Condition (Restores Stock &amp; Logs Return)</SelectItem>
                      <SelectItem value="damaged">⚠️ Damaged (Restores Stock &amp; Flags Damaged Note)</SelectItem>
                      <SelectItem value="lost">❌ Lost / Missing (Does NOT Restore Stock)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Condition Note / Remarks</Label>
                  <Input
                    value={conditionNote}
                    onChange={e => setConditionNote(e.target.value)}
                    placeholder={returnCondition === 'good' ? 'Returned in optimal condition' : returnCondition === 'damaged' ? 'e.g. Broken stand' : 'e.g. Reported lost by department'}
                    className="input-dark text-xs"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setIsLogReturnOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmReturn} disabled={submittingReturn} className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                {submittingReturn ? 'Processing...' : 'Confirm Return & Update Ledger'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 7. EVENT CLOSE REMINDER TRIGGER MODAL */}
        <Dialog open={isCloseEventOpen} onOpenChange={setIsCloseEventOpen}>
          <DialogContent className="bg-card border-border text-foreground max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Send className="h-4 w-4 text-amber-400" /> Event Close Return Reminders
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Automatically notify every department holding unreturned durable items requesting immediate return.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Trigger Automated Return Reminders
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  This action sends a high-priority system notification to HODs of all {totalHoldingDepts} departments currently holding {totalOutstandingQty} unreturned durable items.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setIsCloseEventOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleCloseEventAndRemind} disabled={closingEvent} className="text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white">
                {closingEvent ? 'Dispatching Notifications...' : 'Close Event & Send Reminders'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
