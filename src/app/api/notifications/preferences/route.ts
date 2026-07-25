import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
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

    if (isMock) {
      return NextResponse.json({ preferences: [] })
    }

    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabase = (serviceKey && supabaseUrl) ? createSupabaseAdminClient(supabaseUrl, serviceKey) : await createServerClient()

    const { data: prefs, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('profile_id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ preferences: prefs || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { notificationType, emailEnabled, pushEnabled } = body as {
      notificationType: string
      emailEnabled: boolean
      pushEnabled: boolean
    }

    if (!notificationType) {
      return NextResponse.json({ error: 'notificationType is required' }, { status: 400 })
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

    if (isMock) {
      return NextResponse.json({ success: true })
    }

    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabase = (serviceKey && supabaseUrl) ? createSupabaseAdminClient(supabaseUrl, serviceKey) : await createServerClient()

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        profile_id: userId,
        notification_type: notificationType,
        email_enabled: emailEnabled,
        push_enabled: pushEnabled,
        in_app_enabled: true, // Always true (cannot be fully disabled)
      }, { onConflict: 'profile_id,notification_type' })
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
