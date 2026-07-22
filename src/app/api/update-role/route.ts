import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

const VALID_ROLES = ['hod', 'assistant', 'coordinator', 'national_coordinator', 'super_admin']

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate calling user
    const supabaseUserClient = await createServerClient()
    const { data: { user } } = await supabaseUserClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Please log in.' }, { status: 401 })
    }

    // 2. Verify calling user is a super_admin
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

    if (!callerProfile || callerProfile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Only super_admin can change roles.' }, { status: 403 })
    }

    // 3. Parse request
    const body = await request.json()
    const { targetUserId, newRole } = body as { targetUserId: string; newRole: string }

    if (!targetUserId || !newRole) {
      return NextResponse.json({ error: 'Missing targetUserId or newRole.' }, { status: 400 })
    }

    if (!VALID_ROLES.includes(newRole)) {
      return NextResponse.json({ error: `Invalid role: ${newRole}. Valid roles: ${VALID_ROLES.join(', ')}` }, { status: 400 })
    }

    // 4. Prevent self-demotion
    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'Cannot change your own role.' }, { status: 400 })
    }

    // 5. Update profile role using admin client (bypasses RLS)
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUserId)

    if (updateErr) {
      throw new Error(`Failed to update role: ${updateErr.message}`)
    }

    // 6. Also update user_metadata in Auth so middleware picks up the new role
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      user_metadata: { role: newRole }
    })

    if (authErr) {
      console.error('Warning: Profile role updated but auth metadata update failed:', authErr.message)
      // Don't throw — the profile update succeeded, auth metadata is secondary
    }

    return NextResponse.json({ success: true, role: newRole })
  } catch (err: any) {
    console.error('update-role error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 })
  }
}
