'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, isMock } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/skeleton-loader'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import {
  BarChart3, Download, Filter, RefreshCw, Layers, ShieldAlert, FileText,
  Building2, PackageCheck, Truck, XCircle, AlertCircle, Clock, ChevronDown, ChevronUp, Eye
} from 'lucide-react'

interface InventoryReportsViewProps {
  readOnly?: boolean
}

export function InventoryReportsView({ readOnly = false }: InventoryReportsViewProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  // Catalog items & Departments for filter dropdowns
  const [catalogItems, setCatalogItems] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])

  // Primary & Secondary View State
  const [activeReportTab, setActiveReportTab] = useState<'stock_summary' | 'department_consumption' | 'secondary_drilldowns'>('stock_summary')
  const [secondaryType, setSecondaryType] = useState<'fulfillment_history' | 'low_stock' | 'durable_returns'>('fulfillment_history')

  // Filters State
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'week' | 'convention' | 'custom'>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Report Datasets
  const [stockSummaryData, setStockSummaryData] = useState<any[]>([])
  const [deptConsumptionData, setDeptConsumptionData] = useState<any[]>([])
  const [secondaryData, setSecondaryData] = useState<any[]>([])

  // Section Pagination State (Default 10 rows per page)
  const [stockPage, setStockPage] = useState(1)
  const [stockPageSize, setStockPageSize] = useState(10)

  const [deptPage, setDeptPage] = useState(1)
  const [deptPageSize, setDeptPageSize] = useState(10)

  const [secondaryPage, setSecondaryPage] = useState(1)
  const [secondaryPageSize, setSecondaryPageSize] = useState(10)

  // Load initial filter dropdown options
  const loadOptions = useCallback(async () => {
    const supabase = getClient()
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
  }, [])

  // Determine active reportType string for server query
  const currentReportType = activeReportTab === 'secondary_drilldowns' ? secondaryType : activeReportTab

  // Fetch Report Data from Server (with combinable filters)
  const loadReportData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)

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
    } else if (datePreset === 'all') {
      finalStart = ''
      finalEnd = ''
    }

    try {
      if (readOnly) {
        // Load Stock Summary, Dept Consumption, and Secondary Drill-Down concurrently
        const [stockRes, deptRes, secondaryRes] = await Promise.all([
          fetch(`/api/inventory/reports?${new URLSearchParams({
            reportType: 'stock_summary',
            ...(finalStart && { startDate: finalStart }),
            ...(finalEnd && { endDate: finalEnd }),
            ...(selectedItemIds.length > 0 && { itemIds: selectedItemIds.join(',') }),
            ...(selectedDeptIds.length > 0 && { deptIds: selectedDeptIds.join(',') })
          })}`),
          fetch(`/api/inventory/reports?${new URLSearchParams({
            reportType: 'department_consumption',
            ...(finalStart && { startDate: finalStart }),
            ...(finalEnd && { endDate: finalEnd }),
            ...(selectedItemIds.length > 0 && { itemIds: selectedItemIds.join(',') }),
            ...(selectedDeptIds.length > 0 && { deptIds: selectedDeptIds.join(',') })
          })}`),
          fetch(`/api/inventory/reports?${new URLSearchParams({
            reportType: secondaryType,
            ...(finalStart && { startDate: finalStart }),
            ...(finalEnd && { endDate: finalEnd }),
            ...(selectedItemIds.length > 0 && { itemIds: selectedItemIds.join(',') }),
            ...(selectedDeptIds.length > 0 && { deptIds: selectedDeptIds.join(',') })
          })}`)
        ])

        const [stockJson, deptJson, secondaryJson] = await Promise.all([
          stockRes.json(),
          deptRes.json(),
          secondaryRes.json()
        ])

        if (stockJson.data) setStockSummaryData(stockJson.data)
        if (deptJson.data) setDeptConsumptionData(deptJson.data)
        if (secondaryJson.data) setSecondaryData(secondaryJson.data)
      } else {
        const params = new URLSearchParams({
          reportType: currentReportType,
          ...(finalStart && { startDate: finalStart }),
          ...(finalEnd && { endDate: finalEnd }),
          ...(selectedItemIds.length > 0 && { itemIds: selectedItemIds.join(',') }),
          ...(selectedDeptIds.length > 0 && { deptIds: selectedDeptIds.join(',') })
        })

        const res = await fetch(`/api/inventory/reports?${params.toString()}`)
        const result = await res.json()
        if (res.ok && result.data) {
          setStockSummaryData(result.data)
        }
      }
    } catch (err: any) {
      showToast(`Error fetching inventory report: ${err.message}`, 'error')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [readOnly, activeReportTab, secondaryType, currentReportType, datePreset, startDate, endDate, selectedItemIds, selectedDeptIds])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  useEffect(() => {
    loadReportData(true)
  }, [loadReportData])

  // Reset pagination on search query or filter changes
  useEffect(() => {
    setStockPage(1)
    setDeptPage(1)
    setSecondaryPage(1)
  }, [searchQuery, selectedItemIds, selectedDeptIds, datePreset, secondaryType])

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
    setStockPage(1)
    setDeptPage(1)
    setSecondaryPage(1)
  }

  // Multi-Format Server Export Handler (CSV, Excel .xlsx, Branded PDF)
  // When triggered from top-level bar in readOnly mode, defaults to 'comprehensive_oversight' covering all 3 sections!
  const handleExport = (fmt: 'csv' | 'xlsx' | 'pdf', targetReportType?: string) => {
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

    const typeToExport = targetReportType || (readOnly ? 'comprehensive_oversight' : currentReportType)

    const params = new URLSearchParams({
      reportType: typeToExport,
      format: fmt,
      ...(finalStart && { startDate: finalStart }),
      ...(finalEnd && { endDate: finalEnd }),
      ...(selectedItemIds.length > 0 && { itemIds: selectedItemIds.join(',') }),
      ...(selectedDeptIds.length > 0 && { deptIds: selectedDeptIds.join(',') })
    })

    const exportUrl = `/api/inventory/export?${params.toString()}`
    window.open(exportUrl, '_blank')
    showToast(`Generating ${fmt.toUpperCase()} export for all inventory oversight sections...`, 'info')
  }

  // Search filtering helpers
  const filterList = (list: any[]) => {
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(d => (
      (d.name || '').toLowerCase().includes(q) ||
      (d.item_name || '').toLowerCase().includes(q) ||
      (d.department_name || '').toLowerCase().includes(q) ||
      (d.unit || '').toLowerCase().includes(q)
    ))
  }

  const filteredStock = filterList(stockSummaryData)
  const filteredDept = filterList(deptConsumptionData)
  const filteredSecondary = filterList(secondaryData)

  const lowStockCount = filteredStock.filter(it => it.is_low_stock || it.current_stock <= it.low_stock_threshold).length

  // Sliced Data for Pagination
  const paginatedStock = filteredStock.slice((stockPage - 1) * stockPageSize, stockPage * stockPageSize)
  const paginatedDept = filteredDept.slice((deptPage - 1) * deptPageSize, deptPage * deptPageSize)
  const paginatedSecondary = filteredSecondary.slice((secondaryPage - 1) * secondaryPageSize, secondaryPage * secondaryPageSize)

  return (
    <div className="space-y-6">
      {/* 1. Header & Comprehensive Export Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-bold tracking-widest text-amber-500 uppercase">
              {readOnly ? 'National Coordinator Executive Desk' : 'Stores Department Inventory Console'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
            Inventory Oversight & Distribution Analytics
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {readOnly
              ? 'Read-only operational oversight of national material distribution, stock levels, and department consumption equity.'
              : 'Analyze material distribution, department consumption equity, and stock levels using server-side aggregated datasets.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => loadReportData(true)}
            variant="outline"
            size="sm"
            className="text-xs font-semibold h-8 border-border/70 hover:bg-accent/60 cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Data
          </Button>

          {/* Comprehensive Export Buttons (Applies to ALL 3 Sections) */}
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/70 shadow-xs">
            <Button
              onClick={() => handleExport('csv', 'comprehensive_oversight')}
              size="sm"
              variant="ghost"
              title="Export Full Multi-Section Inventory Report as CSV"
              className="text-xs font-bold h-6 px-2 hover:bg-emerald-500/20 hover:text-emerald-400 cursor-pointer"
            >
              📄 CSV
            </Button>
            <Button
              onClick={() => handleExport('xlsx', 'comprehensive_oversight')}
              size="sm"
              variant="ghost"
              title="Export Multi-Tab Excel Workbook (.xlsx) Covering All Sections"
              className="text-xs font-bold h-6 px-2 hover:bg-blue-500/20 hover:text-blue-400 cursor-pointer"
            >
              📊 Excel
            </Button>
            <Button
              onClick={() => handleExport('pdf', 'comprehensive_oversight')}
              size="sm"
              variant="ghost"
              title="Print or Save Full Executive PDF Document Covering All 3 Sections"
              className="text-xs font-bold h-6 px-2 hover:bg-amber-500/20 hover:text-amber-400 cursor-pointer"
            >
              🖨️ PDF
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Combinable Multi-Select Filter Toolbar */}
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
              <SelectContent>
                <SelectItem value="all">📅 All Time History</SelectItem>
                <SelectItem value="today">⚡ Today Only</SelectItem>
                <SelectItem value="week">📅 Past 7 Days</SelectItem>
                <SelectItem value="convention">🏆 Convention Period</SelectItem>
                <SelectItem value="custom">✏️ Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filter 2: Search Input / Custom Date */}
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
              <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Search Dataset</Label>
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
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 rounded-lg bg-background/50 border border-border/60">
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
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 rounded-lg bg-background/50 border border-border/60">
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

      {/* 3. Curated Section Priorities for National Coordinator Oversight */}
      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : (
        <div className="space-y-8">
          {/* Priority View 1: Stock Level Summary (Paginated) */}
          <div className="glass-card overflow-hidden rounded-xl border border-border bg-card shadow-md p-4 space-y-3">
            <div className="pb-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    1. Stock Level Summary &amp; Threshold Deficit Flags
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Current stock balances vs. low-stock thresholds across all material categories.
                  </p>
                </div>
              </div>

              {lowStockCount > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider animate-pulse flex items-center gap-1">
                  ⚠️ {lowStockCount} Item(s) At Deficit
                </span>
              )}
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                    <th className="p-3">Item Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3 text-right">Current Stock</th>
                    <th className="p-3 text-right">Threshold</th>
                    <th className="p-3 text-right">Total Restocked</th>
                    <th className="p-3 text-right">Total Disbursed</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-foreground">
                  {paginatedStock.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground italic">No stock records match filter parameters.</td></tr>
                  ) : (
                    paginatedStock.map(item => {
                      const isLow = item.is_low_stock || item.current_stock <= item.low_stock_threshold
                      return (
                        <tr key={item.id} className={`hover:bg-muted/20 transition-colors ${isLow ? 'bg-red-500/5' : ''}`}>
                          <td className="p-3 font-semibold text-foreground">{item.name}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              item.category === 'durable' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            }`}>
                              {item.category}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">{item.unit}</td>
                          <td className={`p-3 text-right font-mono font-bold text-sm ${isLow ? 'text-red-400 animate-pulse' : 'text-foreground'}`}>
                            {item.current_stock}
                          </td>
                          <td className="p-3 text-right font-mono text-muted-foreground">{item.low_stock_threshold}</td>
                          <td className="p-3 text-right font-mono text-emerald-400 font-bold">+{item.total_restocked || 0}</td>
                          <td className="p-3 text-right font-mono text-amber-400 font-bold">-{item.total_fulfilled || 0}</td>
                          <td className="p-3 text-center">
                            {isLow ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider">
                                ⚠️ Low Stock
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                ✓ Optimal
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Section 1 Pagination */}
            <DataTablePagination
              currentPage={stockPage}
              totalPages={Math.ceil(filteredStock.length / stockPageSize)}
              totalItems={filteredStock.length}
              pageSize={stockPageSize}
              onPageChange={setStockPage}
              onPageSizeChange={setStockPageSize}
            />
          </div>

          {/* Priority View 2: Department Consumption & Distribution Equity (Paginated) */}
          <div className="glass-card overflow-hidden rounded-xl border border-border bg-card shadow-md p-4 space-y-3">
            <div className="pb-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    2. Department Consumption &amp; Distribution Equity Report
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Fairness &amp; equitable distribution oversight — department requisition share across convention materials.
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                    <th className="p-3">Department Name</th>
                    <th className="p-3">Material Requested &amp; Received</th>
                    <th className="p-3 text-right">Fulfilled Orders Count</th>
                    <th className="p-3 text-right">Total Disbursed Qty</th>
                    <th className="p-3 text-right">Consumption Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-foreground">
                  {paginatedDept.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground italic">No department consumption data available for active filters.</td></tr>
                  ) : (
                    paginatedDept.map((row, idx) => {
                      const totalItemConsumption = filteredDept
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
            </div>

            {/* Section 2 Pagination */}
            <DataTablePagination
              currentPage={deptPage}
              totalPages={Math.ceil(filteredDept.length / deptPageSize)}
              totalItems={filteredDept.length}
              pageSize={deptPageSize}
              onPageChange={setDeptPage}
              onPageSizeChange={setDeptPageSize}
            />
          </div>

          {/* Secondary Views / Drill-Down Sub-Tabs (Paginated) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">3. Secondary Operational Drill-Downs</span>
              </div>
              <div className="flex gap-2">
                {[
                  { id: 'fulfillment_history', label: 'Fulfillment Log Audit' },
                  { id: 'low_stock', label: 'Low Stock Deficit Report' },
                  { id: 'durable_returns', label: 'Durable Equipment Returns' }
                ].map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setSecondaryType(sub.id as any)
                      setSecondaryPage(1)
                    }}
                    className={`text-[11px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer border ${
                      secondaryType === sub.id
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 font-bold'
                        : 'bg-background/40 border-border/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-card overflow-hidden rounded-xl border border-border bg-card shadow-sm p-4 space-y-3">
              <div className="overflow-x-auto text-xs">
                {secondaryType === 'fulfillment_history' && (
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
                      {paginatedSecondary.length === 0 ? (
                        <tr><td colSpan={7} className="p-6 text-center text-muted-foreground italic">No fulfillment history logs match criteria.</td></tr>
                      ) : (
                        paginatedSecondary.map(h => {
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

                {secondaryType === 'low_stock' && (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                        <th className="p-3">Item Name</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Unit</th>
                        <th className="p-3 text-right">Current Stock</th>
                        <th className="p-3 text-right">Low Stock Threshold</th>
                        <th className="p-3 text-right">Deficit Shortfall</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-foreground">
                      {paginatedSecondary.length === 0 ? (
                        <tr><td colSpan={6} className="p-6 text-center text-emerald-400 font-semibold italic">✓ All inventory items are optimal. No low-stock deficits recorded!</td></tr>
                      ) : (
                        paginatedSecondary.map(item => {
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
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                )}

                {secondaryType === 'durable_returns' && (
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-foreground">
                      {paginatedSecondary.length === 0 ? (
                        <tr><td colSpan={7} className="p-6 text-center text-muted-foreground italic">No durable return records match criteria.</td></tr>
                      ) : (
                        paginatedSecondary.map(r => (
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
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider animate-pulse inline-flex items-center gap-1">
                                  <Truck className="w-3 h-3" /> Return Initiated
                                </span>
                              ) : r.return_status === 'returned_damaged' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase tracking-wider inline-flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> Returned Damaged
                                </span>
                              ) : r.return_status === 'lost' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider inline-flex items-center gap-1">
                                  <XCircle className="w-3 h-3" /> Lost / Missing
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> Outstanding
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Section 3 Pagination */}
              <DataTablePagination
                currentPage={secondaryPage}
                totalPages={Math.ceil(filteredSecondary.length / secondaryPageSize)}
                totalItems={filteredSecondary.length}
                pageSize={secondaryPageSize}
                onPageChange={setSecondaryPage}
                onPageSizeChange={setSecondaryPageSize}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
