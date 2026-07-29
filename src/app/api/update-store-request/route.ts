import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { notify, checkAndDispatchLowStockAlert, getDepartmentRecipientIds, getStoresRecipientIds } from '@/lib/notifications/dispatch'

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

    if (!existingReq) {
      return NextResponse.json({ error: 'Store request not found.' }, { status: 404 })
    }

    // Fetch calling user's profile for RBAC check
    const { data: userProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, department_id')
      .eq('id', user.id)
      .maybeSingle()

    const userRole = userProfile?.role || user.user_metadata?.role || 'hod'

    // RBAC Enforcement for Coordinator role:
    // Coordinators can ONLY update store requests if the request has been explicitly assigned to them by National Coordinator
    if (userRole === 'coordinator' && existingReq.assigned_approver_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Coordinators can only update store requisitions explicitly assigned to them.' }, { status: 403 })
    }
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
    // Fetch inventory item categories to initialize return_status for durable items
    if (['delivered', 'ready_for_collection', 'partially_fulfilled', 'in_progress'].includes(status)) {
      const itemsToAnnotate = items_json || existingReq?.items_json
      if (Array.isArray(itemsToAnnotate) && itemsToAnnotate.length > 0) {
        const itemIds = itemsToAnnotate.map(it => it.inventory_item_id).filter(Boolean)
        let catMap: Record<string, string> = {}

        if (itemIds.length > 0) {
          const { data: invItems } = await supabaseAdmin
            .from('inventory_items')
            .select('id, category, item_code')
            .in('id', itemIds)

          if (invItems) {
            invItems.forEach(i => {
              catMap[i.id] = i.category
            })
          }
        }

        const annotatedItems = itemsToAnnotate.map(it => {
          const cat = it.category || catMap[it.inventory_item_id] || 'consumable'
          const isDurable = cat === 'durable'

          return {
            ...it,
            category: cat,
            return_status: isDurable ? (it.return_status || 'outstanding') : 'not_applicable',
            returned_quantity: isDurable ? (it.returned_quantity || 0) : undefined
          }
        })

        updatePayload.items_json = annotatedItems
      }
    }

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
      const deptId = existingReq.department_id
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

        // Resolve ALL department members (HODs + Assistants)
        const deptRecipients = await getDepartmentRecipientIds(supabaseAdmin, deptId)
        if (requesterId && !deptRecipients.includes(requesterId)) deptRecipients.push(requesterId)

        // 1. Notify all members of the requesting department
        for (const recipientId of deptRecipients) {
          await notify({
            recipientId,
            type: 'requisition_approved',
            title: `Requisition Approved: ${deptName}`,
            body: `Your department's store requisition has been approved by the National Coordinator${itemsSummary}. It is now routed to Stores for fulfillment.`,
            relatedEntity: { type: 'requisition', id: requestId }
          })
        }

        // 2. Notify ALL Stores Department HOD/Staff
        const storesRecipients = await getStoresRecipientIds(supabaseAdmin)
        for (const staffId of storesRecipients) {
          await notify({
            recipientId: staffId,
            type: 'requisition_routed_to_stores',
            title: `New Approved Requisition: ${deptName}`,
            body: `An approved requisition for ${deptName} is ready for fulfillment${itemsSummary}.`,
            relatedEntity: { type: 'requisition', id: requestId }
          })
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

        const deptRecipients = await getDepartmentRecipientIds(supabaseAdmin, deptId)
        if (requesterId && !deptRecipients.includes(requesterId)) deptRecipients.push(requesterId)

        for (const recipientId of deptRecipients) {
          await notify({
            recipientId,
            type: 'requisition_fulfilled',
            title: `Requisition Ready for Collection: ${deptName}`,
            body: `Your department's requisition${readyDetail} is ready for collection at Stores. ${reviewerComments ? `Note: ${reviewerComments}` : ''}`,
            relatedEntity: { type: 'requisition', id: requestId }
          })
        }
      } else if (status === 'declined') {
        const deptRecipients = await getDepartmentRecipientIds(supabaseAdmin, deptId)
        if (requesterId && !deptRecipients.includes(requesterId)) deptRecipients.push(requesterId)

        for (const recipientId of deptRecipients) {
          await notify({
            recipientId,
            type: 'requisition_rejected',
            title: `Requisition Declined: ${deptName}`,
            body: `Your department's store requisition was declined.\nReason: ${reviewerComments?.trim() || 'No reason provided.'}`,
            relatedEntity: { type: 'requisition', id: requestId }
          })
        }
      } else if (['delivered', 'partially_fulfilled', 'in_progress'].includes(status)) {
        const statusText = status === 'delivered' ? 'Delivered' : status === 'partially_fulfilled' ? 'Partially Fulfilled' : 'In Progress'
        const deptRecipients = await getDepartmentRecipientIds(supabaseAdmin, deptId)
        if (requesterId && !deptRecipients.includes(requesterId)) deptRecipients.push(requesterId)

        for (const recipientId of deptRecipients) {
          await notify({
            recipientId,
            type: 'requisition_fulfilled',
            title: `Requisition Update (${statusText}): ${deptName}`,
            body: `Your department's store request status is now '${statusText}'. ${reviewerComments ? `Note: ${reviewerComments}` : ''}`,
            relatedEntity: { type: 'requisition', id: requestId }
          })
        }
      }

      // --- INVENTORY STOCK DEDUCTION LEDGER ---
      if (['in_progress', 'partially_fulfilled', 'ready_for_collection', 'delivered'].includes(status)) {
        if (Array.isArray(finalItems)) {
          for (const item of finalItems) {
            if (item.inventory_item_id) {
              const deductQty = Number(item.approved_quantity ?? item.quantity) || 0
              if (deductQty > 0) {
                // Ensure idempotency: check if already deducted for this item & requisition
                const { data: existingTrans } = await supabaseAdmin
                  .from('inventory_transactions')
                  .select('id')
                  .eq('inventory_item_id', item.inventory_item_id)
                  .eq('related_requisition_id', requestId)
                  .eq('transaction_type', 'fulfillment_deduction')
                  .maybeSingle()

                if (!existingTrans) {
                  // Atomic stored function deduction
                  const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('process_inventory_fulfillment', {
                    p_item_id: item.inventory_item_id,
                    p_deduct_quantity: deductQty,
                    p_requisition_id: requestId,
                    p_performed_by: user.id,
                    p_note: `Fulfillment for ${deptName} (Status: ${status})`
                  })

                  if (rpcErr || !rpcRes) {
                    // Fallback: manual atomic lookup, decrement stock & append transaction
                    const { data: invItem } = await supabaseAdmin
                      .from('inventory_items')
                      .select('current_stock')
                      .eq('id', item.inventory_item_id)
                      .single()

                    if (invItem) {
                      const newStock = Math.max(0, invItem.current_stock - deductQty)
                      await supabaseAdmin
                        .from('inventory_items')
                        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                        .eq('id', item.inventory_item_id)

                      await supabaseAdmin
                        .from('inventory_transactions')
                        .insert({
                          inventory_item_id: item.inventory_item_id,
                          transaction_type: 'fulfillment_deduction',
                          quantity_change: -deductQty,
                          related_requisition_id: requestId,
                          performed_by: user.id,
                          note: `Fulfillment for ${deptName} (Status: ${status})`,
                          resulting_stock_level: newStock
                        })
                    }
                  }

                  // Low-Stock Threshold Alert Trigger (Moment of Deduction)
                  const { data: updatedItem } = await supabaseAdmin
                    .from('inventory_items')
                    .select('id, name, current_stock, low_stock_threshold, unit')
                    .eq('id', item.inventory_item_id)
                    .single()

                  if (updatedItem && updatedItem.current_stock <= updatedItem.low_stock_threshold) {
                    await checkAndDispatchLowStockAlert({
                      itemId: updatedItem.id,
                      name: updatedItem.name,
                      currentStock: updatedItem.current_stock,
                      unit: updatedItem.unit,
                      threshold: updatedItem.low_stock_threshold
                    })
                  }
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('API update-store-request error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
