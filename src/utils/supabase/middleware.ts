import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { mockProfiles } from './mockData'

// This flag mirrors the one in index.ts — keep them in sync
const FORCE_MOCK = true

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const hasSupabaseEnv = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Use mock session when forced mock mode is active OR env vars are missing
  if (FORCE_MOCK || !hasSupabaseEnv) {
    const mockToken = request.cookies.get('sb-mock-token')?.value
    if (mockToken) {
      const { store } = require('./mockClient')
      const profile = store.profiles.find((p: any) => p.id === mockToken) || mockProfiles.find((p) => p.id === mockToken)
      
      if (profile && profile.is_active !== false) {
        const user = {
          id: profile.id,
          email: profile.email,
          user_metadata: {
            role: profile.role,
            full_name: profile.full_name,
          },
        }
        return { supabaseResponse, user, role: profile.role, mustChangePassword: !!profile.must_change_password }
      }
    }
    return { supabaseResponse, user: null, role: null, mustChangePassword: false }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  // Get user profile role and status if logged in
  let role = null
  let mustChangePassword = false

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, must_change_password, is_active')
      .eq('id', user.id)
      .single()

    // Enforce deactivation checks
    if (profile && profile.is_active === false) {
      return { supabaseResponse, user: null, role: null, mustChangePassword: false }
    }

    role = profile?.role || user.user_metadata?.role || 'assistant'
    mustChangePassword = !!profile?.must_change_password
  }

  return { supabaseResponse, user, role, mustChangePassword }
}
