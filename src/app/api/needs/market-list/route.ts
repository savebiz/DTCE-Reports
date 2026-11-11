import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { getCurrentEvent } from '@/lib/events/current-event'

/**
 * GET  /api/needs/market-list?type=pre_event|during_event|all
 *   Consolidated list of what departments need, summed per item, plus a
 *   per-department submission/approval summary. Admins and Stores staff.
 *
 * POST /api/needs/market-list
 *   Stores records the market trip (batch), quantity bought and quantity
 *   received for one consolidated item. Stores staff and Super Admin only.
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
  name: string
  unit: string
  category: string
  approved: number
  awaiting: number
  departments: Record<string, number>
}

function itemKey(it: ReqItem): string {
  if (it.inventory_item_id) return String(it.inventory_item_id)
  return `name:${String(it.name || '').trim().toLowerCase()}`
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth({ roles: ADMIN_ROLES, allowStoresStaff: true })
  if (!auth.ok) return auth.response

  const type = request.nextUrl.searchParams.get('type') || 'pre_event'
  const admin = getAdminClient()
  const event = await getCurrentEvent(admin)
  if (!event) return NextResponse.json({ error: 'No current event.' }, { status: 400 })

  let reqQuery = admin
    .from('store_requests')
    .select('id, department_id, status, items_json, created_at, request_type')
    .eq('event_id', event.id)
  if (type === 'pre_event' || type === 'during_event') reqQuery = reqQuery.eq('request_type', type)
  const [{ data: requests }, { data: departments }, { data: entries }, { data: assignments }] = await Promise.all([
    reqQuery,
    admin.from('departments').select('id, name').order('name', { ascending: true }),
    admin.from('market_list_entries').select('*').eq('event_id', event.id),
    admin
      .from('hod_assignments')
      .select('department_id, role_in_event, profile:profiles(full_name)')
      .eq('event_id', event.id),
  ])

  const deptName: Record<string, string> = {}
  for (const d of departments || []) deptName[d.id] = d.name

  // Departments with a team for this event (merged or retired departments have none)
  const deptsWithTeam = new Set<string>()
  const hodByDept: Record<string, string> = {}
  for (const a of (assignments || []) as { department_id: string; role_in_event: string; profile: { full_name: string | null } | { full_name: string | null }[] | null }[]) {
    if (!a.department_id) continue
    deptsWithTeam.add(a.department_id)
    const p = Array.isArray(a.profile) ? a.profile[0] : a.profile
    if (a.role_in_event === 'hod' && p?.full_name && !hodByDept[a.department_id]) hodByDept[a.department_id] = p.full_name
  }

  const entryByKey: Record<string, { batch: number | null; qty_bought: number; qty_received: number; note: string | null }> = {}
  for (const e of entries || []) entryByKey[e.item_key] = e

  // Consolidate approved quantities, and track what is still awaiting approval
  const items: Record<string, ConsolidatedItem> = {}
  const deptSummary: Record<string, { submitted: number; pending: number; approved: number; declined: number }> = {}

  for (const r of requests || []) {
    const s = (deptSummary[r.department_id] ||= { submitted: 0, pending: 0, approved: 0, declined: 0 })
    s.submitted += 1
    const isApproved = APPROVED_STATUSES.includes(r.status)
    if (r.status === 'pending_coordinator') s.pending += 1
    else if (r.status === 'declined') s.declined += 1
    else if (isApproved) s.approved += 1

    if (r.status === 'declined') continue
    for (const it of (r.items_json || []) as ReqItem[]) {
      const key = itemKey(it)
      const row = (items[key] ||= {
        key,
        name: it.name || 'Item',
        unit: it.unit || 'pcs',
        category: it.category || 'consumable',
        approved: 0,
        awaiting: 0,
        departments: {},
      })
      const requested = Number(it.requested_quantity ?? it.quantity) || 0
      const approved = Number(it.approved_quantity ?? it.quantity) || 0
      if (isApproved) {
        row.approved += approved
        row.departments[r.department_id] = (row.departments[r.department_id] || 0) + approved
      } else {
        row.awaiting += requested
      }
    }
  }

  const rows = Object.values(items)
    .map((row) => {
      const entry = entryByKey[row.key]
      return {
        key: row.key,
        name: row.name,
        unit: row.unit,
        category: row.category,
        approved: row.approved,
        awaiting: row.awaiting,
        departments: Object.entries(row.departments).map(([id, qty]) => ({
          id,
          name: deptName[id] || 'Department',
          qty,
        })),
        batch: entry?.batch ?? null,
        qtyBought: entry?.qty_bought ?? 0,
        qtyReceived: entry?.qty_received ?? 0,
        note: entry?.note ?? '',
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // Show departments that have a team this event (or already sent something).
  // If no teams are set up yet for the event, show every department.
  const visibleDepts = (departments || []).filter((d: { id: string }) =>
    deptsWithTeam.size === 0 || deptsWithTeam.has(d.id) || !!deptSummary[d.id])
  const deptRows = visibleDepts.map((d: { id: string; name: string }) => ({
    id: d.id,
    name: d.name,
    hod: hodByDept[d.id] || null,
    ...(deptSummary[d.id] || { submitted: 0, pending: 0, approved: 0, declined: 0 }),
  }))

  return NextResponse.json({
    event: {
      id: event.id,
      name: event.name,
      status: event.status ?? null,
      requisitionClosesAt: event.requisition_closes_at ?? null,
    },
    canEdit: auth.ctx.role === 'super_admin' || auth.ctx.isStoresStaff,
    items: rows,
    departments: deptRows,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const canEdit = auth.ctx.role === 'super_admin' || (auth.ctx.role === 'hod' && auth.ctx.isStoresStaff)
  if (!canEdit) {
    return NextResponse.json({ error: 'Only the Stores HOD or a Super Admin can update the market list.' }, { status: 403 })
  }

  const body = await request.json()
  const { key, name, unit, batch, qtyBought, qtyReceived, note } = body as {
    key?: string; name?: string; unit?: string; batch?: number | null
    qtyBought?: number; qtyReceived?: number; note?: string
  }
  if (!key || !name) return NextResponse.json({ error: 'key and name are required.' }, { status: 400 })

  const bought = Math.max(0, Math.floor(Number(qtyBought) || 0))
  const received = Math.max(0, Math.floor(Number(qtyReceived) || 0))
  const batchNo = batch == null || Number.isNaN(Number(batch)) ? null : Math.floor(Number(batch))
  if (batchNo !== null && (batchNo < 1 || batchNo > 9)) {
    return NextResponse.json({ error: 'Batch must be between 1 and 9.' }, { status: 400 })
  }

  const admin = getAdminClient()
  const event = await getCurrentEvent(admin)
  if (!event) return NextResponse.json({ error: 'No current event.' }, { status: 400 })

  const { error } = await admin.from('market_list_entries').upsert(
    {
      event_id: event.id,
      item_key: key,
      item_name: name,
      unit: unit || null,
      batch: batchNo,
      qty_bought: bought,
      qty_received: received,
      note: note?.slice(0, 500) || null,
      updated_by: auth.ctx.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'event_id,item_key' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
