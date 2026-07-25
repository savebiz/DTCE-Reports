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
    const { requestId, status, reviewerComments } = body as {
      requestId: string
      status: string
      reviewerComments?: string
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

      if (status === 'approved') {
        // 1. Notify requesting submitter
        if (requesterId) {
          await notify({
            recipientId: requesterId,
            type: 'requisition_approved',
            title: `Requisition Approved: ${deptName}`,
            body: `Your store requisition has been approved by the National Coordinator. It is now routed to Stores for fulfillment.`,
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
                body: `An approved requisition for ${deptName} is ready for fulfillment.`,
                relatedEntity: { type: 'requisition', id: requestId }
              })
            }
          }
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
