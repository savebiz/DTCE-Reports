import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'

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

    // 1. Authenticate calling user
    const supabaseUserClient = await createServerClient()
    const { data: { user } } = await supabaseUserClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Please log in.' }, { status: 401 })
    }

    // 2. Verify caller is super_admin, coordinator, or national_coordinator
    const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error: Service Role key is missing.' }, { status: 500 })
    }

    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAuthorized = callerProfile && (
      callerProfile.role === 'super_admin' ||
      callerProfile.role === 'coordinator' ||
      callerProfile.role === 'national_coordinator'
    )

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden: Insufficient privileges to update department.' }, { status: 403 })
    }

    // 3. Get target user's current role
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single()

    const targetRole = targetProfile?.role || 'hod'

    // 4. Update hod_assignments table in database
    await supabaseAdmin
      .from('hod_assignments')
      .delete()
      .eq('profile_id', targetUserId)

    if (newDepartmentId) {
      const { error: assignErr } = await supabaseAdmin
        .from('hod_assignments')
        .insert({
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
