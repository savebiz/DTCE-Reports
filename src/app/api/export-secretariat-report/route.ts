import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isMock, mockDepartments, mockEventDays } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { mockPlatformFeedback } from '@/utils/supabase/mockData'
import { compileSecretariatMetrics } from '@/utils/secretariatMetricsExtractor'
import { generateSecretariatDocx } from '@/utils/secretariatDocxGenerator'
import * as fs from 'fs'
import * as path from 'path'
import { requireAuth, ADMIN_ROLES } from '@/lib/auth/api-guard'
import { getCurrentEvent, getEventDays } from '@/lib/events/current-event'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    let event: any = null
    let departments: any[] = []
    let eventDays: any[] = []
    let reports: any[] = []
    let narratives: any[] = []
    let storeRequests: any[] = []
    let inventoryItems: any[] = []
    let inventoryTransactions: any[] = []
    let profiles: any[] = []
    let feedbacks: any[] = []
    let challengeResolutions: any[] = []
    let notificationLogs: any[] = []

    if (isMock) {
      // Mock mode
      event = { name: 'RCCG DTCE 2026 Annual Convention', start_date: '2026-08-03', end_date: '2026-08-08' }
      departments = mockDepartments
      eventDays = mockEventDays
      reports = store.dailyReports || []
      narratives = (store as any).narratives || []
      storeRequests = (store as any).storeRequests || (store as any).store_requests || []
      profiles = store.profiles || []
      feedbacks = mockPlatformFeedback || []
      notificationLogs = (store as any).notificationLogs || []
    } else {
      // Production Supabase — admins only
      const auth = await requireAuth({ roles: ADMIN_ROLES })
      if (!auth.ok) return auth.response
      const supabase = await createClient()

      // ?eventId=... for a past event, otherwise the current one
      const requestedEventId = searchParams.get('eventId')
      event = requestedEventId
        ? (await supabase.from('events').select('*').eq('id', requestedEventId).maybeSingle()).data
        : await getCurrentEvent(supabase)
      if (!event) {
        return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
      }

      const { data: depts } = await supabase.from('departments').select('*')
      departments = (depts || mockDepartments).sort((a: any, b: any) => a.name.localeCompare(b.name))

      eventDays = await getEventDays(supabase, event.id)

      const { data: reps } = await supabase.from('daily_reports').select('*').eq('event_id', event.id)
      reports = reps || []

      const { data: narrs } = await supabase.from('department_narratives').select('*').eq('event_id', event.id)
      narratives = narrs || []

      const { data: sReqs } = await supabase.from('store_requests').select('*').eq('event_id', event.id)
      storeRequests = sReqs || []

      const { data: invItems } = await supabase.from('inventory_items').select('*')
      inventoryItems = invItems || []

      let invTxnsQuery = supabase.from('inventory_transactions').select('*').eq('event_id', event.id)
      if (event.start_date) invTxnsQuery = invTxnsQuery.gte('created_at', event.start_date)
      if (event.end_date) invTxnsQuery = invTxnsQuery.lte('created_at', event.end_date + 'T23:59:59.999Z')
      const { data: invTxns } = await invTxnsQuery
      inventoryTransactions = invTxns || []

      const { data: profs } = await supabase.from('profiles').select('*')
      profiles = profs || []

      const { data: fbs } = await supabase.from('platform_feedback').select('*').eq('event_id', event.id)
      feedbacks = fbs || []

      const { data: crs } = await supabase.from('challenge_resolutions').select('*').eq('event_id', event.id)
      challengeResolutions = crs || []

      let nlogsQuery = supabase.from('notification_logs').select('*')
      if (event.start_date) nlogsQuery = nlogsQuery.gte('created_at', event.start_date)
      if (event.end_date) nlogsQuery = nlogsQuery.lte('created_at', event.end_date + 'T23:59:59.999Z')
      const { data: nlogs } = await nlogsQuery
      notificationLogs = nlogs || []
    }

    // Compile all metrics
    const metrics = compileSecretariatMetrics({
      event,
      departments,
      eventDays,
      reports,
      narratives,
      storeRequests,
      inventoryItems,
      inventoryTransactions,
      profiles,
      feedbacks,
      challengeResolutions,
      notificationLogs,
    })

    // Try to load logo
    let logoBuffer: Buffer | undefined
    try {
      const logoPath = path.join(process.cwd(), 'public', 'dtce-logo-white-bg.png')
      if (fs.existsSync(logoPath)) {
        logoBuffer = fs.readFileSync(logoPath)
      }
    } catch { /* logo not critical */ }

    // Generate DOCX
    const docxBuffer = await generateSecretariatDocx(metrics, logoBuffer)

    const filename = `DTCE_Secretariat_Strategic_Board_Report_${new Date().toISOString().slice(0, 10)}.docx`

    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(docxBuffer.length),
        'Cache-Control': 'no-store, max-age=0'
      },
    })
  } catch (err: any) {
    console.error('Secretariat report generation error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to generate secretariat report' },
      { status: 500 }
    )
  }
}
