import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isMock, mockDepartments, mockEventDays } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { mockPlatformFeedback } from '@/utils/supabase/mockData'
import { compileSecretariatMetrics } from '@/utils/secretariatMetricsExtractor'
import { generateSecretariatDocx } from '@/utils/secretariatDocxGenerator'
import * as fs from 'fs'
import * as path from 'path'

export async function GET() {
  try {
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
      narratives = store.narratives || []
      storeRequests = store.storeRequests || []
      profiles = store.profiles || []
      feedbacks = mockPlatformFeedback || []
      notificationLogs = store.notificationLogs || []
    } else {
      // Production Supabase
      const supabase = await createClient()

      const { data: events } = await supabase.from('events').select('*')
      event = events?.[0] || { name: 'RCCG DTCE 2026 Annual Convention', start_date: '2026-08-03', end_date: '2026-08-08' }

      const { data: depts } = await supabase.from('departments').select('*')
      departments = (depts || mockDepartments).sort((a: any, b: any) => a.name.localeCompare(b.name))

      const { data: days } = await supabase.from('event_days').select('*').order('day_number')
      eventDays = days || mockEventDays

      const { data: reps } = await supabase.from('daily_reports').select('*')
      reports = reps || []

      const { data: narrs } = await supabase.from('department_narratives').select('*')
      narratives = narrs || []

      const { data: sReqs } = await supabase.from('store_requests').select('*')
      storeRequests = sReqs || []

      const { data: invItems } = await supabase.from('inventory_items').select('*')
      inventoryItems = invItems || []

      const { data: invTxns } = await supabase.from('inventory_transactions').select('*')
      inventoryTransactions = invTxns || []

      const { data: profs } = await supabase.from('profiles').select('*')
      profiles = profs || []

      const { data: fbs } = await supabase.from('platform_feedback').select('*')
      feedbacks = fbs || []

      const { data: crs } = await supabase.from('challenge_resolutions').select('*')
      challengeResolutions = crs || []

      const { data: nlogs } = await supabase.from('notification_logs').select('*')
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

    return new NextResponse(docxBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(docxBuffer.length),
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
