import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { mockDepartments } from '@/utils/supabase'
import { generateCompliantPassword } from '@/lib/password-policy'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user session
    const supabaseUserClient = await createServerClient()
    const { data: { user } } = await supabaseUserClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Please log in.' }, { status: 401 })
    }

    // 2. Comprehensive HOD / Secretariat authorization check
    let isAuthorized = false
    let userDeptId = ''

    // Check A: Profile table
    const { data: prof } = await supabaseUserClient
      .from('profiles')
      .select('role, department_id')
      .eq('id', user.id)
      .maybeSingle()

    if (prof) {
      if (['hod', 'super_admin', 'coordinator'].includes(prof.role)) {
        isAuthorized = true
      }
      if (prof.department_id) {
        userDeptId = prof.department_id
      }
    }

    // Check B: User metadata in Auth session
    const metaRole = user.user_metadata?.role
    if (['hod', 'super_admin', 'coordinator'].includes(metaRole)) {
      isAuthorized = true
    }
    if (!userDeptId && user.user_metadata?.department_id) {
      userDeptId = user.user_metadata.department_id
    }

    // Check C: hod_assignments table in Database
    const { data: assignment } = await supabaseUserClient
      .from('hod_assignments')
      .select('department_id')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (assignment) {
      isAuthorized = true
      if (!userDeptId) {
        userDeptId = assignment.department_id
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized: HOD or Secretariat permissions required.' }, { status: 403 })
    }

    // 3. Service role key check
    const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server configuration error: Service role key is missing.' },
        { status: 500 }
      )
    }

    // 4. Initialize Admin Client
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    // 5. Parse request body
    const body = await request.json()
    const { fullName, username, departmentId } = body as {
      fullName: string
      username: string
      departmentId?: string
    }

    if (!fullName || !username) {
      return NextResponse.json({ error: 'Full name and username are required.' }, { status: 400 })
    }

    let targetDeptId = departmentId || userDeptId
    if (!targetDeptId) {
      return NextResponse.json({ error: 'No department associated with this account.' }, { status: 400 })
    }

    // Resolve department UUID if string starts with "dept-"
    if (targetDeptId.startsWith('dept-')) {
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
    const placeholderEmail = `${finalUsername}@accounts.dtce-reports.vercel.app`

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
      department_id: targetDeptId,
      must_change_password: true,
      created_by: user.id,
      is_active: true
    })

    if (profileErr) {
      return NextResponse.json({ error: `Profile creation failed: ${profileErr.message}` }, { status: 400 })
    }

    // 9. Assign to HOD Assignments
    let activeEventId = ''
    const { data: eventsList } = await supabaseAdmin.from('events').select('id').limit(1)
    if (eventsList && eventsList.length > 0) {
      activeEventId = eventsList[0].id
    }

    if (activeEventId) {
      await supabaseAdmin.from('hod_assignments').insert({
        event_id: activeEventId,
        profile_id: newUserId,
        department_id: targetDeptId,
        role_in_event: 'assistant'
      })
    }

    // Fetch department name for credential slip
    const { data: deptData } = await supabaseAdmin
      .from('departments')
      .select('name')
      .eq('id', targetDeptId)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      slip: {
        fullName,
        departmentName: deptData?.name || 'Department',
        username: finalUsername,
        temporaryPassword: tempPassword,
        role: 'ASSISTANT HOD'
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
