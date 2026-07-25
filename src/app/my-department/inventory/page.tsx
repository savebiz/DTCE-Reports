'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NumberField } from '@/components/ui/number-field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription'
import { TableSkeleton } from '@/components/ui/skeleton-loader'
import { InventoryItem, InventoryTransaction } from '@/utils/supabase/mockData'

export default function StoresInventoryPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])

  const [activeTab, setActiveTab] = useState<'all' | 'low_stock' | 'consumable' | 'durable' | 'ledger'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Add Item Modal state
  const [isAddItemOpen, setIsAddItemOpen] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<'durable' | 'consumable'>('consumable')
  const [newItemUnit, setNewItemUnit] = useState('pcs')
  const [newItemStock, setNewItemStock] = useState(0)
  const [newItemThreshold, setNewItemThreshold] = useState(5)
  const [submittingItem, setSubmittingItem] = useState(false)

  // Restock Modal state
  const [isRestockOpen, setIsRestockOpen] = useState(false)
  const [selectedRestockItem, setSelectedRestockItem] = useState<InventoryItem | null>(null)
  const [restockQty, setRestockQty] = useState(10)
  const [restockNote, setRestockNote] = useState('')
  const [submittingRestock, setSubmittingRestock] = useState(false)

  const loadInventory = useCallback(async (showSpinner = true) => {
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
      setItems(mockStore.inventoryItems || [])
      setTransactions(mockStore.inventoryTransactions || [])
    } else {
      try {
        const [itemsRes, transRes] = await Promise.all([
          fetch('/api/inventory/items').then(r => r.json()),
          fetch('/api/inventory/transactions').then(r => r.json())
        ])

        if (itemsRes.items) setItems(itemsRes.items)
        if (transRes.transactions) setTransactions(transRes.transactions)
      } catch (err: any) {
        showToast(`Failed to load inventory: ${err.message}`, 'error')
      }
    }

    if (showSpinner) setLoading(false)
  }, [router])

  // Realtime subscription for instant stock & ledger updates
  useRealtimeSubscription({
    channelName: 'stores-inventory-updates',
    subscriptions: [
      { table: 'inventory_items' },
      { table: 'inventory_transactions' }
    ],
    onDataChange: () => loadInventory(false)
  })

  useEffect(() => {
    loadInventory(true)
  }, [loadInventory])

  // Add Item Handler
  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      showToast('Item name is required', 'error')
      return
    }

    setSubmittingItem(true)
    if (isMock) {
      const { store: mockStore } = require('@/utils/supabase/mockClient')
      const itemsList = mockStore.inventoryItems
      const createdItem: InventoryItem = {
        id: `inv-${Date.now()}`,
        name: newItemName.trim(),
        category: newItemCategory,
        unit: newItemUnit.trim() || 'pcs',
        current_stock: Number(newItemStock) || 0,
        low_stock_threshold: Number(newItemThreshold) || 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      itemsList.push(createdItem)
      mockStore.inventoryItems = itemsList

      if (createdItem.current_stock > 0) {
        const transList = mockStore.inventoryTransactions
        transList.push({
          id: `trans-${Date.now()}`,
          inventory_item_id: createdItem.id,
          transaction_type: 'restock',
          quantity_change: createdItem.current_stock,
          performed_by: profile?.id || 'user-admin',
          note: 'Initial catalog stock opening balance',
          resulting_stock_level: createdItem.current_stock,
          created_at: new Date().toISOString()
        })
        mockStore.inventoryTransactions = transList
      }

      showToast(`Catalog item "${createdItem.name}" added successfully (Mock)`, 'success')
      setIsAddItemOpen(false)
      setNewItemName('')
      setNewItemStock(0)
      setSubmittingItem(false)
      loadInventory(false)
      return
    }

    try {
      const res = await fetch('/api/inventory/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItemName.trim(),
          category: newItemCategory,
          unit: newItemUnit.trim() || 'pcs',
          current_stock: Number(newItemStock) || 0,
          low_stock_threshold: Number(newItemThreshold) || 5
        })
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      showToast(`Catalog item "${newItemName}" created successfully!`, 'success')
      setIsAddItemOpen(false)
      setNewItemName('')
      setNewItemStock(0)
      loadInventory(false)
    } catch (err: any) {
      showToast(`Failed to create item: ${err.message}`, 'error')
    } finally {
      setSubmittingItem(false)
    }
  }

  // Restock Handler
  const handleRestock = async () => {
    if (!selectedRestockItem) return
    if (!restockQty || restockQty <= 0) {
      showToast('Please enter a valid restock quantity greater than 0', 'error')
      return
    }

    setSubmittingRestock(true)
    const qty = Number(restockQty)

    if (isMock) {
      const { store: mockStore } = require('@/utils/supabase/mockClient')
      const itemsList = mockStore.inventoryItems
      const target = itemsList.find((i: any) => i.id === selectedRestockItem.id)
      if (target) {
        const newStock = target.current_stock + qty
        target.current_stock = newStock
        target.updated_at = new Date().toISOString()
        mockStore.inventoryItems = itemsList

        const transList = mockStore.inventoryTransactions
        transList.push({
          id: `trans-${Date.now()}`,
          inventory_item_id: selectedRestockItem.id,
          transaction_type: 'restock',
          quantity_change: qty,
          performed_by: profile?.id || 'user-admin',
          note: restockNote.trim() || 'Restocked via Stores Inventory Console',
          resulting_stock_level: newStock,
          created_at: new Date().toISOString()
        })
        mockStore.inventoryTransactions = transList
      }

      showToast(`Restocked +${qty} ${selectedRestockItem.unit} of "${selectedRestockItem.name}" (Mock)`, 'success')
      setIsRestockOpen(false)
      setSelectedRestockItem(null)
      setRestockNote('')
      setSubmittingRestock(false)
      loadInventory(false)
      return
    }

    try {
      const res = await fetch('/api/inventory/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId: selectedRestockItem.id,
          restockQuantity: qty,
          note: restockNote.trim() || 'Restocked via Stores Inventory Console'
        })
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      showToast(`Restocked +${qty} ${selectedRestockItem.unit} of "${selectedRestockItem.name}"!`, 'success')
      setIsRestockOpen(false)
      setSelectedRestockItem(null)
      setRestockNote('')
      loadInventory(false)
    } catch (err: any) {
      showToast(`Restock failed: ${err.message}`, 'error')
    } finally {
      setSubmittingRestock(false)
    }
  }

  // Filter Items
  const filteredItems = items.filter(i => {
    const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase()) || i.unit.toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false

    if (activeTab === 'low_stock') return i.current_stock <= i.low_stock_threshold
    if (activeTab === 'consumable') return i.category === 'consumable'
    if (activeTab === 'durable') return i.category === 'durable'
    return true
  })

  // KPI Calculations
  const totalCatalogCount = items.length
  const lowStockCount = items.filter(i => i.current_stock <= i.low_stock_threshold).length
  const consumableTotal = items.filter(i => i.category === 'consumable').reduce((sum, i) => sum + i.current_stock, 0)
  const durableTotal = items.filter(i => i.category === 'durable').reduce((sum, i) => sum + i.current_stock, 0)

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* 1. Header Navigation Strip */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-border/40 bg-background/50 backdrop-blur-xs">
        <button
          onClick={() => router.push('/my-department')}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <span>←</span> Back to Stores Dashboard
        </button>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Stores Inventory System</span>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* 2. Title & Main Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span className="text-[11px] font-bold tracking-widest text-amber-600 dark:text-amber-400 uppercase">Stores Department Ledger</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Catalog & Stock Tracking</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage inventory items, execute stock restocks, and review append-only transaction audit history.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsAddItemOpen(true)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold h-9 cursor-pointer"
            >
              + Add Catalog Item
            </Button>
            <Button
              onClick={() => {
                if (items.length > 0) setSelectedRestockItem(items[0])
                setIsRestockOpen(true)
              }}
              size="sm"
              className="text-xs font-bold h-9 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
            >
              + Restock Stock
            </Button>
          </div>
        </div>

        {/* 3. KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="glass-card bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Catalog Items</span>
            <span className="text-2xl font-bold text-foreground font-mono">{totalCatalogCount}</span>
            <span className="text-[10px] text-muted-foreground block">Active tracked materials</span>
          </Card>

          <Card className={`glass-card p-4 space-y-1 border ${lowStockCount > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-card border-border'}`}>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Low Stock Alerts</span>
            <span className={`text-2xl font-bold font-mono ${lowStockCount > 0 ? 'text-red-400 animate-pulse' : 'text-foreground'}`}>
              {lowStockCount}
            </span>
            <span className="text-[10px] text-muted-foreground block">Below threshold warning</span>
          </Card>

          <Card className="glass-card bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Consumable Stock</span>
            <span className="text-2xl font-bold text-amber-500 font-mono">{consumableTotal}</span>
            <span className="text-[10px] text-muted-foreground block">Total units available</span>
          </Card>

          <Card className="glass-card bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Durable Stock</span>
            <span className="text-2xl font-bold text-blue-400 font-mono">{durableTotal}</span>
            <span className="text-[10px] text-muted-foreground block">Total units available</span>
          </Card>
        </div>

        {/* 4. Filter Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl bg-card border border-border">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All Catalog Items', count: items.length },
              { id: 'low_stock', label: '⚠️ Low Stock Alerts', count: lowStockCount },
              { id: 'consumable', label: 'Consumables', count: items.filter(i => i.category === 'consumable').length },
              { id: 'durable', label: 'Durables', count: items.filter(i => i.category === 'durable').length },
              { id: 'ledger', label: '📜 Transaction Audit Ledger', count: transactions.length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.id ? 'bg-slate-950/20 text-slate-950 font-bold' : 'bg-muted/60 text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {activeTab !== 'ledger' && (
            <Input
              placeholder="Search catalog by name or unit..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 h-9 text-xs bg-background/60 border-border/60 focus:bg-background transition-colors"
            />
          )}
        </div>

        {/* 5. Main Content Area: Catalog Table or Transaction Ledger */}
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : activeTab === 'ledger' ? (
          /* Transaction Ledger Table */
          <div className="glass-card overflow-hidden rounded-xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/20">
              <div>
                <h3 className="text-sm font-bold text-foreground">Append-Only Inventory Transaction Ledger</h3>
                <p className="text-[11px] text-muted-foreground">Complete audit trail of all restocks and fulfillment deductions.</p>
              </div>
              <span className="text-xs font-mono font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                {transactions.length} Records Logged
              </span>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Item Name</th>
                    <th className="p-3">Transaction Type</th>
                    <th className="p-3 text-right">Quantity Change</th>
                    <th className="p-3 text-right">Resulting Stock</th>
                    <th className="p-3">Audit Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-foreground">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground italic">
                        No inventory transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((t: any) => {
                      const itemMatch = items.find(i => i.id === t.inventory_item_id)
                      const itemName = itemMatch?.name || t.item?.name || 'Inventory Item'
                      const unit = itemMatch?.unit || t.item?.unit || 'units'
                      const isRestock = t.transaction_type === 'restock'

                      return (
                        <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-mono text-[11px] text-muted-foreground">
                            {new Date(t.created_at).toLocaleString()}
                          </td>
                          <td className="p-3 font-semibold text-foreground">{itemName}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isRestock
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {t.transaction_type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${isRestock ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {t.quantity_change > 0 ? `+${t.quantity_change}` : t.quantity_change} {unit}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-foreground">
                            {t.resulting_stock_level} {unit}
                          </td>
                          <td className="p-3 text-muted-foreground text-[11px] max-w-xs truncate">
                            {t.note || '—'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Catalog Items Table */
          <div className="glass-card overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                    <th className="p-3">Item Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3 text-right">Current Stock</th>
                    <th className="p-3 text-right">Low Stock Threshold</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-foreground">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground italic">
                        No inventory catalog items match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(item => {
                      const isLowStock = item.current_stock <= item.low_stock_threshold

                      return (
                        <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-semibold text-foreground">{item.name}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              item.category === 'durable'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            }`}>
                              {item.category}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">{item.unit}</td>
                          <td className="p-3 text-right font-mono font-bold text-foreground text-sm">
                            {item.current_stock}
                          </td>
                          <td className="p-3 text-right font-mono text-muted-foreground">
                            {item.low_stock_threshold}
                          </td>
                          <td className="p-3 text-center">
                            {isLowStock ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider animate-pulse">
                                ⚠️ Low Stock
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                ✓ Optimal
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedRestockItem(item)
                                setIsRestockOpen(true)
                              }}
                              className="h-7 text-[11px] font-semibold cursor-pointer border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            >
                              + Restock
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. Add Catalog Item Modal */}
        <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
          <DialogContent className="bg-card border-border text-foreground max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold uppercase tracking-wider text-foreground">
                Add Catalog Item
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Define a new tracked material in the Stores inventory catalog.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Item Name</Label>
                <Input
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="e.g. Executive Whiteboard Markers"
                  className="input-dark text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Category</Label>
                  <Select
                    value={newItemCategory}
                    onValueChange={(val: any) => {
                      if (val) setNewItemCategory(val)
                    }}
                  >
                    <SelectTrigger className="w-full text-xs input-dark">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                      <SelectItem value="consumable">Consumable</SelectItem>
                      <SelectItem value="durable">Durable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Unit of Measurement</Label>
                  <Input
                    value={newItemUnit}
                    onChange={e => setNewItemUnit(e.target.value)}
                    placeholder="e.g. pcs, reams, bags, packs"
                    className="input-dark text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Initial Opening Stock</Label>
                  <NumberField
                    value={newItemStock}
                    onChange={setNewItemStock}
                    min={0}
                    className="input-dark text-xs font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Low Stock Threshold</Label>
                  <NumberField
                    value={newItemThreshold}
                    onChange={setNewItemThreshold}
                    min={1}
                    className="input-dark text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setIsAddItemOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddItem} disabled={submittingItem} className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                {submittingItem ? 'Saving...' : 'Save Catalog Item'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 7. Restock Action Modal */}
        <Dialog open={isRestockOpen} onOpenChange={setIsRestockOpen}>
          <DialogContent className="bg-card border-border text-foreground max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold uppercase tracking-wider text-foreground">
                Restock Inventory Material
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Receive new stock from suppliers and automatically log a restock audit transaction.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Select Target Item</Label>
                <Select
                  value={selectedRestockItem?.id || ''}
                  onValueChange={(val) => {
                    const match = items.find(i => i.id === val)
                    if (match) setSelectedRestockItem(match)
                  }}
                >
                  <SelectTrigger className="w-full text-xs input-dark">
                    <SelectValue placeholder="Select item to restock..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                    {items.map(i => (
                      <SelectItem key={i.id} value={i.id} className="cursor-pointer">
                        📦 {i.name} (Current: {i.current_stock} {i.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRestockItem && (
                <div className="p-3 rounded-xl bg-background/50 border border-border text-xs space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Stock:</span>
                    <span className="font-bold text-foreground">{selectedRestockItem.current_stock} {selectedRestockItem.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stock After Restock:</span>
                    <span className="font-bold text-emerald-400">{selectedRestockItem.current_stock + Math.max(1, Number(restockQty) || 0)} {selectedRestockItem.unit}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Restock Quantity (+)</Label>
                <NumberField
                  value={restockQty}
                  onChange={setRestockQty}
                  min={1}
                  className="input-dark text-xs font-mono text-emerald-400 font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Audit Note / Supplier Reference</Label>
                <Input
                  value={restockNote}
                  onChange={e => setRestockNote(e.target.value)}
                  placeholder="e.g. Received 50 reams from supplier (Invoice #402)"
                  className="input-dark text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setIsRestockOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleRestock} disabled={submittingRestock || !selectedRestockItem} className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                {submittingRestock ? 'Processing Restock...' : 'Execute Restock'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
