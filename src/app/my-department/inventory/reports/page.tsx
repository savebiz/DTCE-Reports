'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock, Profile } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton-loader'
import { BarChart3, Download, Filter, RefreshCw, Layers, ShieldAlert, FileText, ArrowLeft, Building2, PackageCheck } from 'lucide-react'

export default function InventoryReportsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Catalog items & Departments for filter dropdowns
  const [catalogItems, setCatalogItems] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])

  // Filters State
  const [reportType, setReportType] = useState<'stock_summary' | 'department_consumption' | 'fulfillment_history' | 'low_stock' | 'durable_returns'>('stock_summary')
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'week' | 'convention' | 'custom'>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([])

  // Report Data State
  const [reportData, setReportData] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Load initial dropdown options (items & departments)
  const loadOptions = useCallback(async () => {
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
      setCatalogItems(mockStore.inventoryItems || [])
      setDepartments(mockStore.departments || mockStore.mockDepartments || [])
    } else {
      const [itemsRes, deptsRes] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name', { ascending: true }),
        supabase.from('departments').select('*').order('name', { ascending: true })
      ])

      if (itemsRes.data) setCatalogItems(itemsRes.data)
      if (deptsRes.data) setDepartments(deptsRes.data)
    }
  }, [router])

  // Fetch Report Data from Server (with combinable filters)
  const loadReportData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)

    // Calculate dates based on preset
    let finalStart = startDate
    let finalEnd = endDate

    const now = new Date()
    if (datePreset === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      finalStart = startOfDay
      finalEnd = now.toISOString()
    } else if (datePreset === 'week') {
      const startOfWeek = new Date(now.setDate(now.getDate() - 7)).toISOString()
      finalStart = startOfWeek
      finalEnd = new Date().toISOString()
    } else if (datePreset === 'convention') {
      // General Convention period default
      finalStart = new Date(now.getFullYear(), 6, 20).toISOString()
      finalEnd = new Date(now.getFullYear(), 6, 30).toISOString()
    } else if (datePreset === 'all') {
      finalStart = ''
      finalEnd = ''
    }

    try {
      const params = new URLSearchParams({
        reportType,
        ...(finalStart && { startDate: finalStart }),
        ...(finalEnd && { endDate: finalEnd }),
        ...(selectedItemIds.length > 0 && { itemIds: selectedItemIds.join(',') }),
        ...(selectedDeptIds.length > 0 && { deptIds: selectedDeptIds.join(',') })
      })

      const res = await fetch(`/api/inventory/reports?${params.toString()}`)
      const result = await res.json()

      if (res.ok && result.data) {
        setReportData(result.data)
      } else {
        showToast(`Failed to load report: ${result.error || 'Unknown error'}`, 'error')
      }
    } catch (err: any) {
      showToast(`Error fetching inventory report: ${err.message}`, 'error')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [reportType, datePreset, startDate, endDate, selectedItemIds, selectedDeptIds])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  useEffect(() => {
    loadReportData(true)
  }, [loadReportData])

  // Multi-Select Item Toggle
  const toggleItemFilter = (itemId: string) => {
    setSelectedItemIds(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    )
  }

  // Multi-Select Department Toggle
  const toggleDeptFilter = (deptId: string) => {
    setSelectedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    )
  }

  // Reset All Filters
  const handleResetFilters = () => {
    setDatePreset('all')
    setStartDate('')
    setEndDate('')
    setSelectedItemIds([])
    setSelectedDeptIds([])
    setSearchQuery('')
  }

  // Multi-Format Server Export Handler (CSV, Excel .xlsx, Branded PDF)
  const handleExport = (fmt: 'csv' | 'xlsx' | 'pdf') => {
    let finalStart = startDate
    let finalEnd = endDate

    const now = new Date()
    if (datePreset === 'today') {
      finalStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      finalEnd = now.toISOString()
    } else if (datePreset === 'week') {
      finalStart = new Date(now.setDate(now.getDate() - 7)).toISOString()
      finalEnd = new Date().toISOString()
    } else if (datePreset === 'convention') {
      finalStart = new Date(now.getFullYear(), 6, 20).toISOString()
      finalEnd = new Date(now.getFullYear(), 6, 30).toISOString()
    }

    const params = new URLSearchParams({
      reportType,
      format: fmt,
      ...(finalStart && { startDate: finalStart }),
      ...(finalEnd && { endDate: finalEnd }),
      ...(selectedItemIds.length > 0 && { itemIds: selectedItemIds.join(',') }),
      ...(selectedDeptIds.length > 0 && { deptIds: selectedDeptIds.join(',') })
    })

    const exportUrl = `/api/inventory/export?${params.toString()}`
    window.open(exportUrl, '_blank')
    showToast(`Generating ${fmt.toUpperCase()} export with active filters...`, 'info')
  }

  // Filtered Display Data
  const filteredDisplayData = reportData.filter(d => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (d.name || '').toLowerCase().includes(q) ||
      (d.item_name || '').toLowerCase().includes(q) ||
      (d.department_name || '').toLowerCase().includes(q) ||
      (d.unit || '').toLowerCase().includes(q)
    )
  })

  // Total metrics calculations for header cards
  const totalFulfilledUnitsAllDepts = reportType === 'department_consumption'
    ? reportData.reduce((acc, curr) => acc + Number(curr.total_fulfilled_qty || 0), 0)
    : 0

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* 1. Integrated Navigation Strip */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-border/40 bg-background/50 backdrop-blur-xs">
        <button
          onClick={() => router.push('/my-department/inventory')}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Inventory Console
        </button>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Inventory Analytics & Oversight</span>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* 2. Header & Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-[11px] font-bold tracking-widest text-blue-600 dark:text-blue-400 uppercase">National Coordinator & Stores Oversight</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Inventory Reports & Insights
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Analyze material distribution, department consumption equity, and stock levels using server-side aggregated datasets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => loadReportData(true)}
              variant="outline"
              size="sm"
              className="text-xs font-semibold h-9 border-border/70 hover:bg-accent/60 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Data
            </Button>

            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/70 shadow-xs">
              <Button
                onClick={() => handleExport('csv')}
                size="sm"
                variant="ghost"
                className="text-xs font-bold h-7 px-2.5 hover:bg-emerald-500/20 hover:text-emerald-400 cursor-pointer"
              >
                📄 CSV
              </Button>
              <Button
                onClick={() => handleExport('xlsx')}
                size="sm"
                variant="ghost"
                className="text-xs font-bold h-7 px-2.5 hover:bg-blue-500/20 hover:text-blue-400 cursor-pointer"
              >
                📊 Excel (.xlsx)
              </Button>
              <Button
                onClick={() => handleExport('pdf')}
                size="sm"
                variant="ghost"
                className="text-xs font-bold h-7 px-2.5 hover:bg-amber-500/20 hover:text-amber-400 cursor-pointer"
              >
                🖨️ Branded PDF
              </Button>
            </div>
          </div>
        </div>

        {/* 3. Report Type Selector Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-1.5 rounded-xl bg-card border border-border">
          {[
            { id: 'stock_summary', label: 'Stock Summary', icon: Layers, desc: 'Current stock vs threshold' },
            { id: 'department_consumption', label: 'Dept Consumption', icon: Building2, desc: 'Equitable distribution' },
            { id: 'fulfillment_history', label: 'Fulfillment Log', icon: FileText, desc: 'Audit log disbursements' },
            { id: 'low_stock', label: 'Low Stock Deficits', icon: ShieldAlert, desc: 'Items requiring restock' },
            { id: 'durable_returns', label: 'Durable Returns & Lost', icon: PackageCheck, desc: 'Borrowed equipment returns' }
          ].map(tab => {
            const Icon = tab.icon
            const active = reportType === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setReportType(tab.id as any)}
                className={`p-2.5 rounded-lg text-left transition-all cursor-pointer border ${
                  active
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold shadow-xs'
                    : 'bg-background/40 border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-bold truncate">{tab.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground block truncate">{tab.desc}</span>
              </button>
            )
          })}
        </div>

        {/* 4. Combinable Multi-Select Filter Toolbar */}
        <Card className="glass-card bg-card border-border p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">Combinable Report Filters</span>
            </div>
            {(datePreset !== 'all' || selectedItemIds.length > 0 || selectedDeptIds.length > 0 || searchQuery) && (
              <button
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-amber-500 hover:underline cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Filter 1: Date Range Presets */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Date Range Filter</Label>
              <Select value={datePreset} onValueChange={(val: any) => setDatePreset(val)}>
                <SelectTrigger className="w-full text-xs input-dark h-9">
                  <SelectValue placeholder="Select Date Range..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                  <SelectItem value="all">📅 All Time History</SelectItem>
                  <SelectItem value="today">⚡ Today Only</SelectItem>
                  <SelectItem value="week">📅 Past 7 Days</SelectItem>
                  <SelectItem value="convention">🏆 Convention Period</SelectItem>
                  <SelectItem value="custom">✏️ Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter 2: Custom Date Inputs */}
            {datePreset === 'custom' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="input-dark text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="input-dark text-xs h-9"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Search Report</Label>
                <Input
                  placeholder="Filter by item or department..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="input-dark text-xs h-9"
                />
              </div>
            )}

            {/* Filter 3: Multi-Select Item Filter Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Item Filter ({selectedItemIds.length > 0 ? `${selectedItemIds.length} Selected` : 'All Items'})
              </Label>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 rounded-lg bg-background/50 border border-border/60">
                {catalogItems.map(item => {
                  const isSelected = selectedItemIds.includes(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleItemFilter(item.id)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                          : 'bg-muted/40 text-muted-foreground border-border/40 hover:text-foreground'
                      }`}
                    >
                      {isSelected ? '✓ ' : ''}{item.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Filter 4: Multi-Select Department Filter Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Department Filter ({selectedDeptIds.length > 0 ? `${selectedDeptIds.length} Selected` : 'All Depts'})
              </Label>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 rounded-lg bg-background/50 border border-border/60">
                {departments.map(dept => {
                  const isSelected = selectedDeptIds.includes(dept.id)
                  return (
                    <button
                      key={dept.id}
                      onClick={() => toggleDeptFilter(dept.id)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-blue-500 text-white border-blue-500 font-bold'
                          : 'bg-muted/40 text-muted-foreground border-border/40 hover:text-foreground'
                      }`}
                    >
                      {isSelected ? '✓ ' : ''}{dept.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* 5. Report Content Output */}
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
          <div className="glass-card overflow-hidden rounded-xl border border-border bg-card">
            {/* Header info bar */}
            <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-muted/20">
              <div>
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  {reportType === 'stock_summary' && '📦 Catalog Stock Level Summary'}
                  {reportType === 'department_consumption' && '📊 Department Consumption & Distribution Equity'}
                  {reportType === 'fulfillment_history' && '📜 Fulfillment Audit Transaction Log'}
                  {reportType === 'low_stock' && '⚠️ Low Stock Deficit Alert Report'}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Showing {filteredDisplayData.length} aggregated records based on active filter parameters.
                </p>
              </div>

              {reportType === 'department_consumption' && (
                <div className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-full">
                  Total Disbursed: {totalFulfilledUnitsAllDepts} units
                </div>
              )}
            </div>

            <div className="overflow-x-auto text-xs">
              {reportType === 'stock_summary' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Item Name</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Unit</th>
                      <th className="p-3 text-right">Current Stock</th>
                      <th className="p-3 text-right">Low Stock Threshold</th>
                      <th className="p-3 text-right">Total Restocked</th>
                      <th className="p-3 text-right">Total Fulfilled</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-foreground">
                    {filteredDisplayData.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground italic">No stock summary records match your filter parameters.</td></tr>
                    ) : (
                      filteredDisplayData.map(item => (
                        <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-semibold text-foreground">{item.name}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              item.category === 'durable' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            }`}>
                              {item.category}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">{item.unit}</td>
                          <td className="p-3 text-right font-mono font-bold text-foreground text-sm">{item.current_stock}</td>
                          <td className="p-3 text-right font-mono text-muted-foreground">{item.low_stock_threshold}</td>
                          <td className="p-3 text-right font-mono text-emerald-400 font-bold">+{item.total_restocked || 0}</td>
                          <td className="p-3 text-right font-mono text-amber-400 font-bold">-{item.total_fulfilled || 0}</td>
                          <td className="p-3 text-center">
                            {item.is_low_stock || item.current_stock <= item.low_stock_threshold ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider animate-pulse">
                                ⚠️ Low Stock
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                ✓ Optimal
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {reportType === 'department_consumption' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Department Name</th>
                      <th className="p-3">Material Requested & Received</th>
                      <th className="p-3 text-right">Fulfilled Orders Count</th>
                      <th className="p-3 text-right">Total Units Disbursed</th>
                      <th className="p-3 text-right">Share of Item Consumption</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-foreground">
                    {filteredDisplayData.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground italic">No department consumption data recorded for the selected filter criteria.</td></tr>
                    ) : (
                      filteredDisplayData.map((row, idx) => {
                        const totalItemConsumption = filteredDisplayData
                          .filter(d => d.item_name === row.item_name)
                          .reduce((acc, curr) => acc + Number(curr.total_fulfilled_qty || 0), 0)
                        const sharePercent = totalItemConsumption > 0
                          ? Math.round((Number(row.total_fulfilled_qty) / totalItemConsumption) * 100)
                          : 100

                        return (
                          <tr key={`${row.department_id}_${row.item_id}_${idx}`} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3 font-semibold text-foreground flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-blue-400" />
                              {row.department_name}
                            </td>
                            <td className="p-3 font-semibold text-amber-500">{row.item_name}</td>
                            <td className="p-3 text-right font-mono text-muted-foreground">{row.fulfillment_count} orders</td>
                            <td className="p-3 text-right font-mono font-bold text-foreground text-sm">
                              {row.total_fulfilled_qty} {row.unit || 'pcs'}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-2 bg-muted/60 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-amber-500 rounded-full"
                                    style={{ width: `${Math.min(100, sharePercent)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs font-bold text-muted-foreground">{sharePercent}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}

              {reportType === 'fulfillment_history' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Item Name</th>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-right">Quantity Change</th>
                      <th className="p-3 text-right">Resulting Stock</th>
                      <th className="p-3">Audit Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-foreground">
                    {filteredDisplayData.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground italic">No fulfillment history logs match your filter criteria.</td></tr>
                    ) : (
                      filteredDisplayData.map(h => {
                        const isRestock = h.transaction_type === 'restock'
                        return (
                          <tr key={h.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3 font-mono text-[11px] text-muted-foreground">
                              {new Date(h.timestamp).toLocaleString()}
                            </td>
                            <td className="p-3 font-semibold text-foreground">{h.department_name}</td>
                            <td className="p-3 font-semibold text-amber-500">{h.item_name}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isRestock
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                {h.transaction_type.replace('_', ' ')}
                              </span>
                            </td>
                            <td className={`p-3 text-right font-mono font-bold ${isRestock ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {h.quantity_change > 0 ? `+${h.quantity_change}` : h.quantity_change} {h.unit}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-foreground">
                              {h.resulting_stock_level} {h.unit}
                            </td>
                            <td className="p-3 text-muted-foreground text-[11px] max-w-xs truncate">
                              {h.note || '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}

              {reportType === 'low_stock' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Item Name</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Unit</th>
                      <th className="p-3 text-right">Current Stock</th>
                      <th className="p-3 text-right">Low Stock Threshold</th>
                      <th className="p-3 text-right">Deficit / Shortfall</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-foreground">
                    {filteredDisplayData.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-emerald-400 font-semibold italic">✓ All inventory items are optimal. No low-stock deficits recorded!</td></tr>
                    ) : (
                      filteredDisplayData.map(item => {
                        const shortfall = item.shortfall ?? Math.max(0, item.low_stock_threshold - item.current_stock)
                        return (
                          <tr key={item.id} className="hover:bg-muted/20 transition-colors bg-red-500/5">
                            <td className="p-3 font-semibold text-foreground">{item.name}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                item.category === 'durable' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              }`}>
                                {item.category}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-muted-foreground">{item.unit}</td>
                            <td className="p-3 text-right font-mono font-bold text-red-400 text-sm animate-pulse">{item.current_stock}</td>
                            <td className="p-3 text-right font-mono text-muted-foreground">{item.low_stock_threshold}</td>
                            <td className="p-3 text-right font-mono font-bold text-red-400">-{shortfall} {item.unit}</td>
                            <td className="p-3 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push('/my-department/inventory')}
                                className="h-7 text-[11px] font-semibold cursor-pointer border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                              >
                                Restock Now
                              </Button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}

              {reportType === 'durable_returns' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Department Name</th>
                      <th className="p-3">Item Code</th>
                      <th className="p-3">Equipment Name</th>
                      <th className="p-3 text-right">Issued Qty</th>
                      <th className="p-3 text-right">Returned Qty</th>
                      <th className="p-3 text-right">Outstanding Qty</th>
                      <th className="p-3 text-center">Return Status</th>
                      <th className="p-3">Condition Note / Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-foreground">
                    {filteredDisplayData.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground italic">No durable return records match your filter criteria.</td></tr>
                    ) : (
                      filteredDisplayData.map(r => (
                        <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-semibold text-foreground flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-blue-400" />
                            {r.department_name}
                          </td>
                          <td className="p-3 font-mono">
                            {r.item_code ? (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                {r.item_code}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[10px] italic">Unassigned</span>
                            )}
                          </td>
                          <td className="p-3 font-semibold text-amber-500">{r.item_name}</td>
                          <td className="p-3 text-right font-mono font-bold text-foreground">{r.quantity_issued}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">{r.quantity_returned}</td>
                          <td className="p-3 text-right font-mono font-bold text-amber-400 text-sm">{r.outstanding_quantity}</td>
                          <td className="p-3 text-center">
                            {r.return_status === 'return_initiated' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider animate-pulse">
                                🚚 Return Initiated
                              </span>
                            ) : r.return_status === 'returned_damaged' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase tracking-wider">
                                ⚠️ Returned Damaged
                              </span>
                            ) : r.return_status === 'lost' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider">
                                ❌ Lost / Missing
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                                ⏳ Outstanding
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground text-[11px] max-w-xs truncate">
                            {r.condition_note || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
