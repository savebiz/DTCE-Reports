import { NextResponse } from 'next/server'
import { isMock, mockDepartments, Profile } from '@/utils/supabase'
import { store } from '@/utils/supabase/mockClient'
import { createClient } from '@/utils/supabase/server'
import { notify } from '@/lib/notifications/dispatch'

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dayNumber = Number(searchParams.get('day') || '1')
    const cutoffTime = searchParams.get('cutoff') || '18:00'

    let activeEventDays: any[] = []
    let departments: any[] = []
    let dailyReports: any[] = []
    let profiles: Profile[] = []

    let hodAssignments: any[] = []

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
      const { data: assigns } = await supabase.from('hod_assignments').select('*')
      hodAssignments = assigns || []
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

    const results: any[] = []

    // 1. Dispatch reminders for HODs and Assistants of missing departments
    for (const dept of missingDepts) {
      const assignedProfileIds = new Set<string>()
      
      profiles.forEach(p => {
        if (p.department_id === dept.id && (p.role === 'hod' || p.role === 'assistant')) {
          assignedProfileIds.add(p.id)
        }
      })

      hodAssignments.forEach(h => {
        if (h.department_id === dept.id) {
          assignedProfileIds.add(h.profile_id)
        }
      })

      const deptStaff = profiles.filter(p => assignedProfileIds.has(p.id))
      
      for (const staff of deptStaff) {
        const body = `Reminder: The daily report for the ${dept.name} Department is missing for Day ${dayNumber}.\n\nPlease log in to enter today's metrics and narrative before the ${cutoffTime} cutoff.`
        
        const dispatchRes = await notify({
          recipientId: staff.id,
          type: 'missing_report_reminder',
          title: `DTCE Reporting Reminder: ${dept.name} (Day ${dayNumber})`,
          body,
          relatedEntity: { type: 'report', id: currentDayObj.id }
        })
        results.push({ recipient: staff.email, type: 'hod-reminder', dispatchRes })
      }
    }

    // 2. Dispatch summary notification for Secretariat via unified notify() service
    const secretariatUsers = profiles.filter(p => p.role === 'super_admin' || p.role === 'coordinator' || p.role === 'national_coordinator')
    const secBody = `The following ${missingDepts.length} departments have not submitted their reports for Day ${dayNumber} as of today's ${cutoffTime} cutoff:\n\n${missingDeptsNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}`

    for (const sec of secretariatUsers) {
      const dispatchRes = await notify({
        recipientId: sec.id,
        type: 'secretariat_summary',
        title: `DTCE Daily Collation Summary: Day ${dayNumber}`,
        body: secBody,
        relatedEntity: { type: 'report', id: currentDayObj.id }
      })
      results.push({ recipient: sec.email, type: 'secretariat-summary', dispatchRes })
    }

    return NextResponse.json({
      success: true,
      day: dayNumber,
      cutoff: cutoffTime,
      missing_departments_count: missingDepts.length,
      notifications_dispatched: results.length,
      results
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
