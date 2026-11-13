import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { getCurrentEvent } from '@/lib/events/current-event'

/**
 * GET  /api/needs/market-list
 *   Consolidated Pre-Event Market List of what departments need bought at the
 *   market before the event starts, summed per item, plus rich pre-event
 *   analytics and per-department submission/approval summary for the Gen Sec,
 *   National Coordinator, Secretariat, and Stores.
 *
 * POST /api/needs/market-list
 *   1) Default: Stores records the market trip (batch), quantity bought and
 *      quantity received for one consolidated item.
 *   2) action === 'stock_to_inventory': Seamless link from Market List to
 *      Central Stores Inventory — pushes received market items into
 *      `inventory_items` (creating new catalog items or restocking existing
 *      ones) so they are ready in the store when the event starts.
 */

const APPROVED_STATUSES = ['approved', 'in_progress', 'partially_fulfilled', 'ready_for_collection', 'delivered']

interface ReqItem {
  inventory_item_id?: string | null
  name?: string
  unit?: string
  category?: string
  quantity?: number
  requested_quantity?: number
  approved_quantity?: number
}

interface ConsolidatedItem {
  key: string
  inventoryItemId: string | null
  name: string
  unit: string
  category: string
  requested: number
  approved: number
  awaiting: number
  departments: Record<string, { requested: number; approved: number; status: string }>
}

