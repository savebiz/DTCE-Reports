import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { requestId, itemIndex, itemId, returnedQuantity, condition, conditionNote } = await request.json()

    if (!requestId || condition === undefined || !['good', 'damaged', 'lost'].includes(condition)) {
      return NextResponse.json({ error: 'Valid requestId and condition (good, damaged, or lost) are required.' }, { status: 400 })
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

    // 1. Fetch store request
    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from('store_requests')
      .select('*, department:departments(name)')
      .eq('id', requestId)
      .single()

    if (reqErr || !reqRow) {
      return NextResponse.json({ error: 'Store request not found.' }, { status: 404 })
    }

    const itemsList = reqRow.items_json || []
    let targetIdx = typeof itemIndex === 'number' ? itemIndex : -1

    if (targetIdx < 0 || targetIdx >= itemsList.length) {
      targetIdx = itemsList.findIndex((it: any) => it.inventory_item_id === itemId || it.id === itemId)
    }

    if (targetIdx < 0 || targetIdx >= itemsList.length) {
      return NextResponse.json({ error: 'Durable line item not found in requisition.' }, { status: 404 })
    }

    const targetItem = itemsList[targetIdx]
    const invItemId = targetItem.inventory_item_id || itemId
    const deptName = reqRow.department?.name || 'Department'

    const issuedQty = Number(targetItem.approved_quantity ?? targetItem.quantity) || 0
    const prevReturned = Number(targetItem.returned_quantity) || 0
    const returnQty = Math.max(1, Number(returnedQuantity) || 1)
    const totalReturned = prevReturned + returnQty

    let newStatus = 'returned'
    let transactionLogged = false
    let resultingStock = 0

    if (condition === 'lost') {
      newStatus = 'lost'
      // Missing / Lost: Do NOT restore stock (item is missing)
    } else {
      // Good or Damaged: Item is physically back at Stores. Restore stock level!
      if (invItemId) {
        const { data: currentInvItem } = await supabaseAdmin
          .from('inventory_items')
          .select('current_stock')
          .eq('id', invItemId)
          .single()

        if (currentInvItem) {
          resultingStock = currentInvItem.current_stock + returnQty

          // Increment current_stock
          await supabaseAdmin
            .from('inventory_items')
            .update({ current_stock: resultingStock, updated_at: new Date().toISOString() })
            .eq('id', invItemId)

          // Insert audit transaction log
          const isDamaged = condition === 'damaged'
          const auditNote = isDamaged
            ? `[DAMAGED RETURN - ${deptName}] ${conditionNote?.trim() || 'Returned in damaged condition'}`
            : `[RETURN - ${deptName}] ${conditionNote?.trim() || 'Returned in Good condition'}`

          await supabaseAdmin
            .from('inventory_transactions')
            .insert({
              inventory_item_id: invItemId,
              transaction_type: 'return',
              quantity_change: returnQty,
              performed_by: user.id,
              note: auditNote,
              resulting_stock_level: resultingStock
            })

          transactionLogged = true
        }
      }

      if (condition === 'damaged') {
        newStatus = 'returned_damaged'
      } else {
        newStatus = totalReturned >= issuedQty ? 'returned' : 'outstanding'
      }
    }

    // 2. Update line item in items_json
    const updatedItems = [...itemsList]
    updatedItems[targetIdx] = {
      ...targetItem,
      return_status: newStatus,
      returned_quantity: totalReturned,
      condition_note: conditionNote?.trim() || (condition === 'good' ? 'Returned in Good condition' : condition === 'damaged' ? 'Returned Damaged' : 'Reported Lost/Missing'),
      returned_at: new Date().toISOString(),
      confirmed_by: user.id
    }

    // Check if ALL durable items in requisition are now returned / lost
    const allDurableResolved = updatedItems
      .filter((it: any) => it.category === 'durable')
      .every((it: any) => ['returned', 'returned_damaged', 'lost'].includes(it.return_status))

    const updatePayload: Record<string, any> = {
      items_json: updatedItems,
      updated_at: new Date().toISOString()
    }

    const { data: updatedReq, error: updateErr } = await supabaseAdmin
      .from('store_requests')
      .update(updatePayload)
      .eq('id', requestId)
      .select()
      .single()

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      return_status: newStatus,
      returned_quantity: totalReturned,
      transaction_logged: transactionLogged,
      resulting_stock: resultingStock,
      requisition: updatedReq
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
