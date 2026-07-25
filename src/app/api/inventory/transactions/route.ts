import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      supabaseUrl,
      anonKey,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      }
    )

    const { data: transactions, error } = await supabase
      .from('inventory_transactions')
      .select(`
        *,
        item:inventory_items(name, unit, category),
        performer:profiles!inventory_transactions_performed_by_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      // Fallback query if foreign key join is missing or strict
      const supabaseAdmin = getAdminClient()
      const { data: rawTrans } = await supabaseAdmin
        .from('inventory_transactions')
        .select('*')
        .order('created_at', { ascending: false })

      return NextResponse.json({ transactions: rawTrans || [] })
    }

    return NextResponse.json({ transactions: transactions || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
