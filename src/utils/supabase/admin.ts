import { createClient } from '@supabase/supabase-js'

/**
 * The Supabase service-role key bypasses Row Level Security. SERVER ONLY.
 *
 * Use the env var SUPABASE_SERVICE_ROLE_KEY. Any env var starting with
 * NEXT_PUBLIC_ is inlined by Next.js into browser bundles of code that reads
 * it, so the old NEXT_PUBLIC_SUPABASE_SERVICE_ROLE name is still read here
 * only as a temporary fallback until the Vercel setting is renamed.
 */
export function getServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE ||
    undefined
  )
}

export function hasServiceRoleKey(): boolean {
  return !!getServiceRoleKey()
}

export function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = getServiceRoleKey()

  // Never fall back to the anon key: a silent downgrade hides misconfiguration.
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Server configuration error: SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not set.')
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
