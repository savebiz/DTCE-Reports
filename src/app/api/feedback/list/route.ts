import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { isMock, mockDepartments } from '@/utils/supabase'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { store } from '@/utils/supabase/mockClient'
import { getServiceRoleKey } from '@/utils/supabase/admin'

export const runtime = 'nodejs'

export async function GET() {
  try {
    if (isMock) {
      const feedbacks = store.platformFeedback || []
      const profiles = store.profiles || []
      const profMap: Record<string, any> = {}
      profiles.forEach((p: any) => { profMap[p.id] = p })

      const enriched = feedbacks.map((f: any) => {
        const p = profMap[f.profile_id] || {}
        const dept = mockDepartments.find((d: any) => d.id === p.department_id)
        return {
          ...f,
          profile: {
            full_name: p.full_name || 'HOD Delegate',
            email: p.email || '—',
            role: p.role || 'hod',
            department_id: p.department_id,
            department_name: dept?.name || 'Department'
          }
        }
      })
      return NextResponse.json({ feedbacks: enriched })
    }

    // 1. Authenticate caller user (active admin only)
    const auth = await requireAuth({ roles: ADMIN_ROLES })
    if (!auth.ok) return auth.response

    const serviceRoleKey = getServiceRoleKey()
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // 3. Fetch all feedback records using admin client (bypasses RLS issues)
    const { data: dbFeedbacks, error: fbErr } = await supabaseAdmin
      .from('platform_feedback')
      .select('*')
      .order('submitted_at', { ascending: false })

    if (fbErr) {
      console.error('Error fetching platform_feedback:', fbErr)
      return NextResponse.json({ error: fbErr.message }, { status: 500 })
    }

    // 4. Fetch profiles & departments to enrich feedback records
    const { data: dbProfiles } = await supabaseAdmin.from('profiles').select('*')
    const { data: dbDepts } = await supabaseAdmin.from('departments').select('*')

    const profMap: Record<string, any> = {}
    if (dbProfiles) {
      dbProfiles.forEach((p: any) => { profMap[p.id] = p })
    }

    const deptMap: Record<string, string> = {}
    const deptsList = dbDepts && dbDepts.length > 0 ? dbDepts : mockDepartments
    deptsList.forEach((d: any) => { deptMap[d.id] = d.name })

    // Also fetch hod_assignments to resolve department_id if missing on profile
    const { data: dbAssigns } = await supabaseAdmin.from('hod_assignments').select('*')
    const assignMap: Record<string, string> = {}
    if (dbAssigns) {
      dbAssigns.forEach((a: any) => {
        if (a.profile_id && a.department_id) {
          assignMap[a.profile_id] = a.department_id
        }
      })
    }

    const enriched = (dbFeedbacks || []).map((f: any) => {
      const p = profMap[f.profile_id] || {}
      const effectiveDeptId = p.department_id || assignMap[f.profile_id]
      const deptName = deptMap[effectiveDeptId] || (effectiveDeptId ? 'Department' : 'Secretariat / National')

      return {
        ...f,
        profile: {
          full_name: p.full_name || p.username || 'Delegate User',
          email: p.email || '—',
          role: p.role || 'hod',
          department_id: effectiveDeptId,
          department_name: deptName
        }
      }
    })

    return NextResponse.json({ feedbacks: enriched })
  } catch (err: any) {
    console.error('feedback/list route error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 })
  }
}
