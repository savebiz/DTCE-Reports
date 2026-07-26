import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { requestId, itemIndex, itemId } = await request.json()

    if (!requestId) {
      return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })
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

    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from('store_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (reqErr || !reqRow) {
      return NextResponse.json({ error: 'Store request not found.' }, { status: 404 })
    }

    const itemsList = reqRow.items_json || []
    let targetIdx = typeof itemIndex === 'number' ? itemIndex : -1

    if (targetIdx < 0 || targetIdx >= itemsList.length) {
      targetIdx = itemsList.findIndex((it: any) => it.inventory_item_id === itemId || it.id === itemId)
    }

    if (targetIdx < 0 || targetIdx >= itemsList.length) {
      return NextResponse.json({ error: 'Durable item not found in requisition.' }, { status: 404 })
    }

    const updatedItems = [...itemsList]
    const targetItem = updatedItems[targetIdx]

    if (targetItem.category === 'durable' && ['outstanding', undefined].includes(targetItem.return_status)) {
      updatedItems[targetIdx] = {
        ...targetItem,
        return_status: 'return_initiated',
        return_initiated_at: new Date().toISOString()
      }

      const { data: updatedReq, error: updateErr } = await supabaseAdmin
        .from('store_requests')
        .update({ items_json: updatedItems })
        .eq('id', requestId)
        .select()
        .single()

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, requisition: updatedReq })
    }

    return NextResponse.json({ success: true, requisition: reqRow })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
