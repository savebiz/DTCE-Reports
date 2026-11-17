import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { getAdminClient } from '@/utils/supabase/admin'
import { getCurrentEvent, isPreEventNeedsEnabled } from '@/lib/events/current-event'
import {
  getNeedTypeMeta,
  isStoreSupply,
  normalizeNeedType,
  type NeedType,
  type NonStoreStatus,
} from '@/lib/needs/need-types'

export const dynamic = 'force-dynamic'

export interface NonStoreItemRow {
  requestId: string
  itemIndex: number
  departmentId: string
  departmentName: string
  requestStatus: string
  createdAt: string
  name: string
  quantity: number
  approvedQuantity: number
  unit: string
  needType: NeedType
  needTypeLabel: string
  nonStoreStatus: NonStoreStatus
  assignedTo: string
  actionNote: string
}

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const admin = getAdminClient()
  const event = await getCurrentEvent(admin)
  if (!event) {
    return NextResponse.json({ event: null, items: [], canManage: false })
  }
  if (!isPreEventNeedsEnabled(event)) {
    return NextResponse.json({ error: 'Pre-event needs lists are disabled for this event.', disabled: true }, { status: 403 })
  }

  const canManage = ADMIN_ROLES.includes(auth.ctx.role)

  let reqQuery = admin
    .from('store_requests')
    .select('id, department_id, items_json, status, created_at, department:departments(id, name)')
    .eq('event_id', event.id)
    .eq('request_type', 'pre_event')
    .order('created_at', { ascending: false })

  // Non-admins only see their own department's non-store items
  if (!canManage) {
    const { data: memberships } = await admin
      .from('hod_assignments')
      .select('department_id')
      .eq('profile_id', auth.ctx.userId)
      .eq('event_id', event.id)
    const deptIds = (memberships || []).map((m: any) => m.department_id).filter(Boolean)
    if (deptIds.length === 0) {
      return NextResponse.json({
        event: { id: event.id, name: event.name },
        items: [],
        canManage,
      })
    }
    reqQuery = reqQuery.in('department_id', deptIds)
  }

  const { data: requests, error } = await reqQuery
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows: NonStoreItemRow[] = []
  for (const r of (requests || []) as any[]) {
    if (r.status === 'declined') continue
    const deptObj = Array.isArray(r.department) ? r.department[0] : r.department
    const deptName = deptObj?.name || 'Department'
    const itemsArr = Array.isArray(r.items_json) ? r.items_json : []

    itemsArr.forEach((it: any, idx: number) => {
      if (isStoreSupply(it?.need_type)) return
      const needType = normalizeNeedType(it.need_type)
      const meta = getNeedTypeMeta(needType)
      const statusRaw = it?.non_store_status
      const nonStoreStatus: NonStoreStatus =
        statusRaw === 'in_progress' || statusRaw === 'resolved' ? statusRaw : 'pending'

      rows.push({
        requestId: r.id,
        itemIndex: idx,
        departmentId: r.department_id,
        departmentName: deptName,
        requestStatus: r.status,
        createdAt: r.created_at,
        name: String(it?.name || 'Item'),
        quantity: Number(it?.requested_quantity ?? it?.quantity) || 0,
        approvedQuantity: Number(it?.approved_quantity ?? it?.quantity) || 0,
        unit: String(it?.unit || 'pcs'),
        needType,
        needTypeLabel: meta.shortLabel,
        nonStoreStatus,
        assignedTo: String(it?.assigned_to || meta.defaultAssignee),
        actionNote: String(it?.action_note || ''),
      })
    })
  }

  return NextResponse.json({
    event: { id: event.id, name: event.name },
    items: rows,
    canManage,
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth({ roles: ADMIN_ROLES })
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { requestId, itemIndex, nonStoreStatus, assignedTo, actionNote } = body || {}

  if (!requestId || typeof itemIndex !== 'number' || itemIndex < 0) {
    return NextResponse.json({ error: 'requestId and valid itemIndex are required.' }, { status: 400 })
  }

  const admin = getAdminClient()
  const event = await getCurrentEvent(admin)
  if (!isPreEventNeedsEnabled(event)) {
    return NextResponse.json({ error: 'Pre-event needs lists are disabled for this event.', disabled: true }, { status: 403 })
  }
  const { data: reqRow, error: fetchErr } = await admin
    .from('store_requests')
    .select('id, items_json')
    .eq('id', requestId)
    .single()

  if (fetchErr || !reqRow) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  }

  const items = Array.isArray(reqRow.items_json) ? [...reqRow.items_json] : []
  if (itemIndex >= items.length) {
    return NextResponse.json({ error: 'Item index out of range.' }, { status: 400 })
  }

  const validStatus: NonStoreStatus =
    nonStoreStatus === 'in_progress' || nonStoreStatus === 'resolved' ? nonStoreStatus : 'pending'

  items[itemIndex] = {
    ...items[itemIndex],
    non_store_status: validStatus,
    assigned_to: typeof assignedTo === 'string' ? assignedTo.trim() : items[itemIndex]?.assigned_to,
    action_note: typeof actionNote === 'string' ? actionNote.trim() : items[itemIndex]?.action_note,
    updated_at: new Date().toISOString(),
  }

  const { error: updateErr } = await admin
    .from('store_requests')
    .update({ items_json: items })
    .eq('id', requestId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