function itemKey(it: ReqItem): string {
  if (it.inventory_item_id) return String(it.inventory_item_id)
  return `name:${String(it.name || '').trim().toLowerCase()}`
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth({ roles: ADMIN_ROLES, allowStoresStaff: true, allowFinanceStaff: true })
  if (!auth.ok) return auth.response
  const isFinanceView = auth.ctx.isFinanceStaff && !ADMIN_ROLES.includes(auth.ctx.role) && !auth.ctx.isStoresStaff

  const type = request.nextUrl.searchParams.get('type') || 'pre_event'
  const admin = getAdminClient()
  const event = await getCurrentEvent(admin)
  if (!event) return NextResponse.json({ error: 'No current event.' }, { status: 400 })

  let reqQuery = admin
    .from('store_requests')
    .select('id, department_id, status, items_json, created_at, request_type, reviewer_comments')
    .eq('event_id', event.id)
  if (isFinanceView) {
    reqQuery = reqQuery.in('status', APPROVED_STATUSES)
  }
  if (type === 'pre_event' || type === 'during_event') {
    reqQuery = reqQuery.eq('request_type', type)
  }

  const [{ data: requests }, { data: departments }, { data: entries }, { data: assignments }, { data: invItems }, { data: marketTxns }] = await Promise.all([
    reqQuery.order('created_at', { ascending: false }),
    admin.from('departments').select('id, name').order('name', { ascending: true }),
    admin.from('market_list_entries').select('*').eq('event_id', event.id),
    admin
      .from('hod_assignments')
      .select('department_id, role_in_event, profile:profiles(full_name)')
      .eq('event_id', event.id),
    admin.from('inventory_items').select('id, name, unit, category, current_stock, reserved_stock'),
    admin
      .from('inventory_transactions')
      .select('inventory_item_id, quantity_change, note')
      .eq('transaction_type', 'restock')
      .ilike('note', `%[MARKET:${event.id}:%`),
  ])

  const deptName: Record<string, string> = {}
  for (const d of departments || []) deptName[d.id] = d.name

  // Map inventory items by ID and lowercased name for seamless stock linking
  const invById: Record<string, { id: string; name: string; unit: string; category: string; current_stock: number; reserved_stock?: number | null }> = {}
  const invByName: Record<string, { id: string; name: string; unit: string; category: string; current_stock: number; reserved_stock?: number | null }> = {}
  for (const inv of invItems || []) {
    invById[inv.id] = inv
    invByName[String(inv.name || '').trim().toLowerCase()] = inv
  }

  // Track how many units of each market item key have already been stocked into inventory for this event
  const stockedByKey: Record<string, number> = {}
  const markerPrefix = `[MARKET:${event.id}:`
  for (const tx of marketTxns || []) {
    const noteStr = String(tx.note || '')
    const startIdx = noteStr.indexOf(markerPrefix)
    if (startIdx !== -1) {
      const endIdx = noteStr.indexOf(']', startIdx)
      if (endIdx !== -1) {
        const key = noteStr.slice(startIdx + markerPrefix.length, endIdx)
        stockedByKey[key] = (stockedByKey[key] || 0) + (Number(tx.quantity_change) || 0)
      }
    }
  }

  // Departments with a team for this event
  const deptsWithTeam = new Set<string>()
  const hodByDept: Record<string, string> = {}
  for (const a of (assignments || []) as { department_id: string; role_in_event: string; profile: { full_name: string | null } | { full_name: string | null }[] | null }[]) {
    if (!a.department_id) continue
    deptsWithTeam.add(a.department_id)
    const p = Array.isArray(a.profile) ? a.profile[0] : a.profile
    if (a.role_in_event === 'hod' && p?.full_name && !hodByDept[a.department_id]) hodByDept[a.department_id] = p.full_name
  }

  const entryByKey: Record<string, { batch: number | null; qty_bought: number; qty_received: number; stocked_qty?: number | null; unit_cost?: number | null; supplier_name?: string | null; receipt_ref?: string | null; note: string | null }> = {}
  for (const e of entries || []) entryByKey[e.item_key] = e

  // Consolidate quantities and build per-department analytics
  const items: Record<string, ConsolidatedItem> = {}
  const deptSummary: Record<string, {
    submitted: number
    pending: number
    approved: number
    declined: number
    totalItemsCount: number
    totalUnitsRequested: number
    totalUnitsApproved: number
    latestRequestId: string | null
    latestSubmittedAt: string | null
  }> = {}

  for (const r of requests || []) {
    const s = (deptSummary[r.department_id] ||= {
      submitted: 0,
      pending: 0,
      approved: 0,
      declined: 0,
      totalItemsCount: 0,
      totalUnitsRequested: 0,
      totalUnitsApproved: 0,
      latestRequestId: r.id,
      latestSubmittedAt: r.created_at,
    })
    s.submitted += 1
    if (!s.latestRequestId) {
      s.latestRequestId = r.id
      s.latestSubmittedAt = r.created_at
    }
    const isApproved = APPROVED_STATUSES.includes(r.status)
    if (r.status === 'pending_coordinator') s.pending += 1
    else if (r.status === 'declined') s.declined += 1
    else if (isApproved) s.approved += 1

    if (r.status === 'declined') continue
    for (const it of (r.items_json || []) as ReqItem[]) {
      const matchedInv = (it.inventory_item_id && invById[it.inventory_item_id]) || invByName[String(it.name || '').trim().toLowerCase()] || null
      const key = matchedInv ? matchedInv.id : itemKey(it)
      const row = (items[key] ||= {
        key,
        inventoryItemId: matchedInv?.id || it.inventory_item_id || null,
        name: matchedInv?.name || it.name || 'Item',
        unit: matchedInv?.unit || it.unit || 'pcs',
        category: matchedInv?.category || it.category || 'consumable',
        requested: 0,
        approved: 0,
        awaiting: 0,
        departments: {},
      })
      const requested = Number(it.requested_quantity ?? it.quantity) || 0
      const approved = Number(it.approved_quantity ?? it.quantity) || 0

      s.totalItemsCount += 1
      s.totalUnitsRequested += requested
      row.requested += requested

      const deptEntry = (row.departments[r.department_id] ||= { requested: 0, approved: 0, status: r.status })
      deptEntry.requested += requested

      if (isApproved) {
        row.approved += approved
        s.totalUnitsApproved += approved
        deptEntry.approved += approved
        deptEntry.status = 'approved'
      } else {
        row.awaiting += requested
      }
    }
  }

  const rows = Object.values(items)
    .map((row) => {
      const entry = entryByKey[row.key] || entryByKey[`name:${row.name.trim().toLowerCase()}`]
      const matchedInv = (row.inventoryItemId && invById[row.inventoryItemId]) || invByName[row.name.trim().toLowerCase()] || null
      const stockedQty = Math.max(Number(entry?.stocked_qty) || 0, stockedByKey[row.key] || 0)
      const unitCost = entry?.unit_cost != null ? Number(entry.unit_cost) : null
      return {
        key: row.key,
        inventoryItemId: matchedInv?.id || row.inventoryItemId || null,
        name: row.name,
        unit: row.unit,
        category: row.category,
        requested: row.requested,
        approved: row.approved,
        awaiting: row.awaiting,
        currentStoreStock: matchedInv?.current_stock ?? 0,
        reservedStock: matchedInv?.reserved_stock ?? 0,
        stockedFromMarket: stockedQty,
        departments: Object.entries(row.departments).map(([id, d]) => ({
          id,
          name: deptName[id] || 'Department',
          qty: d.approved || d.requested,
          requestedQty: d.requested,
          approvedQty: d.approved,
          status: d.status,
        })),
        batch: entry?.batch ?? null,
        qtyBought: entry?.qty_bought ?? 0,
        qtyReceived: entry?.qty_received ?? 0,
        unitCost,
        supplierName: entry?.supplier_name ?? '',
        receiptRef: entry?.receipt_ref ?? '',
        note: entry?.note ?? '',
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const visibleDepts = (departments || []).filter((d: { id: string }) =>
    isFinanceView ? !!deptSummary[d.id] : (deptsWithTeam.size === 0 || deptsWithTeam.has(d.id) || !!deptSummary[d.id]))
  const deptRows = visibleDepts.map((d: { id: string; name: string }) => ({
    id: d.id,
    name: d.name,
    hod: hodByDept[d.id] || null,
    ...(deptSummary[d.id] || {
      submitted: 0,
      pending: 0,
      approved: 0,
      declined: 0,
      totalItemsCount: 0,
      totalUnitsRequested: 0,
      totalUnitsApproved: 0,
      latestRequestId: null,
      latestSubmittedAt: null,
    }),
  }))

  const analytics = {
    totalDepartments: deptRows.length,
    departmentsSubmitted: deptRows.filter(d => d.submitted > 0).length,
    departmentsNotSubmitted: deptRows.filter(d => d.submitted === 0).length,
    departmentsPendingApproval: deptRows.filter(d => d.pending > 0).length,
    departmentsApproved: deptRows.filter(d => d.approved > 0 && d.pending === 0).length,
    totalDistinctItems: rows.length,
    totalUnitsRequested: rows.reduce((sum, r) => sum + r.requested, 0),
    totalUnitsApproved: rows.reduce((sum, r) => sum + r.approved, 0),
    totalUnitsAwaiting: rows.reduce((sum, r) => sum + r.awaiting, 0),
    totalUnitsBought: rows.reduce((sum, r) => sum + r.qtyBought, 0),
    totalUnitsReceived: rows.reduce((sum, r) => sum + r.qtyReceived, 0),
    totalUnitsStocked: rows.reduce((sum, r) => sum + r.stockedFromMarket, 0),
    totalActualSpend: rows.reduce((sum, r) => sum + (r.unitCost ? r.unitCost * r.qtyBought : 0), 0),
  }

  return NextResponse.json({
    event: {
      id: event.id,
      name: event.name,
      status: event.status ?? null,
      requisitionClosesAt: event.requisition_closes_at ?? null,
    },
    isFinanceView,
    canEdit: auth.ctx.role === 'super_admin' || auth.ctx.isStoresStaff,
    canApprove: auth.ctx.role === 'super_admin' || auth.ctx.role === 'national_coordinator',
    analytics,
    items: rows,
    departments: deptRows,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const canEdit = auth.ctx.role === 'super_admin' || (auth.ctx.role === 'hod' && auth.ctx.isStoresStaff) || auth.ctx.isStoresStaff
  if (!canEdit) {
    return NextResponse.json({ error: 'Only Stores staff or a Super Admin can update the market list.' }, { status: 403 })
  }

  const body = await request.json()
  const admin = getAdminClient()
  const event = await getCurrentEvent(admin)
  if (!event) return NextResponse.json({ error: 'No current event.' }, { status: 400 })

  // Action: Seamless Link — Stock Received Market Items into Central Stores Inventory (`inventory_items`)
  if (body.action === 'stock_to_inventory') {
    const targetItems: Array<{
      key: string
      name: string
      unit?: string
      category?: string
      qtyReceived: number
    }> = Array.isArray(body.items) ? body.items : []

    if (targetItems.length === 0) {
      return NextResponse.json({ error: 'No received items provided to stock.' }, { status: 400 })
    }

    const [{ data: invItems }, { data: marketEntries }, { data: marketTxns }] = await Promise.all([
      admin.from('inventory_items').select('*'),
      admin.from('market_list_entries').select('item_key, stocked_qty').eq('event_id', event.id),
      admin
        .from('inventory_transactions')
        .select('inventory_item_id, quantity_change, note')
        .eq('transaction_type', 'restock')
        .ilike('note', `%[MARKET:${event.id}:%`),
    ])

    const invById: Record<string, any> = {}
    const invByName: Record<string, any> = {}
    for (const inv of invItems || []) {
      invById[inv.id] = inv
      invByName[String(inv.name || '').trim().toLowerCase()] = inv
    }

    const stockedByKey: Record<string, number> = {}
    for (const me of marketEntries || []) {
      stockedByKey[me.item_key] = Number(me.stocked_qty) || 0
    }
    const markerPrefix = `[MARKET:${event.id}:`
    for (const tx of marketTxns || []) {
      const noteStr = String(tx.note || '')
      const startIdx = noteStr.indexOf(markerPrefix)
      if (startIdx !== -1) {
        const endIdx = noteStr.indexOf(']', startIdx)
        if (endIdx !== -1) {
          const k = noteStr.slice(startIdx + markerPrefix.length, endIdx)
          if (!(k in stockedByKey) || stockedByKey[k] === 0) {
            stockedByKey[k] = (stockedByKey[k] || 0) + (Number(tx.quantity_change) || 0)
          }
        }
      }
    }

    let stockedCount = 0
    let totalUnitsAdded = 0

    for (const item of targetItems) {
      const received = Math.max(0, Math.floor(Number(item.qtyReceived) || 0))
      const alreadyStocked = stockedByKey[item.key] || 0
      const deltaToStock = received - alreadyStocked
      if (deltaToStock <= 0) continue

      const lowerName = String(item.name || '').trim().toLowerCase()
      let invItem = invById[item.key] || invByName[lowerName]

      if (!invItem) {
        // Create catalog item with 0 stock first, then restock atomically via RPC
        const cleanCategory = item.category === 'durable' ? 'durable' : 'consumable'
        const codePrefix = cleanCategory === 'durable' ? 'DUR' : 'CON'
        const autoCode = `${codePrefix}-${Date.now().toString().slice(-4)}-${Math.floor(10 + Math.random() * 89)}`

        const { data: created, error: createErr } = await admin
          .from('inventory_items')
          .insert({
            name: item.name.trim(),
            item_code: autoCode,
            category: cleanCategory,
            unit: (item.unit || 'pcs').trim(),
            current_stock: 0,
            low_stock_threshold: 5,
          })
          .select()
          .single()

        if (createErr || !created) continue
        invItem = created
        invById[created.id] = created
        invByName[lowerName] = created
      }

      const { data: rpcRes, error: rpcErr } = await admin.rpc('process_inventory_restock', {
        p_item_id: invItem.id,
        p_restock_quantity: deltaToStock,
        p_performed_by: auth.ctx.userId,
        p_note: `Stocked from ${event.name} Market List [MARKET:${event.id}:${item.key}]`,
      })

      if (!rpcErr && rpcRes) {
        invItem.current_stock = rpcRes.new_stock
        const newStockedTotal = alreadyStocked + deltaToStock
        stockedByKey[item.key] = newStockedTotal

        await admin
          .from('market_list_entries')
          .upsert(
            {
              event_id: event.id,
              item_key: item.key,
              item_name: item.name,
              unit: item.unit || null,
              stocked_qty: newStockedTotal,
              updated_by: auth.ctx.userId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'event_id,item_key' }
          )

        stockedCount += 1
        totalUnitsAdded += deltaToStock
      }
    }

    return NextResponse.json({
      success: true,
      stockedCount,
      totalUnitsAdded,
    })
  }

  // Default action: Save Market Trip (batch), Quantity Bought, Quantity Received, Costing, and Note
  const { key, name, unit, batch, qtyBought, qtyReceived, unitCost, supplierName, receiptRef, note } = body as {
    key?: string; name?: string; unit?: string; batch?: number | null
    qtyBought?: number; qtyReceived?: number; unitCost?: number | null
    supplierName?: string; receiptRef?: string; note?: string
  }
  if (!key || !name) return NextResponse.json({ error: 'key and name are required.' }, { status: 400 })

  const bought = Math.max(0, Math.floor(Number(qtyBought) || 0))
  const received = Math.max(0, Math.floor(Number(qtyReceived) || 0))
  const cost = unitCost !== undefined && unitCost !== null && String(unitCost) !== ''
    ? Math.max(0, Number(unitCost) || 0)
    : null
  const batchNo = batch == null || Number.isNaN(Number(batch)) ? null : Math.floor(Number(batch))
  if (batchNo !== null && (batchNo < 1 || batchNo > 9)) {
    return NextResponse.json({ error: 'Batch must be between 1 and 9.' }, { status: 400 })
  }

  const { error } = await admin.from('market_list_entries').upsert(
    {
      event_id: event.id,
      item_key: key,
      item_name: name,
      unit: unit || null,
      batch: batchNo,
      qty_bought: bought,
      qty_received: received,
      unit_cost: cost,
      supplier_name: supplierName?.slice(0, 120) || null,
      receipt_ref: receiptRef?.slice(0, 120) || null,
      note: note?.slice(0, 500) || null,
      updated_by: auth.ctx.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'event_id,item_key' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
