import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { isMock } from '@/utils/supabase'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { store } from '@/utils/supabase/mockClient'
import { getServiceRoleKey } from '@/utils/supabase/admin'
import { getCurrentEventId } from '@/lib/events/current-event'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { targetUserId, newDepartmentId } = body as { targetUserId: string; newDepartmentId: string }

    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing targetUserId.' }, { status: 400 })
    }

    if (isMock) {
      const match = store.profiles.find((p: any) => p.id === targetUserId)
      if (match) {
        match.department_id = newDepartmentId || undefined
        store.profiles = store.profiles
      }
      return NextResponse.json({ success: true, department_id: newDepartmentId })
    }

    // 1. Authenticate calling user (active admin only)
    const auth = await requireAuth({ roles: ADMIN_ROLES })
    if (!auth.ok) return auth.response

    const serviceRoleKey = getServiceRoleKey()
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error: Service Role key is missing.' }, { status: 500 })
    }

    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    // 3. Get target user's current role
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single()

    const targetRole = targetProfile?.role || 'hod'

    // 4. Update this person's assignment for the CURRENT event only —
    //    past events keep their history (who led which department in 2026).
    const currentEventId = await getCurrentEventId(supabaseAdmin)
    let deleteQuery = supabaseAdmin
      .from('hod_assignments')
      .delete()
      .eq('profile_id', targetUserId)
    if (currentEventId) deleteQuery = deleteQuery.eq('event_id', currentEventId)
    await deleteQuery

    if (newDepartmentId) {
      const { error: assignErr } = await supabaseAdmin
        .from('hod_assignments')
        .insert({
          event_id: currentEventId,
          profile_id: targetUserId,
          department_id: newDepartmentId,
          role_in_event: targetRole
        })

      if (assignErr) {
        console.error('Warning: Failed to insert hod_assignment:', assignErr.message)
      }
    }

    // 5. Update profiles table department_id if column exists
    try {
      await supabaseAdmin
        .from('profiles')
        .update({ department_id: newDepartmentId || null })
        .eq('id', targetUserId)
    } catch {
      // Ignore if department_id column does not exist on profiles table
    }

    // 6. Update user_metadata in Auth
    try {
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        user_metadata: { department_id: newDepartmentId || null }
      })
    } catch {
      // Ignore auth metadata update errors
    }

    return NextResponse.json({ success: true, department_id: newDepartmentId })
  } catch (err: any) {
    console.error('update-department error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 })
  }
}
