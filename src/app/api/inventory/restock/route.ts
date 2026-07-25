import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { inventoryItemId, restockQuantity, note } = await request.json()

    if (!inventoryItemId || !restockQuantity || Number(restockQuantity) <= 0) {
      return NextResponse.json({ error: 'Valid inventoryItemId and positive restockQuantity are required.' }, { status: 400 })
    }

    const supabaseUser = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // Try calling stored procedure process_inventory_restock first
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('process_inventory_restock', {
      p_item_id: inventoryItemId,
      p_restock_quantity: qty,
      p_performed_by: user.id,
      p_note: note || 'Restocked via Stores Inventory Console'
    })

    if (!rpcErr && rpcRes) {
      return NextResponse.json({ success: true, result: rpcRes })
    }

    // Fallback: Atomic lookup, update stock, and append transaction row
    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('inventory_items')
      .select('current_stock')
      .eq('id', inventoryItemId)
      .single()

    if (fetchErr || !item) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })
    }

    const newStock = (item.current_stock || 0) + qty

    // Update item stock
    const { error: updateErr } = await supabaseAdmin
      .from('inventory_items')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', inventoryItemId)

    if (updateErr) {
      return NextResponse.json({ error: `Stock update failed: ${updateErr.message}` }, { status: 500 })
    }

    // Append audit transaction
    const { data: trans, error: transErr } = await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        inventory_item_id: inventoryItemId,
        transaction_type: 'restock',
        quantity_change: qty,
        performed_by: user.id,
        note: note || 'Restocked via Stores Inventory Console',
        resulting_stock_level: newStock
      })
      .select()
      .single()

    if (transErr) {
      return NextResponse.json({ error: `Ledger record creation failed: ${transErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      new_stock: newStock,
      transaction: trans
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
