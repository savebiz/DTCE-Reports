import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isMock, mockDepartments } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { generateStoresMaterialsDocx } from '@/utils/storesDocxGenerator'
import fs from 'fs'
import path from 'path'
import { requireAuth } from '@/lib/auth/api-guard'
import { getCurrentEvent, getEventDays } from '@/lib/events/current-event'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const label = searchParams.get('label') || 'Stores Material Audit'

    let event: any = { id: 'event-1', name: 'DTCE Annual Reporting', start_date: '2026-07-13', end_date: '2026-07-17' }
    let deptsList: any[] = []
    let reqsList: any[] = []
    let repsList: any[] = []
    let eventDaysList: any[] = []

    if (isMock) {
      deptsList = mockDepartments
      reqsList = (store as any).storeRequests || (store as any).store_requests || []
      repsList = store.dailyReports
      eventDaysList = (store as any).eventDays || []
    } else {
      // Any signed-in, active user may export (RLS still limits what they see)
      const auth = await requireAuth()
      if (!auth.ok) return auth.response
      const supabase = await createClient()

      // ?eventId=... for a past event, otherwise the current one
      const requestedEventId = searchParams.get('eventId')
      const target = requestedEventId
        ? (await supabase.from('events').select('*').eq('id', requestedEventId).maybeSingle()).data
        : await getCurrentEvent(supabase)
      if (!target) {
        return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
      }
      event = target

      const { data: depts } = await supabase.from('departments').select('*')
      deptsList = depts || mockDepartments

      const { data: reqs } = await supabase.from('store_requests').select('*').eq('event_id', event.id)
      reqsList = reqs || []

      const { data: reps } = await supabase.from('daily_reports').select('*').eq('event_id', event.id)
      repsList = reps || []

      eventDaysList = await getEventDays(supabase, event.id)
    }

    // Try loading logo
    let logoBuffer: Buffer | undefined = undefined
    try {
      const logoPath = path.join(process.cwd(), 'public/images/logo.png')
      if (fs.existsSync(logoPath)) {
        logoBuffer = fs.readFileSync(logoPath)
      }
    } catch {
      // Graceful fallback if image file is not on disk
    }

    const docxBuffer = await generateStoresMaterialsDocx({
      event,
      requests: reqsList,
      reports: repsList,
      departments: deptsList,
      eventDays: eventDaysList,
      exportLabel: label,
      logoBuffer
    })

    const safeEventName = (event?.name || 'Convention').replace(/[^a-zA-Z0-9_-]/g, '_')
    const fileName = `DTCE_Stores_Requisition_and_Materials_Flow_Report_${safeEventName}.docx`

    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, max-age=0'
      }
    })
  } catch (err: any) {
    console.error('Stores report export error:', err)
    return NextResponse.json({ error: err.message || 'Failed to generate Stores DOCX report.' }, { status: 500 })
  }
}
