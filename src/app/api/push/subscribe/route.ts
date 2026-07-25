import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subscription } = body as { subscription: any }

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ error: 'Invalid push subscription payload' }, { status: 400 })
    }

    let userId: string | null = null

    if (isMock) {
      const u = store.currentUser
      userId = u?.id || 'mock-admin'
    } else {
      const supabaseUserClient = await createServerClient()
      const { data: { user } } = await supabaseUserClient.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isMock) {
      const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (serviceKey && supabaseUrl) {
        const adminSupabase = createSupabaseAdminClient(supabaseUrl, serviceKey)
        await adminSupabase.from('push_subscriptions').upsert({
          profile_id: userId,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          created_at: new Date().toISOString()
        }, { onConflict: 'endpoint' })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { endpoint } = body as { endpoint: string }

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 })
    }

    if (!isMock) {
      const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (serviceKey && supabaseUrl) {
        const adminSupabase = createSupabaseAdminClient(supabaseUrl, serviceKey)
        await adminSupabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
