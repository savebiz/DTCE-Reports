import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { totals, userRole } = body

    if (!totals || typeof totals !== 'object') {
      return NextResponse.json({ error: 'Invalid totals payload' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server environment credentials missing' }, { status: 500 })
    }

    // Use admin service role client to bypass RLS restrictions on departments table
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

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

    // 2. Update default_metrics_schema on Registration department
    const currentSchema = regDept.default_metrics_schema || {}
    const updatedSchema = { ...currentSchema, pre_event_online_totals: totals }

    const { error: updateErr } = await adminSupabase
      .from('departments')
      .update({ default_metrics_schema: updatedSchema })
      .eq('id', regDept.id)

    if (updateErr) {
      console.error('Error updating departments table:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // 3. Optionally upsert into registration_pre_event_totals table if present
    const { data: ev } = await adminSupabase.from('events').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (ev?.id) {
      const CATEGORIES = ['teachers', 'teens', 'pre_teens', 'children']
      const rows = CATEGORIES.map(cat => ({
        event_id: ev.id,
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
      totals
    })
  } catch (err: any) {
    console.error('API /api/save-pre-event-totals error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
