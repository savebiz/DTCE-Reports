import { NextResponse } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { requireInventoryManager } from '@/lib/auth/api-guard'

export async function POST(request: Request) {
  try {
    const guard = await requireInventoryManager()
    if (!guard.ok) return guard.response

    const { itemId, physicalCount, reason } = await request.json()

    if (!itemId || physicalCount === undefined || physicalCount === null || Number(physicalCount) < 0 || !Number.isInteger(Number(physicalCount))) {
      return NextResponse.json({ error: 'Valid itemId and non-negative integer physicalCount are required.' }, { status: 400 })
    }
    if (!reason || !String(reason).trim()) {
      return NextResponse.json({ error: 'A cycle-count / stock-take reason is required.' }, { status: 400 })
    }

    const newCount = Number(physicalCount)
    const noteText = `[Cycle Count] ${String(reason).trim()}`

    if (isMock) {
      const itemsList = [...(store.inventoryItems || [])]
      const idx = itemsList.findIndex((i: any) => i.id === itemId)
      if (idx === -1) return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 })
      const prevStock = Number(itemsList[idx].current_stock) || 0
      const delta = newCount - prevStock
      itemsList[idx] = { ...itemsList[idx], current_stock: newCount }
      store.inventoryItems = itemsList
      store.inventoryTransactions = [
        {
          id: `trans-${Math.random().toString(36).slice(2, 9)}`,
          inventory_item_id: itemId,
          transaction_type: 'adjustment',
          quantity_change: delta,
          performed_by: guard.ctx.userId,
          note: noteText,
          resulting_stock_level: newCount,
          created_at: new Date().toISOString(),
        },
        ...(store.inventoryTransactions || []),
      ]
      return NextResponse.json({ success: true, newStock: newCount, delta })
    }

    const supabaseAdmin = getAdminClient()
    const { data: item, error: fetchErr } = await supabaseAdmin
      .from('inventory_items')
      .select('id, name, current_stock')
      .eq('id', itemId)
      .maybeSingle()

    if (fetchErr || !item) {
      return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 })
    }

    const prevStock = Number(item.current_stock) || 0
    const delta = newCount - prevStock

    const { error: updateErr } = await supabaseAdmin
      .from('inventory_items')
      .update({ current_stock: newCount })
      .eq('id', itemId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    const { error: transErr } = await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        inventory_item_id: itemId,
        transaction_type: 'adjustment',
        quantity_change: delta,
        performed_by: guard.ctx.userId,
        note: noteText,
        resulting_stock_level: newCount,
      })

    if (transErr) {
      return NextResponse.json({ error: transErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, newStock: newCount, delta })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
