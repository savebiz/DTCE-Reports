import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * POST /api/resolve-username
 * 
 * Resolves a username to its associated email address using the service role
 * key (bypasses RLS). This is needed because the login page queries the
 * profiles table before the user is authenticated, so RLS blocks the read.
 * 
 * Request body: { username: string }
 * Response:     { email: string } | { email: null }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username } = body as { username: string }

    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return NextResponse.json({ email: null })
    }

    const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      // If no service key, fall back to placeholder email pattern
      return NextResponse.json({ email: `${username.trim()}@accounts.dtce-reports.vercel.app` })
    }

    const supabaseAdmin = createSupabaseClient(supabaseUrl, serviceRoleKey)

    const normalizedUsername = username.trim().toLowerCase()

    // Try exact match first
    const { data: exactMatch } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('username', normalizedUsername)
      .maybeSingle()

    if (exactMatch?.email) {
      return NextResponse.json({ email: exactMatch.email })
    }

    // Try case-insensitive match
    const { data: allProfiles } = await supabaseAdmin
      .from('profiles')
      .select('username, email')

    if (allProfiles) {
      const match = allProfiles.find(
        p => p.username?.toLowerCase().trim() === normalizedUsername
      )
      if (match?.email) {
        return NextResponse.json({ email: match.email })
      }
    }

    // No profile found — fall back to placeholder email
    return NextResponse.json({ email: `${normalizedUsername}@accounts.dtce-reports.vercel.app` })
  } catch (err: any) {
    console.error('resolve-username error:', err)
    return NextResponse.json({ email: null })
  }
}
