import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get('itemId')

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

    let query = supabase
      .from('inventory_transactions')
      .select('*')
      .order('created_at', { ascending: false })

    if (itemId) {
      query = query.eq('inventory_item_id', itemId)
    }

    const { data: transactions, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Enhance with item names and performer profiles if available
    const { data: items } = await supabase.from('inventory_items').select('id, name, unit, category')
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email')

    const itemMap = new Map((items || []).map((i: any) => [i.id, i]))
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))

    const enhanced = (transactions || []).map((t: any) => {
      const item = itemMap.get(t.inventory_item_id)
      const performer = profileMap.get(t.performed_by)
      return {
        ...t,
        item: item || { name: 'Unknown Item', unit: 'units', category: 'consumable' },
        performer: performer || { full_name: 'System / Admin', email: '' }
      }
    })

    return NextResponse.json({ transactions: enhanced })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
