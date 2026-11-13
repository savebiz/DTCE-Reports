import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'
import { requireInventoryManager } from '@/lib/auth/api-guard'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function POST(request: Request) {
  try {
    /* guard:POST */
    const guard = await requireInventoryManager()
    if (!guard.ok) return guard.response

    const cookieStore = await cookies()
    const { restocks } = await request.json()

    if (!Array.isArray(restocks) || restocks.length === 0) {
      return NextResponse.json({ error: 'Payload must contain a non-empty restocks array.' }, { status: 400 })
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

    // 1. Fetch all active catalog items for exact code / name matching
    const { data: catalogItems } = await supabaseAdmin
      .from('inventory_items')
      .select('*')

    const itemsList = catalogItems || []
    const processedTransactions: any[] = []
    const errors: Array<{ row: number; item_code?: string; item_name?: string; error: string }> = []

    for (let i = 0; i < restocks.length; i++) {
      const entry = restocks[i]
      const { item_code, item_name, quantity_to_add, note } = entry

      const qty = Number(quantity_to_add)
      if (!qty || qty <= 0) {
        errors.push({ row: i + 1, item_code, item_name, error: 'Restock quantity must be > 0.' })
        continue
      }

      // Match item by item_code first, then fall back to case-insensitive exact name match
      let matchedItem: any = null

      if (item_code && typeof item_code === 'string' && item_code.trim()) {
        const cleanCode = item_code.trim().toUpperCase()
        matchedItem = itemsList.find(it => (it.item_code || '').toUpperCase() === cleanCode)
      }

      if (!matchedItem && item_name && typeof item_name === 'string' && item_name.trim()) {
        const cleanName = item_name.trim().toLowerCase()
        matchedItem = itemsList.find(it => it.name.toLowerCase() === cleanName)
      }

      if (!matchedItem) {
        errors.push({
          row: i + 1,
          item_code,
          item_name,
          error: `No catalog item found matching code "${item_code || ''}" or name "${item_name || ''}".`
        })
        continue
      }

      // Execute atomic restock RPC for matched item
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('process_inventory_restock', {
        p_item_id: matchedItem.id,
        p_restock_quantity: qty,
        p_performed_by: user.id,
        p_note: note?.trim() || `Bulk restock import${item_code ? ` (Code: ${item_code})` : ''}`,
      })

      if (rpcErr || !rpcData) {
        errors.push({ row: i + 1, item_code, item_name: matchedItem.name, error: rpcErr?.message || 'Atomic restock failed' })
      } else {
        matchedItem.current_stock = rpcData.new_stock
        processedTransactions.push({
          id: rpcData.transaction_id,
          inventory_item_id: matchedItem.id,
          quantity_change: qty,
          resulting_stock_level: rpcData.new_stock,
        })
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: processedTransactions.length,
      transactions: processedTransactions,
      errors
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
