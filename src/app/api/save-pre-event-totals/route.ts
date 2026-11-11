import { NextResponse } from 'next/server'
import { getAdminClient } from '@/utils/supabase/admin'
import { requireAuth } from '@/lib/auth/api-guard'
import { getCurrentEventId } from '@/lib/events/current-event'
import { preEventTotalsFromDepartmentSchema } from '@/lib/events/pre-event-totals'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const EMPTY_TOTALS = { teachers: 0, teens: 0, pre_teens: 0, children: 0 }
const CATEGORIES = ['teachers', 'teens', 'pre_teens', 'children']

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const adminSupabase = getAdminClient()
    const eventId = await getCurrentEventId(adminSupabase)

    let totals: Record<string, number> = { ...EMPTY_TOTALS }

    // 1. Event-scoped table (source of truth)
    let fromTable = false
    if (eventId) {
      const { data: rows } = await adminSupabase
        .from('registration_pre_event_totals')
        .select('category, total_online_registered')
        .eq('event_id', eventId)
      if (rows && rows.length > 0) {
        rows.forEach((r: any) => { totals[r.category] = Number(r.total_online_registered) || 0 })
        fromTable = true
      }
    }

    // 2. Department mirror, only if it belongs to the current event
    if (!fromTable) {
      const { data: depts } = await adminSupabase.from('departments').select('id, name, default_metrics_schema')
      const regDept = (depts || []).find((d: any) => d.name && d.name.toLowerCase().includes('registration'))
      const mirrored = preEventTotalsFromDepartmentSchema(regDept?.default_metrics_schema, eventId)
      if (mirrored) totals = { ...totals, ...mirrored }
    }

    return NextResponse.json(
      { success: true, totals, eventId },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    // Super Admin only (the editing button is Super Admin only in the UI too).
    const auth = await requireAuth({ roles: ['super_admin'] })
    if (!auth.ok) return auth.response

    const body = await req.json()
    const { totals } = body

    if (!totals || typeof totals !== 'object') {
      return NextResponse.json({ error: 'Invalid totals payload' }, { status: 400 })
    }

    const adminSupabase = getAdminClient()
    const eventId = await getCurrentEventId(adminSupabase)

    // 1. Fetch Registration department
    const { data: depts, error: fetchErr } = await adminSupabase
      .from('departments')
      .select('id, name, default_metrics_schema')

    if (fetchErr) {
      console.error('Error fetching departments:', fetchErr)
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    const regDept = (depts || []).find((d: any) => d.name && d.name.toLowerCase().includes('registration'))

    if (!regDept) {
      return NextResponse.json({ error: 'Registration department not found' }, { status: 404 })
    }

    // 2. Mirror onto the Registration department, stamped with the event
    const currentSchema = regDept.default_metrics_schema || {}
    const updatedSchema = {
      ...currentSchema,
      pre_event_online_totals: totals,
      pre_event_online_totals_event_id: eventId
    }

    const { error: updateErr } = await adminSupabase
      .from('departments')
      .update({ default_metrics_schema: updatedSchema })
      .eq('id', regDept.id)

    if (updateErr) {
      console.error('Error updating departments table:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // 3. Event-scoped table
    if (eventId) {
      const rows = CATEGORIES.map(cat => ({
        event_id: eventId,
        category: cat,
        total_online_registered: Number(totals[cat]) || 0,
        updated_at: new Date().toISOString()
      }))

      try {
        await adminSupabase
          .from('registration_pre_event_totals')
          .upsert(rows, { onConflict: 'event_id,category' })
      } catch (e) {
        // Table schema cache warning ignored
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Pre-event online totals saved to database successfully',
      totals,
      eventId
    })
  } catch (err: any) {
    console.error('API /api/save-pre-event-totals error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
