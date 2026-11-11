import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient, hasServiceRoleKey } from '@/utils/supabase/admin'
import { mockDepartments } from '@/utils/supabase'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { getCurrentEventId, getDepartmentAssignment } from '@/lib/events/current-event'
import { generateCompliantPassword } from '@/lib/password-policy'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // 1-2. HODs and admins only — role from profiles, never user_metadata
    const auth = await requireAuth({ roles: ['hod', 'super_admin', 'coordinator', 'national_coordinator'] })
    if (!auth.ok) return auth.response
    const user = { id: auth.ctx.userId }
    const isAdminCaller = ADMIN_ROLES.includes(auth.ctx.role)

    if (!hasServiceRoleKey()) {
      return NextResponse.json(
        { error: 'Server configuration error: Service role key is missing.' },
        { status: 500 }
      )
    }
    const supabaseAdmin = getAdminClient()

    // The caller's own department (for HODs) in the current event
    const currentEventId = await getCurrentEventId(supabaseAdmin)
    const callerAssignment = await getDepartmentAssignment(supabaseAdmin, user.id, currentEventId)
    const userDeptId = callerAssignment?.department_id || ''

    // 5. Parse request body
    const body = await request.json()
    const { fullName, username, departmentId } = body as {
      fullName: string
      username: string
      departmentId?: string | null
    }

    if (!fullName || !username) {
      return NextResponse.json({ error: 'Full name and username are required.' }, { status: 400 })
    }

    // HODs may only add assistants to their own department
    let targetDeptId = isAdminCaller && departmentId !== undefined ? departmentId : userDeptId
    if (!isAdminCaller && !targetDeptId) {
      return NextResponse.json({ error: 'You are not assigned to a department for the current event.' }, { status: 403 })
    }

    // Resolve department UUID if string starts with "dept-"
    if (targetDeptId && targetDeptId.startsWith('dept-')) {
      const mockDept = mockDepartments.find(d => d.id === targetDeptId)
      const searchName = mockDept ? mockDept.name : targetDeptId.replace('dept-', '')
      const { data: deptRow } = await supabaseAdmin
        .from('departments')
        .select('id')
        .ilike('name', searchName)
        .maybeSingle()
      if (deptRow) {
        targetDeptId = deptRow.id
      }
    }

    // 6. Dynamic username collision resolution
    let baseUsername = username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '')
    let finalUsername = baseUsername
    let suffix = 2

    while (true) {
      const { data: existingProf } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', finalUsername)
        .maybeSingle()

      if (!existingProf) break
      finalUsername = `${baseUsername}.${suffix}`
      suffix++
    }

    const tempPassword = generateCompliantPassword()
    const placeholderEmail = `${finalUsername}@accounts.dtcereports.vercel.app`

    // 7. Create User with email_confirm: true via Admin Client
    let newUserId = ''
    const { data: signUpData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: placeholderEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'assistant',
        username: finalUsername,
        must_change_password: true
      }
    })

    if (authErr) {
      // If user already exists in auth (e.g. unconfirmed previous attempt), find and auto-confirm/reset password
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = listData?.users.find(u => u.email?.toLowerCase() === placeholderEmail.toLowerCase())
      
      if (existingUser) {
        newUserId = existingUser.id
        await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: 'assistant',
            username: finalUsername,
            must_change_password: true
          }
        })
      } else {
        return NextResponse.json({ error: `Auth creation failed: ${authErr.message}` }, { status: 400 })
      }
    } else {
      newUserId = signUpData.user.id
    }

    // 8. Upsert Profile Row
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: newUserId,
      email: placeholderEmail,
      username: finalUsername,
      full_name: fullName,
      role: 'assistant',
      must_change_password: true,
      created_by: user.id,
      is_active: true
    })

    if (profileErr) {
      return NextResponse.json({ error: `Profile creation failed: ${profileErr.message}` }, { status: 400 })
    }

    // 9. Assign to the current event
    const activeEventId = currentEventId || ''

    if (activeEventId && targetDeptId) {
      await supabaseAdmin.from('hod_assignments').insert({
        event_id: activeEventId,
        profile_id: newUserId,
        department_id: targetDeptId,
        role_in_event: 'assistant'
      })
    }

    // Fetch department name for credential slip
    let deptName = 'Coordinator Office'
    if (targetDeptId) {
      const { data: deptData } = await supabaseAdmin
        .from('departments')
        .select('name')
        .eq('id', targetDeptId)
        .maybeSingle()
      if (deptData?.name) deptName = deptData.name
    }

    return NextResponse.json({
      success: true,
      slip: {
        fullName,
        departmentName: deptName,
        username: finalUsername,
        temporaryPassword: tempPassword,
        role: targetDeptId ? 'ASSISTANT HOD' : 'COORDINATOR ASSISTANT'
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
