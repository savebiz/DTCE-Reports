import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { inventoryItemId, fulfilledQuantity, requisitionId, note } = await request.json()

    if (!inventoryItemId || !fulfilledQuantity || Number(fulfilledQuantity) <= 0) {
      return NextResponse.json({ error: 'Valid inventoryItemId and positive fulfilledQuantity are required.' }, { status: 400 })
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

    const deductQty = Number(fulfilledQuantity)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // Try calling stored procedure process_inventory_fulfillment first
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('process_inventory_fulfillment', {
      p_item_id: inventoryItemId,
      p_deduct_quantity: deductQty,
      p_requisition_id: requisitionId || null,
      p_performed_by: user.id,
      p_note: note || `Stock deduction for requisition fulfillment #${requisitionId || ''}`
    })

    if (!rpcErr && rpcRes) {
      return NextResponse.json({ success: true, result: rpcRes })
    }

    // Fallback: Atomic lookup, stock validation, decrement & ledger insertion
    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('inventory_items')
      .select('name, current_stock')
      .eq('id', inventoryItemId)
      .single()

    if (fetchErr || !item) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })
    }

    if ((item.current_stock || 0) < deductQty) {
      return NextResponse.json({
        error: `Insufficient stock for "${item.name}". Available stock: ${item.current_stock}, requested deduction: ${deductQty}`
      }, { status: 400 })
    }

    const newStock = item.current_stock - deductQty

    // Update stock
    const { error: updateErr } = await supabaseAdmin
      .from('inventory_items')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', inventoryItemId)

    if (updateErr) {
      return NextResponse.json({ error: `Stock deduction failed: ${updateErr.message}` }, { status: 500 })
    }

    // Insert append-only transaction ledger record
    const { data: trans, error: transErr } = await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        inventory_item_id: inventoryItemId,
        transaction_type: 'fulfillment_deduction',
        quantity_change: -deductQty,
        related_requisition_id: requisitionId || null,
        performed_by: user.id,
        note: note || `Stock deduction for requisition fulfillment #${requisitionId || ''}`,
        resulting_stock_level: newStock
      })
      .select()
      .single()

    if (transErr) {
      return NextResponse.json({ error: `Ledger insertion failed: ${transErr.message}` }, { status: 500 })
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
