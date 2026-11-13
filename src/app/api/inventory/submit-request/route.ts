import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { notify, getDepartmentRecipientIds, getAdminRecipientIds } from '@/lib/notifications/dispatch'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { getCurrentEvent } from '@/lib/events/current-event'
import { evaluateRequisitionWindow } from '@/lib/events/requisition-windows'

/**
 * POST /api/inventory/submit-request
 * Atomic submission endpoint for:
 *  - Pre-Event Departmental Needs Lists (request_type = 'pre_event') — for Market Purchase
 *  - During-Event Store Requisitions (request_type = 'during_event') — from Stores Stock
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.response
    const user = { id: auth.ctx.userId }

    const { departmentId, items, requestType: rawType } = await request.json()
    const requestType: 'pre_event' | 'during_event' = rawType === 'pre_event' ? 'pre_event' : 'during_event'
    if (!departmentId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'departmentId and items array are required.' }, { status: 400 })
    }

    const supabaseAdmin = getAdminClient()

    // Requisitions always belong to the current event (decided here, not by the browser)
    const currentEvent = await getCurrentEvent(supabaseAdmin)
    const eventId = currentEvent?.id
    if (!eventId) {
      return NextResponse.json({ error: 'No current event is open for requisitions.' }, { status: 400 })
    }

    // Enforce time-window gating for both Pre-Event Needs Lists and Live Event Store Requisitions
    const windowState = evaluateRequisitionWindow(currentEvent, requestType)
    if (!windowState.isOpen) {
      return NextResponse.json({ error: windowState.message }, { status: 403 })
    }

    // P1 SKU Normalization: Live Event requisitions must reference catalog items in inventory_items
    if (requestType === 'during_event') {
      const uncatalogued = items.filter((it: any) => !it?.inventory_item_id)
      if (uncatalogued.length > 0) {
        const names = uncatalogued.map((it: any) => it?.name || 'Unknown item').join(', ')
        return NextResponse.json(
          {
            error: `Live Event Store Requisitions require cataloged inventory items. Please select a stocked item from the Stores catalog (or ask Stores to stock it first) for: ${names}`,
          },
          { status: 400 }
        )
      }
    }

    // Non-admins may only request for a department they are on the current event's team for
    if (!ADMIN_ROLES.includes(auth.ctx.role)) {
      const { data: memberships } = await supabaseAdmin
        .from('hod_assignments')
        .select('department_id')
        .eq('profile_id', user.id)
        .eq('department_id', departmentId)
        .eq('event_id', eventId)
        .limit(1)
      if (!memberships || memberships.length === 0) {
        return NextResponse.json({ error: 'You can only submit requests for your own department.' }, { status: 403 })
      }
    }

    // 1. Fetch Department Name
    const { data: dept } = await supabaseAdmin
      .from('departments')
      .select('name')
      .eq('id', departmentId)
      .maybeSingle()

    const deptName = dept?.name || 'Department'

    // 2. Insert Store Request
    const payload = {
      event_id: eventId,
      request_type: requestType,
      department_id: departmentId,
      requester_profile_id: user.id,
      items_json: items.map((it: any) => ({
        ...it,
        requested_quantity: Number(it.quantity) || 1,
        approved_quantity: Number(it.quantity) || 1
      })),
      status: 'pending_coordinator'
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('store_requests')
      .insert(payload)
      .select()
      .single()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    const requestId = inserted.id
    const itemsSummary = items.map((it: any) => `${it.quantity} ${it.unit || 'pcs'} ${it.name}`).join(', ')

    // 3. Dispatch Notification to General Secretary, National Coordinator & Executive Secretariat
    const adminIds = await getAdminRecipientIds(supabaseAdmin)
    for (const adminId of adminIds) {
      await notify({
        recipientId: adminId,
        type: 'requisition_submitted',
        title: requestType === 'pre_event' ? `New Pre-Event Needs List: ${deptName}` : `New Store Requisition: ${deptName}`,
        body: requestType === 'pre_event'
          ? `${deptName} submitted their pre-event needs list for market purchase (${itemsSummary}). Pending approval.`
          : `${deptName} submitted a live store requisition (${itemsSummary}). Pending your review and approval.`,
        relatedEntity: { type: 'requisition', id: requestId }
      })
    }

    // 4. Dispatch Notification to ALL members of the requesting department
    const deptMemberIds = await getDepartmentRecipientIds(supabaseAdmin, departmentId)
    for (const memberId of deptMemberIds) {
      await notify({
        recipientId: memberId,
        type: 'requisition_submitted',
        title: requestType === 'pre_event' ? `Needs List Sent: ${deptName}` : `Store Requisition Sent: ${deptName}`,
        body: requestType === 'pre_event'
          ? `Your department's pre-event needs list (${itemsSummary}) was sent to the General Secretary & National Coordinator for market purchase approval.`
          : `A store requisition for ${deptName} (${itemsSummary}) was submitted for approval.`,
        relatedEntity: { type: 'requisition', id: requestId }
      })
    }

    return NextResponse.json({ success: true, request: inserted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
