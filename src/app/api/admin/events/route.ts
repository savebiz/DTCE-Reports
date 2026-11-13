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

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ roles: ['super_admin'] })
    if (!auth.ok) return auth.response

    const body = await request.json()
    const { name, event_type, start_date, end_date, set_as_current } = body

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Event name is required' }, { status: 400 })
    }

    const validTypes = ['convention', 'congress', 'other']
    const resolvedType = validTypes.includes(event_type) ? event_type : 'other'
    const eventYear = start_date ? Number(String(start_date).slice(0, 4)) : new Date().getFullYear()

    const supabaseAdmin = getAdminClient()

    if (set_as_current === true) {
      await supabaseAdmin.from('events').update({ is_current: false }).neq('id', '00000000-0000-0000-0000-000000000000')
    }

    const { data: created, error: createErr } = await supabaseAdmin
      .from('events')
      .insert({
        name: String(name).trim(),
        event_type: resolvedType,
        event_year: Number.isFinite(eventYear) ? eventYear : new Date().getFullYear(),
        start_date: start_date || null,
        end_date: end_date || null,
        status: 'planning',
        is_current: set_as_current === true,
      })
      .select('*')
      .single()

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }

    // Auto-generate event_days if both start_date and end_date are provided
    if (created?.id && start_date && end_date) {
      const start = new Date(`${String(start_date).slice(0, 10)}T00:00:00Z`)
      const end = new Date(`${String(end_date).slice(0, 10)}T00:00:00Z`)
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
        const dayRows = []
        let cursor = new Date(start.getTime())
        let dayNum = 1
        while (cursor <= end && dayNum <= 30) {
          dayRows.push({
            event_id: created.id,
            day_number: dayNum,
            date: cursor.toISOString().slice(0, 10),
          })
          cursor = new Date(cursor.getTime() + 86400000)
          dayNum += 1
        }
        if (dayRows.length > 0) {
          await supabaseAdmin.from('event_days').insert(dayRows)
        }
      }
    }

    return NextResponse.json({ success: true, event: created })
  } catch (err: any) {
    console.error('[POST /api/admin/events] Error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
