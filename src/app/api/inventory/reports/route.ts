import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'
import { isMock } from '@/utils/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

/**
 * GET /api/inventory/reports
 * High-performance server-side aggregated inventory reports.
 *
 * Query Params:
 * - reportType: 'stock_summary' | 'fulfillment_history' | 'low_stock' | 'department_consumption'
 * - startDate: ISO string (optional)
 * - endDate: ISO string (optional)
 * - itemIds: comma-separated UUIDs (optional)
 * - deptIds: comma-separated UUIDs (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('reportType') || 'stock_summary'
    const startDate = searchParams.get('startDate') || null
    const endDate = searchParams.get('endDate') || null
    const itemIdsParam = searchParams.get('itemIds') || ''
    const deptIdsParam = searchParams.get('deptIds') || ''

    const itemIds = itemIdsParam ? itemIdsParam.split(',').filter(Boolean) : []
    const deptIds = deptIdsParam ? deptIdsParam.split(',').filter(Boolean) : []

    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      supabaseUrl,
      anonKey,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      }
    )

    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (isMock) {
      const { store: mockStore } = require('@/utils/supabase/mockClient')
      const items = mockStore.inventoryItems || []
      const transactions = mockStore.inventoryTransactions || []
      const reqs = mockStore.storeRequests || []
      const depts = mockStore.departments || mockStore.mockDepartments || []

      if (reportType === 'stock_summary') {
        let filtered = items
        if (itemIds.length > 0) filtered = filtered.filter((i: any) => itemIds.includes(i.id))
        
        const summary = filtered.map((i: any) => {
          const itemTrans = transactions.filter((t: any) => t.inventory_item_id === i.id)
          const restocked = itemTrans.filter((t: any) => t.transaction_type === 'restock').reduce((acc: number, t: any) => acc + (t.quantity_change || 0), 0)
          const fulfilled = Math.abs(itemTrans.filter((t: any) => t.transaction_type === 'fulfillment_deduction').reduce((acc: number, t: any) => acc + (t.quantity_change || 0), 0))
          
          return {
            id: i.id,
            name: i.name,
            category: i.category,
            unit: i.unit,
            current_stock: i.current_stock,
            low_stock_threshold: i.low_stock_threshold,
            is_low_stock: i.current_stock <= i.low_stock_threshold,
            total_restocked: restocked,
            total_fulfilled: fulfilled
          }
        })
        return NextResponse.json({ reportType, data: summary })
      }

      if (reportType === 'low_stock') {
        const lowStockItems = items
          .filter((i: any) => i.current_stock <= i.low_stock_threshold)
          .filter((i: any) => itemIds.length === 0 || itemIds.includes(i.id))
          .map((i: any) => ({
            id: i.id,
            name: i.name,
            category: i.category,
            unit: i.unit,
            current_stock: i.current_stock,
            low_stock_threshold: i.low_stock_threshold,
            shortfall: Math.max(0, i.low_stock_threshold - i.current_stock)
          }))
        return NextResponse.json({ reportType, data: lowStockItems })
      }

      if (reportType === 'department_consumption') {
        const map = new Map<string, any>()

        const fulfillmentTrans = transactions.filter((t: any) => t.transaction_type === 'fulfillment_deduction')

        for (const t of fulfillmentTrans) {
          if (startDate && new Date(t.created_at) < new Date(startDate)) continue
          if (endDate && new Date(t.created_at) > new Date(endDate)) continue
          if (itemIds.length > 0 && !itemIds.includes(t.inventory_item_id)) continue

          const req = reqs.find((r: any) => r.id === t.related_requisition_id)
          const deptId = req?.department_id || 'dept-1'
          if (deptIds.length > 0 && !deptIds.includes(deptId)) continue

          const deptObj = depts.find((d: any) => d.id === deptId)
          const deptName = deptObj?.name || 'Department'
          const itemObj = items.find((i: any) => i.id === t.inventory_item_id)
          const itemName = itemObj?.name || 'Item'
          const unit = itemObj?.unit || 'pcs'

          const key = `${deptId}_${t.inventory_item_id}`
          if (!map.has(key)) {
            map.set(key, {
              department_id: deptId,
              department_name: deptName,
              item_id: t.inventory_item_id,
              item_name: itemName,
              unit,
              total_fulfilled_qty: 0,
              fulfillment_count: 0
            })
          }

          const existing = map.get(key)
          existing.total_fulfilled_qty += Math.abs(t.quantity_change || 0)
          existing.fulfillment_count += 1
        }

        const result = Array.from(map.values()).sort((a, b) => b.total_fulfilled_qty - a.total_fulfilled_qty)
        return NextResponse.json({ reportType, data: result })
      }

      if (reportType === 'fulfillment_history') {
        let history = transactions.map((t: any) => {
          const req = reqs.find((r: any) => r.id === t.related_requisition_id)
          const deptId = req?.department_id || null
          const deptObj = depts.find((d: any) => d.id === deptId)
          const itemObj = items.find((i: any) => i.id === t.inventory_item_id)

          return {
            id: t.id,
            timestamp: t.created_at,
            transaction_type: t.transaction_type,
            quantity_change: t.quantity_change,
            resulting_stock_level: t.resulting_stock_level,
            note: t.note,
            item_id: t.inventory_item_id,
            item_name: itemObj?.name || 'Inventory Item',
            unit: itemObj?.unit || 'pcs',
            department_id: deptId,
            department_name: deptObj?.name || (t.transaction_type === 'restock' ? 'Central Stores' : 'General Department')
          }
        })

        if (startDate) history = history.filter(h => new Date(h.timestamp) >= new Date(startDate))
        if (endDate) history = history.filter(h => new Date(h.timestamp) <= new Date(endDate))
        if (itemIds.length > 0) history = history.filter(h => itemIds.includes(h.item_id))
        if (deptIds.length > 0) history = history.filter(h => h.department_id && deptIds.includes(h.department_id))

        return NextResponse.json({ reportType, data: history })
      }
    }

    // --- Production Live Supabase Execution via Server-Side RPC Functions ---
    const supabaseAdmin = getAdminClient()

    if (reportType === 'stock_summary') {
      const { data, error } = await supabaseAdmin.rpc('get_inventory_stock_summary')
      if (error) {
        // Fallback server query
        const { data: rawItems } = await supabaseAdmin.from('inventory_items').select('*').order('name', { ascending: true })
        let filtered = rawItems || []
        if (itemIds.length > 0) filtered = filtered.filter(i => itemIds.includes(i.id))
        return NextResponse.json({ reportType, data: filtered })
      }
      let result = data || []
      if (itemIds.length > 0) result = result.filter((i: any) => itemIds.includes(i.id))
      return NextResponse.json({ reportType, data: result })
    }

    if (reportType === 'low_stock') {
      const { data, error } = await supabaseAdmin.rpc('get_inventory_stock_summary', { p_only_low_stock: true })
      if (error) {
        const { data: rawItems } = await supabaseAdmin.from('inventory_items').select('*')
        const filtered = (rawItems || []).filter(i => i.current_stock <= i.low_stock_threshold)
        return NextResponse.json({ reportType, data: filtered })
      }
      let result = data || []
      if (itemIds.length > 0) result = result.filter((i: any) => itemIds.includes(i.id))
      return NextResponse.json({ reportType, data: result })
    }

    if (reportType === 'department_consumption') {
      const { data, error } = await supabaseAdmin.rpc('get_inventory_department_consumption', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_dept_ids: deptIds.length > 0 ? deptIds : null,
        p_item_ids: itemIds.length > 0 ? itemIds : null
      })

      if (error) {
        // Fallback join query
        const { data: rawTrans } = await supabaseAdmin
          .from('inventory_transactions')
          .select(`
            id, quantity_change, created_at, inventory_item_id,
            item:inventory_items(name, unit),
            requisition:store_requests(department:departments(id, name))
          `)
          .eq('transaction_type', 'fulfillment_deduction')

        return NextResponse.json({ reportType, data: rawTrans || [] })
      }

      return NextResponse.json({ reportType, data: data || [] })
    }

    if (reportType === 'fulfillment_history') {
      let query = supabaseAdmin
        .from('inventory_transactions')
        .select(`
          id,
          transaction_type,
          quantity_change,
          resulting_stock_level,
          note,
          created_at,
          item:inventory_items(id, name, unit),
          requisition:store_requests(department:departments(id, name))
        `)
        .order('created_at', { ascending: false })

      if (startDate) query = query.gte('created_at', startDate)
      if (endDate) query = query.lte('created_at', endDate)

      const { data: rawTrans, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      let history = (rawTrans || []).map((t: any) => ({
        id: t.id,
        timestamp: t.created_at,
        transaction_type: t.transaction_type,
        quantity_change: t.quantity_change,
        resulting_stock_level: t.resulting_stock_level,
        note: t.note,
        item_id: t.item?.id || '',
        item_name: t.item?.name || 'Item',
        unit: t.item?.unit || 'pcs',
        department_id: t.requisition?.department?.id || null,
        department_name: t.requisition?.department?.name || (t.transaction_type === 'restock' ? 'Central Stores' : 'General Department')
      }))

      if (itemIds.length > 0) history = history.filter(h => itemIds.includes(h.item_id))
      if (deptIds.length > 0) history = history.filter(h => h.department_id && deptIds.includes(h.department_id))

      return NextResponse.json({ reportType, data: history })
    }

    return NextResponse.json({ error: 'Invalid reportType requested' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
