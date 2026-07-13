import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { mockProfiles } from './mockData'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const hasSupabaseEnv = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Fallback to Mock Session in local simulation mode
  if (!hasSupabaseEnv) {
    const mockToken = request.cookies.get('sb-mock-token')?.value
    if (mockToken) {
      const profile = mockProfiles.find((p) => p.id === mockToken)
      if (profile) {
        const user = {
          id: profile.id,
          email: profile.email,
          user_metadata: {
            role: profile.role,
            full_name: profile.full_name,
          },
        }
        return { supabaseResponse, user, role: profile.role }
      }
    }
    return { supabaseResponse, user: null, role: null }
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

  // Get user profile role if logged in
  let role = null
  if (user) {
    role = user.user_metadata?.role
    if (!role) {
      // Fallback: Query the profiles table if not in metadata
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      role = profile?.role || 'assistant'
    }
  }

  return { supabaseResponse, user, role }
}
