import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { generateCompliantPassword } from '@/lib/password-policy'

// Explicitly use nodejs runtime to ensure full library compatibility
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // 1. Initialize Server client using user's cookies to authenticate session
    const supabaseUserClient = await createServerClient()
    const { data: { user } } = await supabaseUserClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Please log in.' }, { status: 401 })
    }

    // 2. Comprehensive Secretariat / Coordinator authorization check
    let isAuthorized = false

    // Check A: Profile table via User client
    const { data: prof } = await supabaseUserClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (prof && ['super_admin', 'coordinator', 'national_coordinator'].includes(prof.role)) {
      isAuthorized = true
    }

    // Check B: User metadata in Auth session
    const metaRole = user.user_metadata?.role
    if (['super_admin', 'coordinator', 'national_coordinator'].includes(metaRole)) {
      isAuthorized = true
    }

    // Check C: Admin client bypass if service role key exists
    const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!isAuthorized && serviceRoleKey) {
      const supabaseAdminCheck = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey
      )
      const { data: adminProf } = await supabaseAdminCheck
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (adminProf && ['super_admin', 'coordinator', 'national_coordinator'].includes(adminProf.role)) {
        isAuthorized = true
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized: Secretariat access required.' }, { status: 403 })
    }
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server configuration error: Supabase Service Role key is missing.' },
        { status: 500 }
      )
    }

    // 4. Initialize Admin Client with service_role bypass privileges
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    // 5. Parse request body
    const body = await request.json()
    const { departments } = body as {
      departments: Array<{ id?: string | null; name?: string; leaderName: string; username: string; email?: string; role?: string }>
    }

    if (!departments || !Array.isArray(departments) || departments.length === 0) {
      return NextResponse.json({ error: 'Missing departments list in request body.' }, { status: 400 })
    }

    // 6. Fetch or dynamically create active event
    let eventId = ''
    const { data: eventsList } = await supabaseAdmin.from('events').select('id').limit(1)
    if (eventsList && eventsList.length > 0) {
      eventId = eventsList[0].id
    } else {
      // Seed default event if none exists
      const { data: seededEvent, error: seedEventErr } = await supabaseAdmin
        .from('events')
        .insert({
          name: 'DTCE 2026 Annual Reporting',
          start_date: '2026-07-13',
          end_date: '2026-07-17',
          theme_colors: { primary: '#1B3A6B', secondary: '#C49A00' }
        })
        .select('id')
        .single()

      if (seedEventErr || !seededEvent) {
        throw new Error(`Failed to seed active event: ${seedEventErr?.message || 'unknown error'}`)
      }
      eventId = seededEvent.id
    }

    const slips: Array<{
      fullName: string
      departmentName: string
      username: string
      temporaryPassword: string
      role: string
    }> = []

    // 7. Provision loop
    for (const item of departments) {
      const password = generateCompliantPassword()
      const emailAddress = item.email || `${item.username}@accounts.dtce-reports.vercel.app`

      // Resolve the department UUID by matching the name if it is a mock ID (e.g. "dept-25")
      let resolvedDeptId = item.id || null
      if (resolvedDeptId && resolvedDeptId.startsWith('dept-') && item.name) {
        const { data: deptData, error: deptError } = await supabaseAdmin
          .from('departments')
          .select('id')
          .eq('name', item.name)
          .single()
        
        if (!deptError && deptData) {
          resolvedDeptId = deptData.id
        } else {
          // Case-insensitive fallback lookup
          const itemNameLower = item.name.toLowerCase().trim()
          const { data: allDepts } = await supabaseAdmin.from('departments').select('id, name')
          const matched = allDepts?.find(d => d.name.toLowerCase().trim() === itemNameLower)
          if (matched) {
            resolvedDeptId = matched.id
          } else {
            // For admin roles without a department, don't throw — just nullify
            const isAdminRole = (item.role || 'hod') !== 'hod' && (item.role || 'hod') !== 'assistant'
            if (isAdminRole) {
              resolvedDeptId = null
            } else {
              throw new Error(`Could not resolve database UUID for department "${item.name}"`)
            }
          }
        }
      }
      
      const userRole = item.role || 'hod'

      // a. Create User in Supabase Auth via Admin client
      const { data: signUpData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: emailAddress,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name: item.leaderName,
          role: userRole,
          username: item.username,
          must_change_password: true
        }
      })

      if (authErr) {
        throw new Error(`Auth account creation failed for department "${item.name}": ${authErr.message}`)
      }

      const newUserId = signUpData.user.id

      // b. Upsert Profile Row (the database trigger automatically inserts a row upon Auth creation)
      const { error: dbErr } = await supabaseAdmin.from('profiles').upsert({
        id: newUserId,
        email: emailAddress,
        username: item.username,
        full_name: item.leaderName,
        role: userRole,
        must_change_password: true,
        created_by: user.id
      })

      if (dbErr) {
        // Rollback created auth user on database profile insertion failure
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
        throw new Error(`Profile insertion failed for HOD "${item.leaderName}": ${dbErr.message}`)
      }

      // c. Insert Assignment Row
      if (resolvedDeptId) {
        const { error: assignErr } = await supabaseAdmin.from('hod_assignments').insert({
          event_id: eventId,
          profile_id: newUserId,
          department_id: resolvedDeptId,
          role_in_event: userRole
        })

        if (assignErr) {
          // Cleanup if assignment fails
          await supabaseAdmin.from('profiles').delete().eq('id', newUserId)
          await supabaseAdmin.auth.admin.deleteUser(newUserId)
          throw new Error(`Department assignment failed: ${assignErr.message}`)
        }
      }

      slips.push({
        fullName: item.leaderName,
        departmentName: item.name || 'Coordinator Office',
        username: item.username,
        temporaryPassword: password,
        role: userRole === 'national_coordinator' ? 'NATIONAL COORDINATOR' : (userRole === 'coordinator' ? 'COORDINATOR' : 'HOD')
      })
    }

    return NextResponse.json({ success: true, slips })
  } catch (err: any) {
    console.error('Provisioning route handler failure:', err)
    return NextResponse.json({ error: err.message || 'Internal server error occurred.' }, { status: 500 })
  }
}
