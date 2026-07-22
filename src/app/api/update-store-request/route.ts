import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

/**
 * POST /api/update-store-request
 *
 * Server-side API endpoint using service role key to bypass RLS when updating store_requests.
 * Allows Stores HOD and Coordinators to update requisition statuses (e.g. approved -> in_progress -> delivered).
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUserClient = await createServerClient()
    const { data: { user }, error: authErr } = await supabaseUserClient.auth.getUser()

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { requestId, status, reviewerComments } = body as {
      requestId: string
      status: string
      reviewerComments?: string
    }

    if (!requestId || !status) {
      return NextResponse.json({ error: 'requestId and status are required' }, { status: 400 })
    }

    const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
    }

    const supabaseAdmin = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Build update object
    const updatePayload: Record<string, any> = {
      status
    }

    if (reviewerComments !== undefined) {
      updatePayload.reviewer_comments = reviewerComments
      updatePayload.reviewed_at = new Date().toISOString()
    }

    // Perform update with admin privileges
    const { data, error } = await supabaseAdmin
      .from('store_requests')
      .update(updatePayload)
      .eq('id', requestId)
      .select()

    if (error) {
      console.error('Error updating store request:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('API update-store-request error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
