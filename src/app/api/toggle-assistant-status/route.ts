import { NextResponse } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { requireAuth } from '@/lib/auth/api-guard'
import { getCurrentEventId } from '@/lib/events/current-event'

export async function POST(request: Request) {
  try {
    const { targetUserId, currentStatus } = await request.json()

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId parameter is required' }, { status: 400 })
    }

    // 1. Authenticate — role from profiles only (never user_metadata)
    const auth = await requireAuth({ roles: ['super_admin', 'coordinator', 'national_coordinator', 'hod'] })
    if (!auth.ok) return auth.response
    const user = { id: auth.ctx.userId }
    const isHOD = auth.ctx.role === 'hod'

    // 2. Admin Service Role Client for Elevated Updates
    const supabaseAdmin = getAdminClient()

    // The HOD's department(s) for the current event
    const currentEventId = await getCurrentEventId(supabaseAdmin)
    let hodDeptIds: string[] = []
    if (isHOD) {
      let myQuery = supabaseAdmin
        .from('hod_assignments')
        .select('department_id')
        .eq('profile_id', user.id)
      if (currentEventId) myQuery = myQuery.eq('event_id', currentEventId)
      const { data: myAssigns } = await myQuery
      hodDeptIds = (myAssigns || []).map((a: any) => a.department_id)
    }

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
      if (targetProfile.role !== 'assistant') {
        return NextResponse.json({ error: 'Forbidden: HODs can only change assistant accounts.' }, { status: 403 })
      }
      let targetQuery = supabaseAdmin
        .from('hod_assignments')
        .select('department_id')
        .eq('profile_id', targetUserId)
      if (currentEventId) targetQuery = targetQuery.eq('event_id', currentEventId)
      const { data: targetAssigns } = await targetQuery
      const sameDept = (targetAssigns || []).some((a: any) => hodDeptIds.includes(a.department_id))
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
