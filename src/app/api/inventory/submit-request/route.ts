import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'
import { notify, getDepartmentRecipientIds, getAdminRecipientIds } from '@/lib/notifications/dispatch'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

/**
 * POST /api/inventory/submit-request
 * Atomic submission endpoint for department store requisitions.
 * Inserts request and dispatches notifications to:
 * 1. National Coordinators & Executive Secretariat
 * 2. All Members (HODs + Assistants) of the requesting department
 */
export async function POST(request: NextRequest) {
  try {
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

    const { departmentId, items, eventId } = await request.json()
    if (!departmentId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'departmentId and items array are required.' }, { status: 400 })
    }

    const supabaseAdmin = getAdminClient()

    // 1. Fetch Department Name
    const { data: dept } = await supabaseAdmin
      .from('departments')
      .select('name')
      .eq('id', departmentId)
      .maybeSingle()

    const deptName = dept?.name || 'Department'

    // 2. Insert Store Request
    const payload = {
      event_id: eventId || null,
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
    const itemsSummary = items.map((it: any) => `${it.quantity} ${it.name}`).join(', ')

    // 3. Dispatch Notification to National Coordinators & Executive Secretariat
    const adminIds = await getAdminRecipientIds(supabaseAdmin)
    for (const adminId of adminIds) {
      await notify({
        recipientId: adminId,
        type: 'requisition_submitted',
        title: `New Requisition: ${deptName}`,
        body: `${deptName} has submitted a store requisition for ${itemsSummary}. Pending your review and approval.`,
        relatedEntity: { type: 'requisition', id: requestId }
      })
    }

    // 4. Dispatch Notification to ALL members of the requesting department
    const deptMemberIds = await getDepartmentRecipientIds(supabaseAdmin, departmentId)
    for (const memberId of deptMemberIds) {
      await notify({
        recipientId: memberId,
        type: 'requisition_submitted',
        title: `Requisition Submitted: ${deptName}`,
        body: `A store requisition for ${deptName} (${itemsSummary}) was submitted and sent to the National Coordinator.`,
        relatedEntity: { type: 'requisition', id: requestId }
      })
    }

    return NextResponse.json({ success: true, request: inserted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
