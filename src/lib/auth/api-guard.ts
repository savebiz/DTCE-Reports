/**
 * Authorization for API route handlers.
 *
 * Many routes use the service-role client, which bypasses Row Level Security.
 * Those routes MUST decide who may call them here, based on the caller's row
 * in `profiles` — never on `user_metadata`, which the user can edit.
 *
 * Usage:
 *   const auth = await requireAuth({ roles: ADMIN_ROLES, allowStoresStaff: true })
 *   if (!auth.ok) return auth.response
 *   const { ctx } = auth
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { getCurrentEventId } from '@/lib/events/current-event'

export type PlatformRole = 'super_admin' | 'coordinator' | 'national_coordinator' | 'hod' | 'assistant'

/** Roles with the oversight dashboard. National Coordinator ⊇ Coordinator (see README). */
export const ADMIN_ROLES: PlatformRole[] = ['super_admin', 'coordinator', 'national_coordinator']
/** Roles that may change data on behalf of the whole platform. */
export const WRITE_ADMIN_ROLES: PlatformRole[] = ['super_admin', 'coordinator']
export const ALL_ROLES: PlatformRole[] = ['super_admin', 'coordinator', 'national_coordinator', 'hod', 'assistant']

export interface AuthContext {
  userId: string
  email: string | null
  role: PlatformRole
  fullName: string | null
  username: string | null
  isStoresStaff: boolean
  isFinanceStaff: boolean
}

type GuardResult = { ok: true; ctx: AuthContext } | { ok: false; response: NextResponse }

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function forbidden(message = 'You do not have permission to do this.') {
  return NextResponse.json({ error: message }, { status: 403 })
}

/** True if the person is on the current event's Stores team, or is the legacy stores.hod account. */
export async function checkStoresStaff(profileId: string, username?: string | null, role?: string | null): Promise<boolean> {
  if (role === 'hod' && username === 'stores.hod') return true
  const admin = getAdminClient()
  const eventId = await getCurrentEventId(admin)
  let query = admin
    .from('hod_assignments')
    .select('department_id, departments!inner(name)')
    .eq('profile_id', profileId)
  if (eventId) query = query.eq('event_id', eventId)
  const { data } = await query
  return (data || []).some((row: any) => {
    const dept = Array.isArray(row.departments) ? row.departments[0] : row.departments
    return typeof dept?.name === 'string' && dept.name.toLowerCase().includes('store')
  })
}

export async function checkFinanceStaff(profileId: string): Promise<boolean> {
  const admin = getAdminClient()
  const eventId = await getCurrentEventId(admin)
  let query = admin
    .from('hod_assignments')
    .select('department_id, departments!inner(name)')
    .eq('profile_id', profileId)
  if (eventId) query = query.eq('event_id', eventId)
  const { data } = await query
  return (data || []).some((row: any) => {
    const dept = Array.isArray(row.departments) ? row.departments[0] : row.departments
    return typeof dept?.name === 'string' && dept.name.toLowerCase().includes('finance')
  })
}

/** Resolve the signed-in caller from the request cookies. Null if signed out or deactivated. */
export async function getAuthContext(): Promise<AuthContext | null> {
  // Local mock mode (no Supabase env vars at all): use the mock session user.
  if (isMock) {
    const u: any = (store as any).currentUser
    const role = (u?.role && ALL_ROLES.includes(u.role) ? u.role : 'super_admin') as PlatformRole
    return {
      userId: u?.id || 'user-admin',
      email: u?.email || null,
      role,
      fullName: u?.full_name || null,
      username: u?.username || null,
      isStoresStaff: u?.department_id === 'dept-29',
      isFinanceStaff: false,
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = getAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, role, full_name, username, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.is_active === false) return null
  if (!ALL_ROLES.includes(profile.role)) return null

  return {
    userId: user.id,
    email: profile.email ?? user.email ?? null,
    role: profile.role as PlatformRole,
    fullName: profile.full_name ?? null,
    username: profile.username ?? null,
    isStoresStaff: await checkStoresStaff(user.id, profile.username, profile.role),
    isFinanceStaff: await checkFinanceStaff(user.id),
  }
}

/**
 * Require a signed-in, active caller. Optionally restrict to `roles`, or allow
 * Stores staff in addition to those roles.
 */
export async function requireAuth(options: { roles?: PlatformRole[]; allowStoresStaff?: boolean; allowFinanceStaff?: boolean } = {}): Promise<GuardResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { ok: false, response: unauthorized() }

  const { roles, allowStoresStaff, allowFinanceStaff } = options
  if (!roles) return { ok: true, ctx }
  if (roles.includes(ctx.role)) return { ok: true, ctx }
  if (allowStoresStaff && ctx.isStoresStaff) return { ok: true, ctx }
  if (allowFinanceStaff && ctx.isFinanceStaff) return { ok: true, ctx }

  return { ok: false, response: forbidden() }
}

/**
 * Changing stock or the catalogue: Super Admin, or the HOD of Stores.
 * (Matches the existing rule that National Coordinator, Coordinator and
 * Assistant accounts are read-only on inventory — and closes the gap where
 * any department's HOD could restock or fulfil.)
 */
export async function requireInventoryManager(): Promise<GuardResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { ok: false, response: unauthorized() }
  if (ctx.role === 'super_admin') return { ok: true, ctx }
  if (ctx.role === 'hod' && ctx.isStoresStaff) return { ok: true, ctx }
  return { ok: false, response: forbidden('Only the Stores HOD or a Super Admin can change inventory.') }
}

/** Shared-secret check for scheduled jobs (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}
