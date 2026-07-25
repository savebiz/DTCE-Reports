import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export interface ChallengeResolutionItem {
  id: string
  challenge_key: string
  resolution_status: 'open' | 'resolved'
  resolution_note?: string
  resolved_by?: string
  resolved_by_name?: string
  resolved_at?: string
  created_at?: string
}

export async function GET(request: NextRequest) {
  try {
    if (isMock) {
      return NextResponse.json({ resolutions: (store as any).challengeResolutions || [] })
    }

    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabase = (serviceKey && supabaseUrl) ? createSupabaseAdminClient(supabaseUrl, serviceKey) : await createServerClient()

    const { data, error } = await supabase
      .from('challenge_resolutions')
      .select('*')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ resolutions: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { challengeKey, status, resolutionNote } = body as {
      challengeKey: string
      status: 'open' | 'resolved'
      resolutionNote?: string
    }

    if (!challengeKey || !status) {
      return NextResponse.json({ error: 'challengeKey and status are required' }, { status: 400 })
    }

    let userId = 'mock-admin'
    let userName = 'National Coordinator'

    if (isMock) {
      const u = store.currentUser
      userId = u?.id || 'mock-admin'
      userName = (u as any)?.full_name || (u as any)?.user_metadata?.full_name || 'National Coordinator'

      if (!(store as any).challengeResolutions) {
        ;(store as any).challengeResolutions = []
      }

      const existingIndex = (store as any).challengeResolutions.findIndex((r: any) => r.challenge_key === challengeKey)
      const resItem: ChallengeResolutionItem = {
        id: `res-${Math.random().toString(36).substr(2, 9)}`,
        challenge_key: challengeKey,
        resolution_status: status,
        resolution_note: resolutionNote || undefined,
        resolved_by: userId,
        resolved_by_name: userName,
        resolved_at: status === 'resolved' ? new Date().toISOString() : undefined,
        created_at: new Date().toISOString()
      }

      if (existingIndex >= 0) {
        ;(store as any).challengeResolutions[existingIndex] = {
          ...(store as any).challengeResolutions[existingIndex],
          ...resItem
        }
      } else {
        ;(store as any).challengeResolutions.push(resItem)
      }

      return NextResponse.json({ success: true, resolution: resItem })
    }

    const supabaseUserClient = await createServerClient()
    const { data: { user } } = await supabaseUserClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id

    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabase = (serviceKey && supabaseUrl) ? createSupabaseAdminClient(supabaseUrl, serviceKey) : await createServerClient()

    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle()

    userName = prof?.full_name || prof?.email || 'Secretariat Staff'

    const payload = {
      challenge_key: challengeKey,
      resolution_status: status,
      resolution_note: status === 'resolved' ? (resolutionNote || null) : null,
      resolved_by: status === 'resolved' ? userId : null,
      resolved_by_name: status === 'resolved' ? userName : null,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null
    }

    const { data, error } = await supabase
      .from('challenge_resolutions')
      .upsert(payload, { onConflict: 'challenge_key' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, resolution: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
