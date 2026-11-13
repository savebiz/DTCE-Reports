import { NextResponse } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { requireAuth } from '@/lib/auth/api-guard'

export async function GET() {
  try {
    const auth = await requireAuth({ roles: ['super_admin'] })
    if (!auth.ok) return auth.response

    const supabaseAdmin = getAdminClient()
    const { data, error } = await supabaseAdmin
      .from('events')
      .select('*')
      .order('start_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, events: data || [] })
  } catch (err: any) {
    console.error('[GET /api/admin/events] Error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth({ roles: ['super_admin'] })
    if (!auth.ok) return auth.response

    const body = await request.json()
    const {
      eventId,
      start_date,
      end_date,
      status,
      requisition_opens_at,
      requisition_closes_at,
      live_requisition_opens_at,
      pre_event_override,
      live_requisition_override,
      set_as_current,
    } = body

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const validStatuses = ['planning', 'requisition_open', 'live', 'closed', 'archived']
    const validOverrides = ['auto', 'force_open', 'force_closed']

    const updates: Record<string, any> = {}
    if (start_date !== undefined) updates.start_date = start_date || null
    if (end_date !== undefined) updates.end_date = end_date || null
    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid event status' }, { status: 400 })
      }
      updates.status = status
    }
    if (requisition_opens_at !== undefined) updates.requisition_opens_at = requisition_opens_at || null
    if (requisition_closes_at !== undefined) updates.requisition_closes_at = requisition_closes_at || null
    if (live_requisition_opens_at !== undefined) updates.live_requisition_opens_at = live_requisition_opens_at || null
    if (pre_event_override !== undefined) {
      if (!validOverrides.includes(pre_event_override)) {
        return NextResponse.json({ error: 'Invalid pre_event_override' }, { status: 400 })
      }
      updates.pre_event_override = pre_event_override
    }
    if (live_requisition_override !== undefined) {
      if (!validOverrides.includes(live_requisition_override)) {
        return NextResponse.json({ error: 'Invalid live_requisition_override' }, { status: 400 })
      }
      updates.live_requisition_override = live_requisition_override
    }

    const supabaseAdmin = getAdminClient()

    if (set_as_current === true) {
      await supabaseAdmin.from('events').update({ is_current: false }).neq('id', eventId)
      updates.is_current = true
    }

    const { data: updated, error } = await supabaseAdmin
      .from('events')
      .update(updates)
      .eq('id', eventId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, event: updated })
  } catch (err: any) {
    console.error('[PATCH /api/admin/events] Error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
