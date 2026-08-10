import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
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

    let userRole = 'super_admin'
    let event: any = { id: 'event-1', name: 'DTCE Annual Reporting', start_date: '2026-07-13', end_date: '2026-07-17' }
    let deptsList: any[] = []
    let reqsList: any[] = []
    let repsList: any[] = []
    let eventDaysList: any[] = []

    if (isMock) {
      const user = store.currentUser
      if (user) {
        userRole = user.role
      }
      deptsList = mockDepartments
      reqsList = (store as any).storeRequests || (store as any).store_requests || []
      repsList = store.dailyReports
      eventDaysList = (store as any).eventDays || []
    } else {
      const supabaseUserClient = await createServerClient()
      const { data: { user } } = await supabaseUserClient.auth.getUser()
      if (!user) {
        return new Response('Unauthorized: Log in to export report.', { status: 401 })
      }

      const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
      const supabaseAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { data: callerProfile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      userRole = callerProfile?.role || user.user_metadata?.role || 'assistant'

      if (userRole !== 'super_admin' && userRole !== 'coordinator' && userRole !== 'national_coordinator') {
        return new Response('Forbidden: Only Secretariat Super Admins can export Stores Audit Reports.', { status: 403 })
      }

      // Fetch dynamic datasets
      const { data: events } = await supabaseAdmin.from('events').select('*')
      if (events && events.length > 0) event = events[0]

      const { data: depts } = await supabaseAdmin.from('departments').select('*')
      deptsList = depts || []

      const { data: reqs } = await supabaseAdmin.from('store_requests').select('*')
      reqsList = reqs || []

      const { data: reps } = await supabaseAdmin.from('daily_reports').select('*')
      repsList = reps || []

      const { data: eventDays } = await supabaseAdmin.from('event_days').select('*')
      eventDaysList = eventDays || []
    }

    if (userRole !== 'super_admin' && userRole !== 'coordinator' && userRole !== 'national_coordinator') {
      return new Response('Forbidden: Stores report export is restricted to Super Admins.', { status: 403 })
    }

    // Try loading logo
    let logoBuffer: Buffer | undefined = undefined
    try {
      const possibleLogoPaths = [
        path.join(process.cwd(), 'public', 'images', 'logo.png'),
        path.join(process.cwd(), 'public', 'dtce-logo.png'),
        path.join(process.cwd(), 'public', 'logo.png')
      ]
      for (const p of possibleLogoPaths) {
        if (fs.existsSync(p)) {
          logoBuffer = fs.readFileSync(p)
          break
        }
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

    return new Response(docxBuffer, {
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
