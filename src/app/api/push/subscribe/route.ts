import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const sub = body.subscription || body

    if (!sub || !sub.endpoint || !sub.keys) {
      return NextResponse.json({ error: 'Invalid push subscription payload' }, { status: 400 })
    }

    let userId: string | null = body.profileId || body.userId || null

    if (!userId && isMock) {
      const u = store.currentUser
      userId = u?.id || 'mock-admin'
    } else if (!userId) {
      try {
        const supabaseUserClient = await createServerClient()
        const { data: { user } } = await supabaseUserClient.auth.getUser()
        if (user) {
          userId = user.id
        }
      } catch (_) {}
    }

    // Default to fallback user if unauthenticated in dev/demo mode
    if (!userId) {
      userId = 'anon-user'
    }

    if (!isMock) {
      try {
        const serviceKey =
          process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE ||
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_SERVICE_ROLE ||
          process.env.SUPABASE_SERVICE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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
