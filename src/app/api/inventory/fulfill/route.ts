import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'
import { checkAndDispatchLowStockAlert } from '@/lib/notifications/dispatch'
import { requireInventoryManager } from '@/lib/auth/api-guard'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function POST(request: Request) {
  try {
    /* guard:POST */
    const guard = await requireInventoryManager()
    if (!guard.ok) return guard.response

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

    const supabaseAdmin = getAdminClient()

    // Enforce Read-Only at the API / Database Layer: National Coordinator and Assistant accounts CANNOT write to inventory
    const { data: userProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (userProfile?.role === 'national_coordinator' || userProfile?.role === 'coordinator' || userProfile?.role === 'assistant') {
      return NextResponse.json({ error: 'Forbidden: National Coordinator and Assistant accounts are restricted to Read-Only access on inventory.' }, { status: 403 })
    }

    const qty = Number(deductQuantity)

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

    // 2. Atomic stored procedure process_inventory_fulfillment (no silent oversell fallback)
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('process_inventory_fulfillment', {
      p_item_id: inventoryItemId,
      p_deduct_quantity: qty,
      p_requisition_id: requisitionId,
      p_performed_by: user.id,
      p_note: note?.trim() || 'Fulfilled store requisition item'
    })

    if (rpcErr || !rpcData) {
      return NextResponse.json(
        { error: rpcErr?.message || 'Insufficient stock or fulfillment error.' },
        { status: 409 }
      )
    }

    const newStockResult = rpcData.new_stock

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
