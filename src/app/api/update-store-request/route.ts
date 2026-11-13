import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { notify, checkAndDispatchLowStockAlert, getDepartmentRecipientIds, getStoresRecipientIds } from '@/lib/notifications/dispatch'
import { getServiceRoleKey } from '@/utils/supabase/admin'
import { requireAuth } from '@/lib/auth/api-guard'

export const runtime = 'nodejs'

/**
 * POST /api/update-store-request
 *
 * Server-side API endpoint using service role key to bypass RLS when updating store_requests.
 * Separates Pre-Event Needs Lists (for Market Purchase) from During-Event Store Requisitions (from Stores Stock).
 *
 * P0/P1 Inventory Controls:
 *  - Soft-allocates (`reserved_stock`) on `during_event` approval; releases on decline.
 *  - Incremental partial fulfillment (`fulfilled_quantity`) with atomic RPC deduction (no silent oversell fallback).
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
      items_json?: any[]
      itemsJson?: any[]
    }
    const items_json = body.items_json || body.itemsJson

    if (!requestId || !status) {
      return NextResponse.json({ error: 'requestId and status are required' }, { status: 400 })
    }

    const serviceRoleKey = getServiceRoleKey()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
    }

    const supabaseAdmin = createSupabaseClient(supabaseUrl, serviceRoleKey)

    const { data: existingReq } = await supabaseAdmin
      .from('store_requests')
      .select('*, department:departments(name)')
      .eq('id', requestId)
      .single()

    if (!existingReq) {
      return NextResponse.json({ error: 'Store request not found.' }, { status: 404 })
    }

    const isPreEventNeedsList = existingReq.request_type === 'pre_event'
    const deptName = existingReq.department?.name || 'Department'
    const deptId = existingReq.department_id
    const requesterId = existingReq.requester_profile_id

    // RBAC — role from profiles only (never user_metadata)
    const auth = await requireAuth()
    if (!auth.ok) return auth.response
    const userRole = auth.ctx.role
    const isAssignedApprover = existingReq.assigned_approver_id === user.id

    const APPROVAL_STATUSES = ['pending_coordinator', 'approved', 'declined']
    const FULFILMENT_STATUSES = ['in_progress', 'partially_fulfilled', 'ready_for_collection', 'delivered']

    if (APPROVAL_STATUSES.includes(status)) {
      const canApprove = userRole === 'super_admin' || userRole === 'national_coordinator' || isAssignedApprover
      if (!canApprove) {
        return NextResponse.json(
          { error: 'Forbidden: only the General Secretary, National Coordinator, a Super Admin, or the delegated approver can approve or decline.' },
          { status: 403 }
        )
      }
    } else if (FULFILMENT_STATUSES.includes(status)) {
      if (isPreEventNeedsList) {
        return NextResponse.json(
          { error: 'Pre-event needs lists are for market procurement and cannot be fulfilled directly from store stock. Use the Market List to track purchases.' },
          { status: 400 }
        )
      }
      const canFulfil = userRole === 'super_admin' || userRole === 'national_coordinator' || auth.ctx.isStoresStaff
      if (!canFulfil) {
        return NextResponse.json({ error: 'Forbidden: only Stores can update fulfilment status.' }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: `Unknown status "${status}".` }, { status: 400 })
    }

    let finalItems: any[] = Array.isArray(items_json)
      ? items_json
      : Array.isArray(existingReq.items_json)
      ? existingReq.items_json
      : []

    // --- P0.3: SOFT-ALLOCATION (RESERVE ON APPROVAL, RELEASE ON DECLINE) FOR DURING-EVENT REQUISITIONS ---
    if (!isPreEventNeedsList && status === 'approved' && existingReq.status === 'pending_coordinator') {
      const reservedSoFar: Array<{ itemId: string; qty: number }> = []
      for (const item of finalItems) {
        if (!item.inventory_item_id) continue
        const qtyToReserve = Number(item.approved_quantity ?? item.quantity) || 0
        if (qtyToReserve <= 0) continue

        const { error: resErr } = await supabaseAdmin.rpc('reserve_inventory_stock', {
          p_item_id: item.inventory_item_id,
          p_reserve_quantity: qtyToReserve,
        })

        if (resErr) {
          // Roll back any reservations made earlier in this loop
          for (const prev of reservedSoFar) {
            await supabaseAdmin.rpc('release_inventory_reservation', {
              p_item_id: prev.itemId,
              p_release_quantity: prev.qty,
            })
          }
          return NextResponse.json(
            { error: `Cannot approve "${item.name}": ${resErr.message}` },
            { status: 409 }
          )
        }
        reservedSoFar.push({ itemId: item.inventory_item_id, qty: qtyToReserve })
      }
    } else if (!isPreEventNeedsList && status === 'declined' && existingReq.status === 'approved') {
      for (const item of finalItems) {
        if (!item.inventory_item_id) continue
        const prevFulfilled = Number(item.fulfilled_quantity) || 0
        const approvedQty = Number(item.approved_quantity ?? item.quantity) || 0
        const unfulfilledReserved = Math.max(0, approvedQty - prevFulfilled)
        if (unfulfilledReserved > 0) {
          await supabaseAdmin.rpc('release_inventory_reservation', {
            p_item_id: item.inventory_item_id,
            p_release_quantity: unfulfilledReserved,
          })
        }
      }
    }

    // --- P0.1 & P1.4: ATOMIC INCREMENTAL FULFILLMENT DEDUCTION ---
    const DEDUCTION_STATUSES = ['partially_fulfilled', 'ready_for_collection', 'delivered']
    if (!isPreEventNeedsList && DEDUCTION_STATUSES.includes(status)) {
      const existingByIdx = Array.isArray(existingReq.items_json) ? existingReq.items_json : []

      // Fetch categories for durable initialization
      const itemIds = finalItems.map(it => it.inventory_item_id).filter(Boolean)
      const catMap: Record<string, string> = {}
      if (itemIds.length > 0) {
        const { data: invItems } = await supabaseAdmin
          .from('inventory_items')
          .select('id, category')
          .in('id', itemIds)
        if (invItems) {
          invItems.forEach(i => {
            catMap[i.id] = i.category
          })
        }
      }

      const updatedItems: any[] = []
      const lowStockCandidates: string[] = []

      for (let i = 0; i < finalItems.length; i++) {
        const item = finalItems[i]
        const prevItem = existingByIdx[i] || {}
        const approvedQty = Number(item.approved_quantity ?? item.quantity) || 0
        const prevFulfilled = Number(prevItem.fulfilled_quantity ?? item.fulfilled_quantity ?? 0)

        // If caller explicitly passed fulfilled_quantity, use it; otherwise full approval on ready/delivered
        let targetFulfilled =
          item.fulfilled_quantity !== undefined && item.fulfilled_quantity !== null
            ? Math.min(approvedQty, Math.max(prevFulfilled, Number(item.fulfilled_quantity) || 0))
            : status === 'delivered' || status === 'ready_for_collection'
            ? approvedQty
            : prevFulfilled

        // Backward compatibility: if an older transaction already deducted full qty without setting fulfilled_quantity
        if (item.inventory_item_id && prevFulfilled === 0 && targetFulfilled > 0) {
          const { data: legacyTrans } = await supabaseAdmin
            .from('inventory_transactions')
            .select('quantity_change')
            .eq('inventory_item_id', item.inventory_item_id)
            .eq('related_requisition_id', requestId)
            .eq('transaction_type', 'fulfillment_deduction')
          const alreadyDeducted = (legacyTrans || []).reduce(
            (s: number, t: any) => s + Math.abs(Number(t.quantity_change) || 0),
            0
          )
          if (alreadyDeducted >= targetFulfilled) {
            targetFulfilled = alreadyDeducted
          }
        }

        const deltaToDeduct = Math.max(0, targetFulfilled - prevFulfilled)

        if (item.inventory_item_id && deltaToDeduct > 0) {
          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('process_inventory_fulfillment', {
            p_item_id: item.inventory_item_id,
            p_deduct_quantity: deltaToDeduct,
            p_requisition_id: requestId,
            p_performed_by: user.id,
            p_note: `Fulfillment for ${deptName} (Status: ${status}, Issued: +${deltaToDeduct})`,
            p_release_reservation: deltaToDeduct,
          })

          if (rpcErr || !rpcRes) {
            return NextResponse.json(
              { error: `Stock deduction failed for "${item.name}": ${rpcErr?.message || 'Insufficient stock'}` },
              { status: 409 }
            )
          }

          lowStockCandidates.push(item.inventory_item_id)
        }

        const cat = item.category || catMap[item.inventory_item_id] || 'consumable'
        const isDurable = cat === 'durable'
        updatedItems.push({
          ...item,
          category: cat,
          fulfilled_quantity: targetFulfilled,
          return_status: isDurable ? (item.return_status || 'outstanding') : 'not_applicable',
          returned_quantity: isDurable ? (item.returned_quantity || 0) : undefined,
        })
      }

      finalItems = updatedItems

      // Dispatch low stock alerts for items whose stock dropped
      for (const invId of Array.from(new Set(lowStockCandidates))) {
        const { data: updatedItem } = await supabaseAdmin
          .from('inventory_items')
          .select('id, name, current_stock, low_stock_threshold, unit')
          .eq('id', invId)
          .single()
        if (updatedItem && updatedItem.current_stock <= updatedItem.low_stock_threshold) {
          await checkAndDispatchLowStockAlert({
            itemId: updatedItem.id,
            name: updatedItem.name,
            currentStock: updatedItem.current_stock,
            unit: updatedItem.unit,
            threshold: updatedItem.low_stock_threshold,
          })
        }
      }
    } else if (!isPreEventNeedsList && status === 'in_progress') {
      // Annotate durable categories without deducting stock yet
      const itemIds = finalItems.map(it => it.inventory_item_id).filter(Boolean)
      const catMap: Record<string, string> = {}
      if (itemIds.length > 0) {
        const { data: invItems } = await supabaseAdmin
          .from('inventory_items')
          .select('id, category')
          .in('id', itemIds)
        if (invItems) {
          invItems.forEach(i => {
            catMap[i.id] = i.category
          })
        }
      }
      finalItems = finalItems.map(it => {
        const cat = it.category || catMap[it.inventory_item_id] || 'consumable'
        const isDurable = cat === 'durable'
        return {
          ...it,
          category: cat,
          return_status: isDurable ? (it.return_status || 'outstanding') : 'not_applicable',
          returned_quantity: isDurable ? (it.returned_quantity || 0) : undefined,
        }
      })
    }

    const updatePayload: Record<string, any> = {
      status,
      items_json: finalItems,
    }

    if (reviewerComments !== undefined) {
      updatePayload.reviewer_comments = reviewerComments
      updatePayload.reviewed_at = new Date().toISOString()
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

    // --- LIFECYCLE NOTIFICATION TRIGGERS ---
    if (status === 'approved') {
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

      const deptRecipients = await getDepartmentRecipientIds(supabaseAdmin, deptId)
      if (requesterId && !deptRecipients.includes(requesterId)) deptRecipients.push(requesterId)

      if (isPreEventNeedsList) {
        for (const recipientId of deptRecipients) {
          await notify({
            recipientId,
            type: 'requisition_approved',
            title: `Pre-Event Needs List Approved: ${deptName}`,
            body: `Your department's Pre-Event Needs List has been approved${itemsSummary} and added to the Consolidated Stores Market List for purchase.`,
            relatedEntity: { type: 'requisition', id: requestId },
          })
        }

        const storesRecipients = await getStoresRecipientIds(supabaseAdmin)
        for (const staffId of storesRecipients) {
          await notify({
            recipientId: staffId,
            type: 'requisition_routed_to_stores',
            title: `Market List Updated: ${deptName}`,
            body: `An approved Pre-Event Needs List for ${deptName} has been added to the Consolidated Market List${itemsSummary}.`,
            relatedEntity: { type: 'requisition', id: requestId },
          })
        }
      } else {
        for (const recipientId of deptRecipients) {
          await notify({
            recipientId,
            type: 'requisition_approved',
            title: `Requisition Approved: ${deptName}`,
            body: `Your department's store requisition has been approved${itemsSummary} and stock has been reserved. It is now routed to Stores for fulfillment.`,
            relatedEntity: { type: 'requisition', id: requestId },
          })
        }

        const storesRecipients = await getStoresRecipientIds(supabaseAdmin)
        for (const staffId of storesRecipients) {
          await notify({
            recipientId: staffId,
            type: 'requisition_routed_to_stores',
            title: `New Approved Requisition: ${deptName}`,
            body: `An approved requisition for ${deptName} is ready for fulfillment${itemsSummary}.`,
            relatedEntity: { type: 'requisition', id: requestId },
          })
        }
      }
    } else if (status === 'ready_for_collection') {
      let readyDetail = ''
      if (Array.isArray(finalItems) && finalItems.length > 0) {
        const parts = finalItems.map((it: any) => {
          const qty = it.fulfilled_quantity ?? it.approved_quantity ?? it.quantity
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
          relatedEntity: { type: 'requisition', id: requestId },
        })
      }
    } else if (status === 'declined') {
      const deptRecipients = await getDepartmentRecipientIds(supabaseAdmin, deptId)
      if (requesterId && !deptRecipients.includes(requesterId)) deptRecipients.push(requesterId)

      for (const recipientId of deptRecipients) {
        await notify({
          recipientId,
          type: 'requisition_rejected',
          title: `${isPreEventNeedsList ? 'Pre-Event Needs List' : 'Requisition'} Declined: ${deptName}`,
          body: `Your department's ${isPreEventNeedsList ? 'Pre-Event Needs List' : 'store requisition'} was declined.\nReason: ${reviewerComments?.trim() || 'No reason provided.'}`,
          relatedEntity: { type: 'requisition', id: requestId },
        })
      }
    } else if (['delivered', 'partially_fulfilled', 'in_progress'].includes(status)) {
      const statusText =
        status === 'delivered'
          ? 'Delivered'
          : status === 'partially_fulfilled'
          ? 'Partially Fulfilled'
          : 'In Progress'
      const deptRecipients = await getDepartmentRecipientIds(supabaseAdmin, deptId)
      if (requesterId && !deptRecipients.includes(requesterId)) deptRecipients.push(requesterId)

      for (const recipientId of deptRecipients) {
        await notify({
          recipientId,
          type: 'requisition_fulfilled',
          title: `Requisition Update (${statusText}): ${deptName}`,
          body: `Your department's store request status is now '${statusText}'. ${reviewerComments ? `Note: ${reviewerComments}` : ''}`,
          relatedEntity: { type: 'requisition', id: requestId },
        })
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('API update-store-request error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
