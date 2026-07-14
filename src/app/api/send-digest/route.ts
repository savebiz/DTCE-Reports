import { NextResponse } from 'next/server'
import { isMock, mockDepartments, mockProfiles, Profile } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dayNumber = Number(searchParams.get('day') || '1')
    const cutoffTime = searchParams.get('cutoff') || '18:00'

    let activeEventDays: any[] = []
    let departments: any[] = []
    let dailyReports: any[] = []
    let profiles: Profile[] = []

    if (isMock) {
      activeEventDays = [{ id: 'day-1', day_number: 1 }, { id: 'day-2', day_number: 2 }]
      departments = mockDepartments
      dailyReports = store.dailyReports
      profiles = store.profiles
    } else {
      const supabase = await createClient()
      const { data: days } = await supabase.from('event_days').select('*')
      activeEventDays = days || []
      const { data: depts } = await supabase.from('departments').select('*')
      departments = depts || []
      const { data: reps } = await supabase.from('daily_reports').select('*')
      dailyReports = reps || []
      const { data: profs } = await supabase.from('profiles').select('*')
      profiles = profs || []
    }

    const currentDayObj = activeEventDays.find(d => d.day_number === dayNumber)
    if (!currentDayObj) {
      return NextResponse.json({ error: 'Invalid day number specified' }, { status: 400 })
    }

    // Identify departments that have NOT submitted a report for this day
    const submittedDeptIds = new Set(
      dailyReports
        .filter(r => r.event_day_id === currentDayObj.id && (r.status === 'submitted' || r.status === 'approved'))
        .map(r => r.department_id)
    )

    const missingDepts = departments.filter(d => !submittedDeptIds.has(d.id))
    const missingDeptsNames = missingDepts.map(d => d.name)

    const notificationEntries: any[] = []

    // 1. Generate reminders for HODs of missing departments
    missingDepts.forEach(dept => {
      const hods = profiles.filter(p => p.department_id === dept.id && (p.role === 'hod' || p.role === 'assistant'))
      
      hods.forEach(hod => {
        const body = `Dear ${hod.full_name},\n\nThis is a reminder that the daily report for the ${dept.name} Department is missing for Day ${dayNumber} of the convention.\n\nPlease log in to the DTCE Reporting System to enter today's metrics and narrative before the ${cutoffTime} cutoff.\n\nThank you,\nDTCE Secretariat`
        
        notificationEntries.push({
          id: 'notif-' + Math.random().toString(36).substr(2, 9),
          recipient: hod.email,
          recipient_name: hod.full_name,
          subject: `DTCE Reporting Reminder: ${dept.name} (Day ${dayNumber})`,
          body,
          type: 'hod-reminder',
          created_at: new Date().toISOString()
        })
      })
    })

    // 2. Generate summary email for the Secretariat
    const secretariatEmails = profiles.filter(p => p.role === 'super_admin' || p.role === 'coordinator')
    const secBody = `Hi DTCE Secretariat,\n\nThe following ${missingDepts.length} departments have not submitted their reports for Day ${dayNumber} as of today's ${cutoffTime} cutoff:\n\n${missingDeptsNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\nDTCE Automated Digests System`

    secretariatEmails.forEach(sec => {
      notificationEntries.push({
        id: 'notif-' + Math.random().toString(36).substr(2, 9),
        recipient: sec.email,
        recipient_name: sec.full_name,
        subject: `DTCE Daily Collation Summary: Day ${dayNumber}`,
        body: secBody,
        type: 'secretariat-summary',
        created_at: new Date().toISOString()
      })
    })

    // 3. Send via Resend or log to Mock store
    const apiKey = process.env.RESEND_API_KEY
    const sentResults: any[] = []

    for (const notif of notificationEntries) {
      if (apiKey) {
        // Send real email using Resend REST API
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              from: 'DTCE Reporting System <notifications@dtce.org>',
              to: notif.recipient,
              subject: notif.subject,
              text: notif.body
            })
          })
          const resData = await res.json()
          sentResults.push({ notifId: notif.id, status: 'sent', resendId: resData.id })
        } catch (err: any) {
          sentResults.push({ notifId: notif.id, status: 'failed', error: err.message })
        }
      } else {
        // Mock Mode: log statefully to store
        sentResults.push({ notifId: notif.id, status: 'simulated' })
      }
    }

    // Always log to store in mock/simulation runs
    if (isMock || !apiKey) {
      const logs = store.notificationLogs
      store.notificationLogs = [...logs, ...notificationEntries]
    }

    return NextResponse.json({
      success: true,
      day: dayNumber,
      cutoff: cutoffTime,
      missing_departments_count: missingDepts.length,
      notifications_sent: notificationEntries.length,
      delivery_mode: apiKey ? 'live' : 'mock-simulation',
      results: sentResults
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
