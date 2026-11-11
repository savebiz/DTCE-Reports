import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isMock, mockDepartments } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { generateDTCEConventionDocx } from '@/utils/docxGenerator'
import fs from 'fs'
import path from 'path'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { getCurrentEvent, getEventDays } from '@/lib/events/current-event'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const label = searchParams.get('label') || 'Exported Report'

    let userRole = 'super_admin'
    let userId = 'user-admin'
    let event: any = { id: 'event-1', name: 'DTCE 2026 Annual Reporting', start_date: '2026-07-13', end_date: '2026-07-17' }
    let deptsList: any[] = []
    let repsList: any[] = []
    let narrsList: any[] = []
    let eventDaysList: any[] = []
    let preEventTotalsList: any[] = []

    if (isMock) {
      // Mock mode data load
      const user = store.currentUser
      if (user) {
        userRole = user.role
        userId = user.id
      } else {
        userRole = 'super_admin'
        userId = 'user-admin'
      }

      deptsList = mockDepartments
      repsList = store.dailyReports
      narrsList = store.narratives
      eventDaysList = (store as any).eventDays || []
      preEventTotalsList = (store as any).registrationPreEventTotals || []
    } else {
      // Live Supabase Mode — role comes from profiles, never user_metadata
      const auth = await requireAuth({ roles: ADMIN_ROLES })
      if (!auth.ok) return auth.response
      const supabase = await createClient()

      userId = auth.ctx.userId
      userRole = 'super_admin' // passed the admin check above

      // Which event: ?eventId=... for a past event, otherwise the current one
      const requestedEventId = searchParams.get('eventId')
      const target = requestedEventId
        ? (await supabase.from('events').select('*').eq('id', requestedEventId).maybeSingle()).data
        : await getCurrentEvent(supabase)
      if (!target) {
        return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
      }
      event = target

      const { data: depts } = await supabase.from('departments').select('*')
      deptsList = depts || []

      const { data: reps } = await supabase.from('daily_reports').select('*').eq('event_id', event.id)
      repsList = reps || []

      const { data: narrs } = await supabase.from('department_narratives').select('*')
      narrsList = (narrs || []).filter((n: any) => !n.event_id || n.event_id === event.id)

      eventDaysList = await getEventDays(supabase, event.id)

      try {
        const { data: preEventTotals } = await supabase.from('registration_pre_event_totals').select('*').eq('event_id', event.id)
        preEventTotalsList = preEventTotals || []
      } catch (e) {
        // Graceful fallback if table doesn't exist
        preEventTotalsList = []
      }
    }

    // Double-check authorization in mock mode too
    if (userRole !== 'super_admin' && userRole !== 'coordinator') {
      return new Response('Forbidden - Admins or Secretariat only', { status: 403 })
    }

    // Try reading DTCE Logo
    let logoBuffer: Buffer | undefined
    try {
      const logoPath = path.join(process.cwd(), 'public', 'dtce-logo.png')
      if (fs.existsSync(logoPath)) {
        logoBuffer = fs.readFileSync(logoPath)
      }
    } catch (logoErr) {
      console.warn('Failed to load logo image:', logoErr)
    }

    // Generate Word Document Buffer
    const docBuffer = await generateDTCEConventionDocx({
      event,
      departments: deptsList,
      reports: repsList,
      narratives: narrsList,
      eventDays: eventDaysList,
      preEventTotals: preEventTotalsList,
      logoBuffer
    })

    // Log the report version creation in database (non-blocking)
    try {
      const versionPayload = {
        version_number: Math.floor(Math.random() * 100) + 1,
        changed_by: userId,
        change_summary: `Generated Convention DOCX: ${label}`,
        data: {
          event_name: event.name,
          label,
          total_departments: deptsList.length,
          total_reports_processed: repsList.length,
          timestamp: new Date().toISOString()
        }
      }

      if (isMock) {
        const versions = store.reportVersions
        versions.push({
          id: 'v-' + Math.random().toString(36).substr(2, 9),
          daily_report_id: 'report-1', // link to general report in mock
          created_at: new Date().toISOString(),
          ...versionPayload
        })
        store.reportVersions = versions
      } else {
        const supabase = await createClient()
        // Save version log linked to first daily report as anchor
        if (repsList.length > 0) {
          await supabase.from('report_versions').insert({
            daily_report_id: repsList[0].id,
            ...versionPayload
          })
        }
      }
    } catch (versionErr) {
      console.error('Failed to log report version:', versionErr)
    }

    // Return binary file response
    const filename = `${event.name.replace(/\s+/g, '_')}_Report.docx`
    return new Response(new Uint8Array(docBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
