import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      }
    )

    const { data: items, error } = await supabase
      .from('inventory_items')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ items: items || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { name, category, unit, current_stock, low_stock_threshold } = await request.json()

    if (!name || !category || !unit) {
      return NextResponse.json({ error: 'Name, category, and unit are required fields.' }, { status: 400 })
    }

    if (!['durable', 'consumable'].includes(category)) {
      return NextResponse.json({ error: 'Category must be either durable or consumable.' }, { status: 400 })
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

    const initialStock = Number(current_stock) || 0
    const threshold = Number(low_stock_threshold) || 5

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // Insert new item
    const { data: newItem, error: itemErr } = await supabaseAdmin
      .from('inventory_items')
      .insert({
        name,
        category,
        unit,
        current_stock: initialStock,
        low_stock_threshold: threshold
      })
      .select()
      .single()

    if (itemErr || !newItem) {
      return NextResponse.json({ error: itemErr?.message || 'Failed to create inventory item' }, { status: 500 })
    }

    // If initial stock > 0, log an initial restock transaction in the audit ledger
    if (initialStock > 0) {
      await supabaseAdmin.from('inventory_transactions').insert({
        inventory_item_id: newItem.id,
        transaction_type: 'restock',
        quantity_change: initialStock,
        performed_by: user.id,
        note: 'Initial catalog stock opening balance',
        resulting_stock_level: initialStock
      })
    }

    return NextResponse.json({ success: true, item: newItem })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
