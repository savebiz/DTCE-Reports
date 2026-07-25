import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { notify } from '@/lib/notifications/dispatch'

export const runtime = 'nodejs'

/**
 * POST /api/update-store-request
 *
 * Server-side API endpoint using service role key to bypass RLS when updating store_requests.
 * Triggers lifecycle notifications for approval, rejection, stores routing, and fulfillment.
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUserClient = await createServerClient()
    const { data: { user }, error: authErr } = await supabaseUserClient.auth.getUser()

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { requestId, status, reviewerComments, items_json } = body as {
      requestId: string
      status: string
      reviewerComments?: string
      items_json?: any[]
    }

    if (!requestId || !status) {
      return NextResponse.json({ error: 'requestId and status are required' }, { status: 400 })
    }

    const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
    }

    const supabaseAdmin = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Fetch existing request to inspect requester and department
    const { data: existingReq } = await supabaseAdmin
      .from('store_requests')
      .select('*, department:departments(name)')
      .eq('id', requestId)
      .single()

    // Build update object
    const updatePayload: Record<string, any> = {
      status
    }

    if (items_json && Array.isArray(items_json)) {
      updatePayload.items_json = items_json
    }

    if (reviewerComments !== undefined) {
      updatePayload.reviewer_comments = reviewerComments
      updatePayload.reviewed_at = new Date().toISOString()
    }

    // Perform update with admin privileges
    const { data, error } = await supabaseAdmin
      .from('store_requests')
      .update(updatePayload)
      .eq('id', requestId)
      .select()

    if (error) {
      console.error('Error updating store request:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // --- REQUISITION LIFECYCLE NOTIFICATION TRIGGERS ---
    if (existingReq) {
      const deptName = existingReq.department?.name || 'Department'
      const requesterId = existingReq.requester_profile_id
      const finalItems = items_json || existingReq.items_json || []

      if (status === 'approved') {
        // Build detailed items summary if quantities were adjusted
        let itemsSummary = ''
        if (Array.isArray(finalItems) && finalItems.length > 0) {
          const summaryParts = finalItems.map((it: any) => {
            const reqQty = it.requested_quantity ?? it.quantity
            const appQty = it.approved_quantity ?? it.quantity
            if (reqQty !== undefined && appQty !== undefined && reqQty !== appQty) {
              return `${appQty} of ${reqQty} requested ${it.name}`
            }
            return `${appQty || reqQty} ${it.name}`
          })
          itemsSummary = ` (Approved: ${summaryParts.join(', ')})`
        }

        // 1. Notify requesting submitter
        if (requesterId) {
          await notify({
            recipientId: requesterId,
            type: 'requisition_approved',
            title: `Requisition Approved: ${deptName}`,
            body: `Your store requisition has been approved by the National Coordinator${itemsSummary}. It is now routed to Stores for fulfillment.`,
            relatedEntity: { type: 'requisition', id: requestId }
          })
        }

        // 2. Notify Stores Department HOD/Staff
        const { data: storesDept } = await supabaseAdmin
          .from('departments')
          .select('id')
          .ilike('name', '%store%')
          .maybeSingle()

        if (storesDept?.id) {
          const { data: storesStaff } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('department_id', storesDept.id)

          if (storesStaff) {
            for (const staff of storesStaff) {
              await notify({
                recipientId: staff.id,
                type: 'requisition_routed_to_stores',
                title: `New Approved Requisition: ${deptName}`,
                body: `An approved requisition for ${deptName} is ready for fulfillment${itemsSummary}.`,
                relatedEntity: { type: 'requisition', id: requestId }
              })
            }
          }
        }
      } else if (status === 'ready_for_collection') {
        // Build ready for collection notification
        let readyDetail = ''
        if (Array.isArray(finalItems) && finalItems.length > 0) {
          const parts = finalItems.map((it: any) => {
            const qty = it.approved_quantity ?? it.quantity
            const reqQty = it.requested_quantity
            return reqQty ? `${qty} of ${reqQty} requested ${it.name}` : `${qty} ${it.name}`
          })
          readyDetail = ` (${parts.join(', ')})`
        }

        if (requesterId) {
          await notify({
            recipientId: requesterId,
            type: 'requisition_fulfilled',
            title: `Requisition Ready for Collection: ${deptName}`,
            body: `Your requisition${readyDetail} is ready for collection at Stores. ${reviewerComments ? `Note: ${reviewerComments}` : ''}`,
            relatedEntity: { type: 'requisition', id: requestId }
          })
        }
      } else if (status === 'declined') {
        // Notify submitter of rejection with reason
        if (requesterId) {
          await notify({
            recipientId: requesterId,
            type: 'requisition_rejected',
            title: `Requisition Declined: ${deptName}`,
            body: `Your store requisition was declined.\nReason: ${reviewerComments?.trim() || 'No reason provided.'}`,
            relatedEntity: { type: 'requisition', id: requestId }
          })
        }
      } else if (['delivered', 'partially_fulfilled', 'in_progress'].includes(status)) {
        // Notify submitter of fulfillment / partial delivery
        if (requesterId) {
          const statusText = status === 'delivered' ? 'Delivered' : status === 'partially_fulfilled' ? 'Partially Fulfilled' : 'In Progress'
          await notify({
            recipientId: requesterId,
            type: 'requisition_fulfilled',
            title: `Requisition Update (${statusText}): ${deptName}`,
            body: `Your store request status is now '${statusText}'. ${reviewerComments ? `Note: ${reviewerComments}` : ''}`,
            relatedEntity: { type: 'requisition', id: requestId }
          })
        }
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('API update-store-request error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
