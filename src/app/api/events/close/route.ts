import { NextResponse } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { notify, getDepartmentRecipientIds } from '@/lib/notifications/dispatch'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { getCurrentEventId } from '@/lib/events/current-event'

/**
 * POST /api/events/close
 * - Admins: mark the event 'closed' and send durable-return reminders.
 * - Stores staff: send durable-return reminders only (the event stays open).
 * Body: { eventId?: string } — defaults to the current event.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ roles: ADMIN_ROLES, allowStoresStaff: true })
    if (!auth.ok) return auth.response
    const canCloseEvent = ADMIN_ROLES.includes(auth.ctx.role)

    const body = await request.json().catch(() => ({}))
    const supabaseAdmin = getAdminClient()

    // Old clients sent a placeholder id; anything that isn't a UUID means "current event".
    const isUuid = typeof body?.eventId === 'string' && /^[0-9a-f-]{36}$/i.test(body.eventId)
    const eventId = isUuid ? body.eventId : await getCurrentEventId(supabaseAdmin)

    if (!eventId) {
      return NextResponse.json({ error: 'No current event found.' }, { status: 400 })
    }

    // 1. Update event status to 'closed' (admins only)
    let updatedEvent: any = null
    if (canCloseEvent) {
      const { data, error: eventErr } = await supabaseAdmin
        .from('events')
        .update({ status: 'closed' })
        .eq('id', eventId)
        .select()
        .single()

      if (eventErr) {
        return NextResponse.json({ error: eventErr.message }, { status: 500 })
      }
      updatedEvent = data
    }

    // 2. Fetch all store requests for this event with outstanding durable items
    const { data: storeReqs } = await supabaseAdmin
      .from('store_requests')
      .select('*, department:departments(name)')
      .eq('event_id', eventId)
      .in('status', ['delivered', 'ready_for_collection', 'partially_fulfilled'])

    const deptOutstandingMap: Record<string, { deptName: string; items: string[] }> = {}

    if (storeReqs) {
      storeReqs.forEach(req => {
        const deptId = req.department_id
        const deptName = req.department?.name || 'Department'
        const itemsList = req.items_json || []

        itemsList.forEach((it: any) => {
          const isDurable = it.category === 'durable' || (!it.category && (it.return_status === 'outstanding' || it.return_status === 'return_initiated'))
          const isOutstanding = ['outstanding', 'return_initiated'].includes(it.return_status)

          if (isDurable && isOutstanding) {
            if (!deptOutstandingMap[deptId]) {
              deptOutstandingMap[deptId] = { deptName, items: [] }
            }

            const reqQty = Number(it.approved_quantity ?? it.quantity) || 0
            const retQty = Number(it.returned_quantity) || 0
            const unreturnedQty = Math.max(1, reqQty - retQty)

            const itemLabel = `${unreturnedQty}x ${it.name}${it.item_code ? ` [${it.item_code}]` : ''}`
            if (!deptOutstandingMap[deptId].items.includes(itemLabel)) {
              deptOutstandingMap[deptId].items.push(itemLabel)
            }
          }
        })
      })
    }

    // 3. Dispatch return reminder notification to each department holding outstanding items
    const notifiedDepts: string[] = []

    for (const [deptId, data] of Object.entries(deptOutstandingMap)) {
      if (data.items.length > 0) {
        const recipientIds = await getDepartmentRecipientIds(supabaseAdmin, deptId)
        const itemsSummary = data.items.join(', ')

        for (const recipientId of recipientIds) {
          await notify({
            recipientId,
            type: 'durable_return_reminder',
            title: `📋 Event Closed: Action Required - Return Borrowed Stores Equipment`,
            body: `The event has officially closed. ${data.deptName} is currently holding the following unreturned durable items: ${itemsSummary}. Please return all equipment to Stores promptly.`,
            relatedEntity: { type: 'event', id: eventId }
          })
        }

        notifiedDepts.push(data.deptName)
      }
    }

    return NextResponse.json({
      success: true,
      eventClosed: canCloseEvent,
      event: updatedEvent,
      notifiedDepartmentsCount: notifiedDepts.length,
      notifiedDepartments: notifiedDepts
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
