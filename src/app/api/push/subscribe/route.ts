import { NextResponse, type NextRequest } from 'next/server'
import { isMock } from '@/utils/supabase'
import { requireAuth } from '@/lib/auth/api-guard'
import { store } from '@/utils/supabase/mockClient'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { getServiceRoleKey } from '@/utils/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const sub = body.subscription || body

    if (!sub || !sub.endpoint || !sub.keys) {
      return NextResponse.json({ error: 'Invalid push subscription payload' }, { status: 400 })
    }

    // A subscription always belongs to the signed-in user. Ignoring any
    // profileId in the body stops someone registering their own device to
    // receive another person's notifications.
    let userId: string | null = null

    if (isMock) {
      const u = store.currentUser
      userId = u?.id || 'mock-admin'
    } else {
      const auth = await requireAuth()
      if (!auth.ok) return auth.response
      userId = auth.ctx.userId
    }

    if (!isMock) {
      try {
        const serviceKey =
          getServiceRoleKey() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (serviceKey && supabaseUrl) {
          const adminSupabase = createSupabaseAdminClient(supabaseUrl, serviceKey)
          
          const subPayload = {
            profile_id: userId,
            endpoint: sub.endpoint,
            keys: sub.keys,
            created_at: new Date().toISOString()
          }

          const { error: upsertErr } = await adminSupabase
            .from('push_subscriptions')
            .upsert(subPayload, { onConflict: 'endpoint' })

          if (upsertErr) {
            console.warn('[PushSubscribe] Upsert fallback triggered:', upsertErr.message)
            await adminSupabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            await adminSupabase.from('push_subscriptions').insert(subPayload)
          }
        }
      } catch (dbErr: any) {
        console.warn('[PushSubscribe] DB store warning:', dbErr.message)
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
      const auth = await requireAuth()
      if (!auth.ok) return auth.response

      const serviceKey = getServiceRoleKey()
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (serviceKey && supabaseUrl) {
        const adminSupabase = createSupabaseAdminClient(supabaseUrl, serviceKey)
        // Only remove your own device subscriptions
        await adminSupabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('profile_id', auth.ctx.userId)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
