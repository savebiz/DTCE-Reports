import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'
import { notify, getDepartmentRecipientIds } from '@/lib/notifications/dispatch'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { eventId } = await request.json()

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required.' }, { status: 400 })
    }

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

    const supabaseAdmin = getAdminClient()

    // 1. Update event status to 'closed'
    const { data: updatedEvent, error: eventErr } = await supabaseAdmin
      .from('events')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .select()
      .single()

    if (eventErr) {
      return NextResponse.json({ error: eventErr.message }, { status: 500 })
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
      event: updatedEvent,
      notifiedDepartmentsCount: notifiedDepts.length,
      notifiedDepartments: notifiedDepts
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
