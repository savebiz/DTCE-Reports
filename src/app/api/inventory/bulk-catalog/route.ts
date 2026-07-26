import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { items } = await request.json()

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Payload must contain a non-empty items array.' }, { status: 400 })
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
    const createdItems: any[] = []
    const errors: Array<{ row: number; item: string; error: string }> = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const { name, item_code, category, unit, initial_stock, low_stock_threshold } = item

      if (!name || !category || !unit) {
        errors.push({ row: i + 1, item: name || `Row ${i + 1}`, error: 'Missing required fields (name, category, unit).' })
        continue
      }

      const initialStock = Math.max(0, Number(initial_stock) || 0)
      const threshold = Math.max(1, Number(low_stock_threshold) || 5)

      const insertPayload: Record<string, any> = {
        name: name.trim(),
        category: category.toLowerCase().trim(),
        unit: unit.trim(),
        current_stock: initialStock,
        low_stock_threshold: threshold
      }

      if (item_code && typeof item_code === 'string' && item_code.trim()) {
        insertPayload.item_code = item_code.trim().toUpperCase()
      }

      const { data: newItem, error: insertErr } = await supabaseAdmin
        .from('inventory_items')
        .insert(insertPayload)
        .select()
        .single()

      if (insertErr || !newItem) {
        errors.push({ row: i + 1, item: name, error: insertErr?.message || 'Insert failed.' })
        continue
      }

      createdItems.push(newItem)

      // If initial stock > 0, log individual opening balance transaction in audit ledger
      if (initialStock > 0) {
        await supabaseAdmin.from('inventory_transactions').insert({
          inventory_item_id: newItem.id,
          transaction_type: 'restock',
          quantity_change: initialStock,
          performed_by: user.id,
          note: `Bulk catalog import opening balance${newItem.item_code ? ` (Code: ${newItem.item_code})` : ''}`,
          resulting_stock_level: initialStock
        })
      }
    }

    return NextResponse.json({
      success: true,
      createdCount: createdItems.length,
      createdItems,
      errors
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
