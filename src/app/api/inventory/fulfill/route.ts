import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'
import { checkAndDispatchLowStockAlert } from '@/lib/notifications/dispatch'

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

    let newStockResult = 0

    if (!rpcErr && rpcData) {
      newStockResult = rpcData.new_stock
    } else {
      // Fallback: manual lookup, stock decrement & audit log transaction
      const { data: currentItem, error: getErr } = await supabaseAdmin
        .from('inventory_items')
        .select('current_stock')
        .eq('id', inventoryItemId)
        .single()

      if (getErr || !currentItem) {
        return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 })
      }

      newStockResult = Math.max(0, currentItem.current_stock - qty)

      // Update current_stock
      await supabaseAdmin
        .from('inventory_items')
        .update({ current_stock: newStockResult, updated_at: new Date().toISOString() })
        .eq('id', inventoryItemId)

      // Insert append-only transaction
      const { error: transErr } = await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          inventory_item_id: inventoryItemId,
          transaction_type: 'fulfillment_deduction',
          quantity_change: -qty,
          related_requisition_id: requisitionId,
          performed_by: user.id,
          note: note?.trim() || 'Fulfilled store requisition item',
          resulting_stock_level: newStockResult
        })

      if (transErr) {
        return NextResponse.json({ error: transErr.message }, { status: 500 })
      }
    }

    // Low Stock Threshold Alert Trigger
    const { data: updatedItem } = await supabaseAdmin
      .from('inventory_items')
      .select('id, name, current_stock, low_stock_threshold, unit')
      .eq('id', inventoryItemId)
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

    return NextResponse.json({ success: true, newStock: newStockResult })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
