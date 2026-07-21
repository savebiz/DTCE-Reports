import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
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

    // 2. Fetch profile role
    const { data: prof, error: profError } = await supabaseUserClient
      .from('profiles')
      .select('role, department_id')
      .eq('id', user.id)
      .single()

    if (profError || !prof || (prof.role !== 'hod' && prof.role !== 'super_admin' && prof.role !== 'coordinator')) {
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

    const targetDepartmentId = departmentId || prof.department_id
    if (!targetDepartmentId) {
      return NextResponse.json({ error: 'No department associated with this HOD account.' }, { status: 400 })
    }

    // 6. Fetch active event
    let activeEventId = ''
    const { data: eventsList } = await supabaseAdmin.from('events').select('id').limit(1)
    if (eventsList && eventsList.length > 0) {
      activeEventId = eventsList[0].id
    }

    // 7. Resolve username collision
    let baseUsername = username.toLowerCase().trim()
    let finalUsername = baseUsername
    let suffix = 2

    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', finalUsername)
        .maybeSingle()

      if (!existing) break
      finalUsername = `${baseUsername}.${suffix}`
      suffix++
    }

    const tempPassword = generateCompliantPassword()
    const placeholderEmail = `${finalUsername}@accounts.dtce-reports.vercel.app`

    // 8. Create User with email_confirm: true via Admin Client
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
      return NextResponse.json({ error: `Auth creation failed: ${authErr.message}` }, { status: 400 })
    }

    const newUserId = signUpData.user.id

    // 9. Upsert Profile Row
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: newUserId,
      email: placeholderEmail,
      username: finalUsername,
      full_name: fullName,
      role: 'assistant',
      department_id: targetDepartmentId,
      must_change_password: true,
      created_by: user.id,
      is_active: true
    })

    if (profileErr) {
      return NextResponse.json({ error: `Profile creation failed: ${profileErr.message}` }, { status: 400 })
    }

    // 10. Assign to HOD Assignments
    if (activeEventId) {
      await supabaseAdmin.from('hod_assignments').insert({
        event_id: activeEventId,
        profile_id: newUserId,
        department_id: targetDepartmentId,
        role_in_event: 'assistant'
      })
    }

    // Fetch department name
    const { data: deptData } = await supabaseAdmin
      .from('departments')
      .select('name')
      .eq('id', targetDepartmentId)
      .single()

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
