import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { generateCompliantPassword } from '@/lib/password-policy'
import { getServiceRoleKey } from '@/utils/supabase/admin'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { getCurrentEventId } from '@/lib/events/current-event'

// Explicitly use nodejs runtime to ensure full library compatibility
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // 1-2. Secretariat / Coordinator authorization — role from profiles only
    // (user_metadata is editable by the user and must never grant access)
    const auth = await requireAuth({ roles: ADMIN_ROLES })
    if (!auth.ok) return auth.response
    const user = { id: auth.ctx.userId }
    const callerIsSuperAdmin = auth.ctx.role === 'super_admin'

    const serviceRoleKey = getServiceRoleKey()
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

    // Only a Super Admin may create administrator accounts
    const ALLOWED_NEW_ROLES = callerIsSuperAdmin
      ? ['super_admin', 'coordinator', 'national_coordinator', 'hod', 'assistant']
      : ['hod', 'assistant']
    const disallowed = departments.find(d => !ALLOWED_NEW_ROLES.includes(d.role || 'hod'))
    if (disallowed) {
      return NextResponse.json({ error: `Only a Super Admin can create "${disallowed.role}" accounts.` }, { status: 403 })
    }

    // 6. Accounts are assigned to the current event
    const eventId = await getCurrentEventId(supabaseAdmin)
    if (!eventId) {
      return NextResponse.json({ error: 'No current event exists. Create the event first.' }, { status: 400 })
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
      const emailAddress = item.email || `${item.username}@accounts.dtcereports.vercel.app`

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
