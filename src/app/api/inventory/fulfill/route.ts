import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { inventoryItemId, deductQuantity, requisitionId, note } = await request.json()

    if (!inventoryItemId || !deductQuantity || deductQuantity <= 0 || !requisitionId) {
      return NextResponse.json({ error: 'inventoryItemId, deductQuantity (> 0), and requisitionId are required.' }, { status: 400 })
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

    const qty = Number(deductQuantity)
    const supabaseAdmin = getAdminClient()

    // 1. Check idempotency: ensure not already deducted for this item and requisition
    const { data: existingTrans } = await supabaseAdmin
      .from('inventory_transactions')
      .select('id')
      .eq('inventory_item_id', inventoryItemId)
      .eq('related_requisition_id', requisitionId)
      .eq('transaction_type', 'fulfillment_deduction')
      .maybeSingle()

    if (existingTrans) {
      return NextResponse.json({ success: true, message: 'Stock already deducted for this requisition item.' })
    }

    // 2. Try atomic stored procedure process_inventory_fulfillment
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('process_inventory_fulfillment', {
      p_item_id: inventoryItemId,
      p_deduct_quantity: qty,
      p_requisition_id: requisitionId,
      p_performed_by: user.id,
      p_note: note?.trim() || 'Fulfilled store requisition item'
    })

    if (!rpcErr && rpcData) {
      return NextResponse.json({ success: true, result: rpcData })
    }

    // Fallback: manual lookup, stock decrement & audit log transaction
    const { data: currentItem, error: getErr } = await supabaseAdmin
      .from('inventory_items')
      .select('current_stock')
      .eq('id', inventoryItemId)
      .single()

    if (getErr || !currentItem) {
      return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 })
    }

    const newStock = Math.max(0, currentItem.current_stock - qty)

    // Update current_stock
    await supabaseAdmin
      .from('inventory_items')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', inventoryItemId)

    // Insert append-only transaction
    const { data: trans, error: transErr } = await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        inventory_item_id: inventoryItemId,
        transaction_type: 'fulfillment_deduction',
        quantity_change: -qty,
        related_requisition_id: requisitionId,
        performed_by: user.id,
        note: note?.trim() || 'Fulfilled store requisition item',
        resulting_stock_level: newStock
      })
      .select()
      .single()

    if (transErr) {
      return NextResponse.json({ error: transErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, transaction: trans, newStock })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
