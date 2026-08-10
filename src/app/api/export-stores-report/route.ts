import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isMock, mockDepartments } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { generateStoresMaterialsDocx } from '@/utils/storesDocxGenerator'
import fs from 'fs'
import path from 'path'

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
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return new Response('Unauthorized: Log in to export report.', { status: 401 })
      }

      // Fetch dynamic datasets safely using authenticated server client
      const { data: events } = await supabase.from('events').select('*')
      if (events && events.length > 0) event = events[0]

      const { data: depts } = await supabase.from('departments').select('*')
      deptsList = depts || mockDepartments

      const { data: reqs } = await supabase.from('store_requests').select('*')
      reqsList = reqs || []

      const { data: reps } = await supabase.from('daily_reports').select('*')
      repsList = reps || []

      const { data: eventDays } = await supabase.from('event_days').select('*')
      eventDaysList = eventDays || []
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
