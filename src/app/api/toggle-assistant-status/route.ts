import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const { targetUserId, currentStatus } = await request.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId parameter is required' }, { status: 400 })
    }

    // 1. Authenticate Requesting User
    const supabaseUserClient = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {},
        },
      }
    )

    const { data: { user } } = await supabaseUserClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or expired' }, { status: 401 })
    }

    // Fetch requester profile
    const { data: requesterProfile } = await supabaseUserClient
      .from('profiles')
      .select('id, role, department_id')
      .eq('id', user.id)
      .maybeSingle()

    let activeRole = requesterProfile?.role || (user.user_metadata as any)?.role || 'hod'
    let activeDeptId = requesterProfile?.department_id || (user.user_metadata as any)?.department_id

    // Fallback lookup from hod_assignments if department_id is missing on profile
    if (!activeDeptId && activeRole === 'hod') {
      const { data: assignment } = await supabaseUserClient
        .from('hod_assignments')
        .select('department_id')
        .eq('profile_id', user.id)
        .maybeSingle()
      if (assignment?.department_id) {
        activeDeptId = assignment.department_id
      }
    }

    const isAdmin = ['super_admin', 'coordinator', 'national_coordinator'].includes(activeRole)
    const isHOD = activeRole === 'hod'

    if (!isAdmin && !isHOD) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions to modify account status' }, { status: 403 })
    }

    // 2. Admin Service Role Client for Elevated Updates
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Fetch target user profile
    const { data: targetProfile, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle()

    if (fetchErr || !targetProfile) {
      return NextResponse.json({ error: 'Target user profile not found' }, { status: 404 })
    }

    // Scope Check: If HOD, target profile must belong to HOD's department or created_by HOD
    if (isHOD) {
      const sameDept = activeDeptId && targetProfile.department_id === activeDeptId
      const isCreator = targetProfile.created_by === user.id

      if (!sameDept && !isCreator) {
        return NextResponse.json(
          { error: 'Forbidden: You can only deactivate or reactivate assistant accounts within your department' },
          { status: 403 }
        )
      }
    }

    // Determine target boolean status
    const newActiveStatus = !currentStatus

    // 3. Update Database Profile `is_active`
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: newActiveStatus })
      .eq('id', targetUserId)

    if (updateErr) {
      return NextResponse.json({ error: `Database status update failed: ${updateErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      targetUserId,
      is_active: newActiveStatus,
      message: `Account status updated to ${newActiveStatus ? 'Active' : 'Deactivated'}`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
