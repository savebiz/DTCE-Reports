import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { inventoryItemId, restockQuantity, note } = await request.json()

    if (!inventoryItemId || !restockQuantity || restockQuantity <= 0) {
      return NextResponse.json({ error: 'Valid inventoryItemId and restockQuantity (> 0) are required.' }, { status: 400 })
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

    const qty = Number(restockQuantity)
    const supabaseAdmin = getAdminClient()

    // 1. Try atomic stored procedure process_inventory_restock
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('process_inventory_restock', {
      p_item_id: inventoryItemId,
      p_restock_quantity: qty,
      p_performed_by: user.id,
      p_note: note?.trim() || 'Manual restock via Stores Inventory Console'
    })

    if (!rpcErr && rpcData) {
      return NextResponse.json({ success: true, result: rpcData })
    }

    // Fallback: manual lookup, stock increment & audit log transaction
    const { data: currentItem, error: getErr } = await supabaseAdmin
      .from('inventory_items')
      .select('current_stock')
      .eq('id', inventoryItemId)
      .single()

    if (getErr || !currentItem) {
      return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 })
    }

    const newStock = currentItem.current_stock + qty

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
        transaction_type: 'restock',
        quantity_change: qty,
        performed_by: user.id,
        note: note?.trim() || 'Manual restock via Stores Inventory Console',
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
