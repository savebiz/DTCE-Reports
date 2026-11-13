import { after, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'
import { notify, getDepartmentRecipientIds, getStoresRecipientIds, getAdminRecipientIds } from '@/lib/notifications/dispatch'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { requestId, itemIndex, itemId } = await request.json()

    if (!requestId) {
      return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })
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

    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from('store_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (reqErr || !reqRow) {
      return NextResponse.json({ error: 'Store request not found.' }, { status: 404 })
    }

    // Only the requesting department (or admins / Stores) can start a return
    const auth = await requireAuth()
    if (!auth.ok) return auth.response
    if (!ADMIN_ROLES.includes(auth.ctx.role) && !auth.ctx.isStoresStaff && reqRow.requester_profile_id !== user.id) {
      const { data: memberships } = await supabaseAdmin
        .from('hod_assignments')
        .select('department_id')
        .eq('profile_id', user.id)
        .eq('department_id', reqRow.department_id)
        .limit(1)
      if (!memberships || memberships.length === 0) {
        return NextResponse.json({ error: 'You can only return items issued to your own department.' }, { status: 403 })
      }
    }

    const itemsList = reqRow.items_json || []
    let targetIdx = typeof itemIndex === 'number' ? itemIndex : -1

    if (targetIdx < 0 || targetIdx >= itemsList.length) {
      targetIdx = itemsList.findIndex((it: any) => it.inventory_item_id === itemId || it.id === itemId)
    }

    if (targetIdx < 0 || targetIdx >= itemsList.length) {
      return NextResponse.json({ error: 'Durable item not found in requisition.' }, { status: 404 })
    }

    const updatedItems = [...itemsList]
    const targetItem = updatedItems[targetIdx]

    if (targetItem.category === 'durable' && ['outstanding', undefined].includes(targetItem.return_status)) {
      updatedItems[targetIdx] = {
        ...targetItem,
        return_status: 'return_initiated',
        return_initiated_at: new Date().toISOString()
      }

      const { data: updatedReq, error: updateErr } = await supabaseAdmin
        .from('store_requests')
        .update({ items_json: updatedItems })
        .eq('id', requestId)
        .select()
        .single()

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      // Dispatch Push, In-App, and Email Notifications across all targeted groups
      try {
        const { data: dept } = await supabaseAdmin
          .from('departments')
          .select('name')
          .eq('id', reqRow.department_id)
          .maybeSingle()

        const deptName = dept?.name || 'Department'
        const itemName = targetItem.name || 'Durable Item'
        const itemQty = targetItem.approved_quantity || targetItem.requested_quantity || targetItem.quantity || 1
        const unitStr = targetItem.unit || 'pcs'

        after(async () => {
          try {
            const [storesRecipientIds, adminRecipientIds, deptRecipientIds] = await Promise.all([
              getStoresRecipientIds(supabaseAdmin),
              getAdminRecipientIds(supabaseAdmin),
              getDepartmentRecipientIds(supabaseAdmin, reqRow.department_id),
            ])
            await Promise.allSettled([
              ...storesRecipientIds.map((recipientId) =>
                notify({
                  recipientId,
                  type: 'requisition_return_initiated',
                  title: `Return Initiated: ${deptName}`,
                  body: `${deptName} has initiated a return for durable item "${itemName}" (${itemQty} ${unitStr}). Please expect item hand-over.`,
                  relatedEntity: { type: 'requisition', id: requestId }
                })
              ),
              ...adminRecipientIds.map((recipientId) =>
                notify({
                  recipientId,
                  type: 'requisition_return_initiated',
                  title: `Material Return Initiated: ${deptName}`,
                  body: `${deptName} initiated return of ${itemQty} ${itemName} (${unitStr}).`,
                  relatedEntity: { type: 'requisition', id: requestId }
                })
              ),
              ...deptRecipientIds.map((recipientId) =>
                notify({
                  recipientId,
                  type: 'requisition_return_initiated',
                  title: `Return Initiated: ${itemName}`,
                  body: `Your department initiated the return of ${itemQty} ${itemName} (${unitStr}). Please deliver item to Stores.`,
                  relatedEntity: { type: 'requisition', id: requestId }
                })
              ),
            ])
          } catch (err) {
            console.error('[Initiate Return] Background notification error:', err)
          }
        })
      } catch (notifErr) {
        console.error('[Initiate Return] Failed to dispatch notifications:', notifErr)
      }

      return NextResponse.json({ success: true, requisition: updatedReq })
    }

    return NextResponse.json({ success: true, requisition: reqRow })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
