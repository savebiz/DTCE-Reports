import localforage from 'localforage'

// Configure localforage
localforage.config({
  name: 'dtce_reporting_db',
  storeName: 'offline_records',
})

const DRAFTS_KEY = 'dtce_offline_drafts'
const QUEUE_KEY = 'dtce_offline_queue'

export interface OfflineReport {
  id?: string
  event_id: string
  event_day_id: string
  department_id: string
  attendance_morning: number
  attendance_evening: number
  metrics_data: any
  narrative: {
    key_achievements: string
    challenges: string
    solutions: string
    plans_for_tomorrow: string
    feedback: string
  }
  status: 'draft' | 'submitted'
  updated_at: string
}

// 1. Save or Update Draft Locally
export async function saveOfflineDraft(
  deptId: string,
  dayId: string,
  reportData: Partial<OfflineReport>
): Promise<void> {
  const drafts = (await localforage.getItem<Record<string, OfflineReport>>(DRAFTS_KEY)) || {}
  const key = `${deptId}-${dayId}`
  
  drafts[key] = {
    ...drafts[key],
    ...reportData,
    department_id: deptId,
    event_day_id: dayId,
    status: 'draft',
    updated_at: new Date().toISOString(),
  } as OfflineReport

  await localforage.setItem(DRAFTS_KEY, drafts)
}

// 2. Get Draft Locally
export async function getOfflineDraft(deptId: string, dayId: string): Promise<OfflineReport | null> {
  const drafts = (await localforage.getItem<Record<string, OfflineReport>>(DRAFTS_KEY)) || {}
  return drafts[`${deptId}-${dayId}`] || null
}

// 3. Clear Local Draft
export async function deleteOfflineDraft(deptId: string, dayId: string): Promise<void> {
  const drafts = (await localforage.getItem<Record<string, OfflineReport>>(DRAFTS_KEY)) || {}
  delete drafts[`${deptId}-${dayId}`]
  await localforage.setItem(DRAFTS_KEY, drafts)
}

// 4. Queue Submission (waiting for sync)
export async function queueSubmission(report: OfflineReport): Promise<void> {
  const queue = (await localforage.getItem<OfflineReport[]>(QUEUE_KEY)) || []
  queue.push({
    ...report,
    status: 'submitted',
    updated_at: new Date().toISOString(),
  })
  await localforage.setItem(QUEUE_KEY, queue)
}

// 5. Get Sync Queue
export async function getSyncQueue(): Promise<OfflineReport[]> {
  return (await localforage.getItem<OfflineReport[]>(QUEUE_KEY)) || []
}

// 6. Clear Queue
export async function clearSyncQueue(): Promise<void> {
  await localforage.setItem(QUEUE_KEY, [])
}

// 7. Sync all queued submissions to Supabase
export async function syncQueuedSubmissions(supabaseClient: any): Promise<{ syncedCount: number; errors: any[] }> {
  const queue = await getSyncQueue()
  if (queue.length === 0) return { syncedCount: 0, errors: [] }

  let syncedCount = 0
  const errors: any[] = []
  const remainingQueue: OfflineReport[] = []

  for (const report of queue) {
    try {
      // Get current user id
      const { data: { user } } = await supabaseClient.auth.getUser()
      if (!user) throw new Error('User session not found during sync')

      // Insert/update daily_reports
      const { data: insertedReport, error: reportErr } = await supabaseClient
        .from('daily_reports')
        .insert({
          event_id: report.event_id,
          event_day_id: report.event_day_id,
          department_id: report.department_id,
          attendance_morning: report.attendance_morning,
          attendance_evening: report.attendance_evening,
          submitted_by: user.id,
          status: 'submitted',
        })
        .select()

      if (reportErr) throw reportErr

      const dailyReportId = insertedReport[0].id

      // Insert department_narratives
      const { error: narrativeErr } = await supabaseClient
        .from('department_narratives')
        .insert({
          daily_report_id: dailyReportId,
          key_achievements: report.narrative.key_achievements,
          challenges: report.narrative.challenges,
          solutions: report.narrative.solutions,
          plans_for_tomorrow: report.narrative.plans_for_tomorrow,
          feedback: report.narrative.feedback,
        })

      if (narrativeErr) throw narrativeErr

      // Add to report version history
      await supabaseClient.from('report_versions').insert({
        daily_report_id: dailyReportId,
        version_number: 1,
        changed_by: user.id,
        change_summary: 'Synced from offline submission',
        data: report,
      })

      // Clean up the draft locally since it has been synced successfully
      await deleteOfflineDraft(report.department_id, report.event_day_id)
      syncedCount++
    } catch (err: any) {
      errors.push({ report, error: err.message })
      remainingQueue.push(report)
    }
  }

  // Update queue with whatever failed to sync
  await localforage.setItem(QUEUE_KEY, remainingQueue)

  return { syncedCount, errors }
}
