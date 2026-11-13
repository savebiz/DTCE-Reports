import { NextResponse } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { isMock } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ roles: ADMIN_ROLES })
    if (!auth.ok) return auth.response

    const { requestId, assignedApproverId } = await request.json()
    if (!requestId) {
      return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })
    }

    const targetApproverId = assignedApproverId && assignedApproverId !== 'none' ? assignedApproverId : null

    if (isMock) {
      const reqs = (store as any).storeRequests || []
      const match = reqs.find((r: any) => r.id === requestId)
      if (!match) {
        return NextResponse.json({ error: 'Requisition not found.' }, { status: 404 })
      }
      match.assigned_approver_id = targetApproverId
      return NextResponse.json({ success: true, assigned_approver_id: targetApproverId })
    }

    const supabaseAdmin = getAdminClient()

    if (targetApproverId) {
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', targetApproverId)
        .maybeSingle()
      if (!targetProfile || targetProfile.is_active === false) {
        return NextResponse.json({ error: 'Target approver not found or inactive.' }, { status: 400 })
      }
    }

    const { error } = await supabaseAdmin
      .from('store_requests')
      .update({ assigned_approver_id: targetApproverId })
      .eq('id', requestId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, assigned_approver_id: targetApproverId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
