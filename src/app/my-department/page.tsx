'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, mockDepartments, mockEventDays, mockEvents, Profile, DailyReport, Department } from '@/utils/supabase'
import { DashboardHeader } from '@/components/dashboard-header'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SchemaFormRenderer } from '@/components/schema-form-renderer'
import { getOfflineDraft, saveOfflineDraft, deleteOfflineDraft, queueSubmission, syncQueuedSubmissions, getSyncQueue } from '@/utils/offline'
import { store } from '@/utils/supabase/mockClient'

export default function MyDepartmentDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [department, setDepartment] = useState<Department | null>(null)
  const [eventDays, setEventDays] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [activeDay, setActiveDay] = useState<any | null>(null)
  
  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formStep, setFormStep] = useState(1) // 1: Attendance, 2: Metrics, 3: Narratives, 4: Review
  const [attendanceMorning, setAttendanceMorning] = useState(0)
  const [attendanceEvening, setAttendanceEvening] = useState(0)
  const [metricsData, setMetricsData] = useState<any>({})
  const [narratives, setNarratives] = useState({
    key_achievements: '',
    challenges: '',
    solutions: '',
    plans_for_tomorrow: '',
    feedback: ''
  })

  // Connection & Sync States
  const [isOnline, setIsOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  // 1. Monitor network state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      const handleOnline = () => {
        setIsOnline(true)
        triggerSync()
      }
      const handleOffline = () => setIsOnline(false)

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  // 2. Load User Profile and Data
  const loadData = async () => {
    const supabase = getClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    if (prof) {
      setProfile(prof)
      // Find HOD's department
      const dept = mockDepartments.find(d => d.id === prof.department_id)
      if (dept) setDepartment(dept)

      // Fetch days
      const { data: days } = await supabase.from('event_days').select('*').order('day_number')
      setEventDays(days || [])

      // Fetch existing daily reports
      const { data: reps } = await supabase.from('daily_reports').select('*')
      const deptReps = reps ? reps.filter((r: any) => r.department_id === prof.department_id) : []
      setReports(deptReps)
    }

    // Update pending sync count
    const queue = await getSyncQueue()
    setPendingSyncCount(queue.length)
  }

  useEffect(() => {
    loadData()
  }, [])

  // 3. Trigger Offline Queue Sync
  const triggerSync = async () => {
    setSyncing(true)
    const supabase = getClient()
    const { syncedCount, errors } = await syncQueuedSubmissions(supabase)
    setSyncing(false)
    
    // Update queue count
    const queue = await getSyncQueue()
    setPendingSyncCount(queue.length)

    if (syncedCount > 0) {
      alert(`Successfully synced ${syncedCount} queued report(s) online!`)
      loadData()
    }
    if (errors.length > 0) {
      console.error('Errors syncing reports:', errors)
    }
  }

  // 4. Open Entry Form (either a new row or editing draft)
  const openEntryForm = async (day: any) => {
    setActiveDay(day)
    setFormStep(1)
    
    // Check if there is an existing submitted report in the database
    const dbReport = reports.find(r => r.event_day_id === day.id)
    if (dbReport && dbReport.status !== 'draft') {
      // It is already submitted/approved; open in view-only review step
      const supabase = getClient()
      const { data: narrativesList } = await supabase.from('department_narratives').select('*')
      const dbNarrative = narrativesList ? narrativesList.find((n: any) => n.daily_report_id === dbReport.id) : null

      setAttendanceMorning(dbReport.attendance_morning)
      setAttendanceEvening(dbReport.attendance_evening)
      setMetricsData(dbReport.metrics_data || {})
      setNarratives({
        key_achievements: dbNarrative?.key_achievements || '',
        challenges: dbNarrative?.challenges || '',
        solutions: dbNarrative?.solutions || '',
        plans_for_tomorrow: dbNarrative?.plans_for_tomorrow || '',
        feedback: dbNarrative?.feedback || ''
      })
      setFormStep(4) // Move straight to review step
      setIsFormOpen(true)
      return
    }

    // Check if there is a local offline draft
    if (profile && department) {
      const localDraft = await getOfflineDraft(department.id, day.id)
      if (localDraft) {
        setAttendanceMorning(localDraft.attendance_morning)
        setAttendanceEvening(localDraft.attendance_evening)
        setMetricsData(localDraft.metrics_data || {})
        setNarratives(localDraft.narrative)
        setIsFormOpen(true)
        return
      }
    }

    // Default to clean state
    setAttendanceMorning(0)
    setAttendanceEvening(0)
    setMetricsData({})
    setNarratives({
      key_achievements: '',
      challenges: '',
      solutions: '',
      plans_for_tomorrow: '',
      feedback: ''
    })
    setIsFormOpen(true)
  }

  // 5. Auto-save progress to local storage while typing/incrementing
  useEffect(() => {
    if (isFormOpen && department && activeDay && formStep < 4) {
      saveOfflineDraft(department.id, activeDay.id, {
        event_id: activeDay.event_id,
        attendance_morning: attendanceMorning,
        attendance_evening: attendanceEvening,
        metrics_data: metricsData,
        narrative: narratives,
      })
    }
  }, [attendanceMorning, attendanceEvening, metricsData, narratives])

  // 6. Handle Form Submission
  const handleSubmitReport = async () => {
    if (!profile || !department || !activeDay) return

    setLoading(true)

    const reportPayload = {
      event_id: activeDay.event_id,
      event_day_id: activeDay.id,
      department_id: department.id,
      attendance_morning: attendanceMorning,
      attendance_evening: attendanceEvening,
      metrics_data: metricsData,
      narrative: narratives,
      status: 'submitted' as const,
      updated_at: new Date().toISOString()
    }

    if (!isOnline) {
      // Offline queueing
      await queueSubmission(reportPayload)
      // Delete draft
      await deleteOfflineDraft(department.id, activeDay.id)
      
      alert('You are currently offline. Your submission has been saved locally and will auto-sync once your connection is restored!')
      setPendingSyncCount(prev => prev + 1)
      setIsFormOpen(false)
      setLoading(false)
      loadData()
      return
    }

    // Online submission
    const supabase = getClient()
    try {
      const { data: insertedReport, error: reportErr } = await supabase
        .from('daily_reports')
        .insert({
          event_id: activeDay.event_id,
          event_day_id: activeDay.id,
          department_id: department.id,
          attendance_morning: attendanceMorning,
          attendance_evening: attendanceEvening,
          submitted_by: profile.id,
          status: 'submitted',
        })
        .select()

      if (reportErr) throw reportErr

      const dailyReportId = insertedReport[0].id

      const { error: narrativeErr } = await supabase
        .from('department_narratives')
        .insert({
          daily_report_id: dailyReportId,
          key_achievements: narratives.key_achievements,
          challenges: narratives.challenges,
          solutions: narratives.solutions,
          plans_for_tomorrow: narratives.plans_for_tomorrow,
          feedback: narratives.feedback,
        })

      if (narrativeErr) throw narrativeErr

      // Add to versions
      await supabase.from('report_versions').insert({
        daily_report_id: dailyReportId,
        version_number: 1,
        changed_by: profile.id,
        change_summary: 'Initial submission',
        data: reportPayload,
      })

      // Delete draft
      await deleteOfflineDraft(department.id, activeDay.id)

      alert('Report submitted successfully!')
      setIsFormOpen(false)
      loadData()
    } catch (err: any) {
      alert(`Submission failed: ${err.message}. Saving to sync queue.`);
      await queueSubmission(reportPayload)
      setPendingSyncCount(prev => prev + 1)
      setIsFormOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const [loading, setLoading] = useState(false)

  // Status pill colors
  const getStatusPill = (dayId: string) => {
    const report = reports.find(r => r.event_day_id === dayId)
    if (!report) {
      return (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
          Missing
        </span>
      )
    }

    switch (report.status) {
      case 'draft':
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
            Draft
          </span>
        )
      case 'submitted':
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            Submitted
          </span>
        )
      case 'approved':
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
            Approved
          </span>
        )
      default:
        return null
    }
  }

  const getButtonText = (dayId: string) => {
    const report = reports.find(r => r.event_day_id === dayId)
    if (!report) return "Enter today's data"
    if (report.status === 'draft') return 'Continue draft'
    return 'View submission'
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <DashboardHeader />

      {/* Connectivity Status Bar */}
      <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-amber-500 animate-bounce'}`} />
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            {isOnline ? 'Online' : 'Offline Mode'}
          </span>
        </div>
        {pendingSyncCount > 0 && (
          <div className="flex items-center space-x-3">
            <span className="text-amber-600 dark:text-amber-400 font-bold">
              {pendingSyncCount} pending upload(s)
            </span>
            {isOnline && (
              <Button
                variant="outline"
                size="xs"
                className="h-6 text-[10px] py-0 px-2"
                onClick={triggerSync}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            )}
          </div>
        )}
      </div>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {!isFormOpen ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {department?.name || 'Department'} Reporting Checklist
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Days of the DTCE 2026 Event. Please fill out reporting metrics daily.
              </p>
            </div>

            {/* Stark checklist row - Linear Style */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950 shadow-sm">
              {eventDays.map((day) => (
                <div key={day.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                  <div className="flex items-center space-x-4">
                    <span className="font-mono text-sm font-semibold text-slate-400">
                      Day {day.day_number}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(day.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4">
                    {getStatusPill(day.id)}
                    <Button
                      variant={getButtonText(day.id) === "Enter today's data" ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => openEntryForm(day)}
                    >
                      {getButtonText(day.id)}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Multi-step Mobile/Desktop Form Wizard (Enketo/Kobo Style) */
          <Card className="shadow-2xl border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <CardTitle className="text-xl">
                  {department?.name} Report — Day {activeDay?.day_number}
                </CardTitle>
                <CardDescription>
                  {new Date(activeDay?.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setIsFormOpen(false)}
              >
                ✕ Close
              </Button>
            </CardHeader>

            <CardContent className="pt-6 min-h-[300px]">
              {/* Progress Indicator */}
              <div className="flex items-center space-x-2 pb-6 border-b border-slate-100 dark:border-slate-800 mb-6 text-xs text-slate-400 font-semibold font-mono">
                <span className={formStep === 1 ? 'text-primary font-bold underline' : ''}>1. Attendance</span>
                <span>➔</span>
                <span className={formStep === 2 ? 'text-primary font-bold underline' : ''}>2. Metrics</span>
                <span>➔</span>
                <span className={formStep === 3 ? 'text-primary font-bold underline' : ''}>3. Narrative</span>
                <span>➔</span>
                <span className={formStep === 4 ? 'text-primary font-bold underline' : ''}>4. Review</span>
              </div>

              {/* Step 1: Attendance */}
              {formStep === 1 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold">Step 1: Department Attendance</h3>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-base">Morning Attendance</Label>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-12 w-12 text-lg font-bold"
                          onClick={() => setAttendanceMorning(prev => Math.max(0, prev - 5))}
                        >
                          -5
                        </Button>
                        <Input
                          type="number"
                          value={attendanceMorning}
                          onChange={(e) => setAttendanceMorning(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-12 text-center text-xl font-mono"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-12 w-12 text-lg font-bold"
                          onClick={() => setAttendanceMorning(prev => prev + 5)}
                        >
                          +5
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-base">Evening Attendance</Label>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-12 w-12 text-lg font-bold"
                          onClick={() => setAttendanceEvening(prev => Math.max(0, prev - 5))}
                        >
                          -5
                        </Button>
                        <Input
                          type="number"
                          value={attendanceEvening}
                          onChange={(e) => setAttendanceEvening(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-12 text-center text-xl font-mono"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-12 w-12 text-lg font-bold"
                          onClick={() => setAttendanceEvening(prev => prev + 5)}
                        >
                          +5
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Custom Department Metrics (Schema-driven) */}
              {formStep === 2 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold">Step 2: Department Custom Metrics</h3>
                  {department?.default_metrics_schema ? (
                    <SchemaFormRenderer
                      fields={department.default_metrics_schema.fields}
                      value={metricsData}
                      onChange={setMetricsData}
                    />
                  ) : (
                    <p className="text-slate-400 italic text-sm">
                      No custom metrics required for this department. Click "Next" to continue.
                    </p>
                  )}
                </div>
              )}

              {/* Step 3: Narratives */}
              {formStep === 3 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold">Step 3: Daily Activity Narrative</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="achievements">Key Achievements / Milestones</Label>
                    <Textarea
                      id="achievements"
                      placeholder="List achievements, highlights, or key successes from today..."
                      value={narratives.key_achievements}
                      onChange={(e) => setNarratives(prev => ({ ...prev, key_achievements: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="challenges">Challenges / Roadblocks Encountered</Label>
                    <Textarea
                      id="challenges"
                      placeholder="List any challenges, problems, or blockers you faced today..."
                      value={narratives.challenges}
                      onChange={(e) => setNarratives(prev => ({ ...prev, challenges: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="solutions">Solutions Applied or Needed</Label>
                    <Textarea
                      id="solutions"
                      placeholder="How did you resolve these challenges, or what is needed?"
                      value={narratives.solutions}
                      onChange={(e) => setNarratives(prev => ({ ...prev, solutions: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tomorrow">Plans for Tomorrow</Label>
                    <Textarea
                      id="tomorrow"
                      placeholder="What is your immediate focus for tomorrow's shift?"
                      value={narratives.plans_for_tomorrow}
                      onChange={(e) => setNarratives(prev => ({ ...prev, plans_for_tomorrow: e.target.value }))}
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="feedback">Additional Feedback / Comments</Label>
                    <Textarea
                      id="feedback"
                      placeholder="Notes for the Secretariat team..."
                      value={narratives.feedback}
                      onChange={(e) => setNarratives(prev => ({ ...prev, feedback: e.target.value }))}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Review and Submit (View-Only Review Step) */}
              {formStep === 4 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold">Step 4: Review Your Submission</h3>

                  <div className="grid grid-cols-2 gap-4 border border-slate-100 rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
                    <div>
                      <span className="text-xs font-semibold text-slate-400">Morning Attendance</span>
                      <p className="text-xl font-bold font-mono">{attendanceMorning}</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-400">Evening Attendance</span>
                      <p className="text-xl font-bold font-mono">{attendanceEvening}</p>
                    </div>
                  </div>

                  {department?.default_metrics_schema && (
                    <div className="border border-slate-100 rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
                      <span className="text-xs font-semibold text-slate-400 block mb-2">Custom Metrics Data</span>
                      <SchemaFormRenderer
                        fields={department.default_metrics_schema.fields}
                        value={metricsData}
                        onChange={() => {}}
                        readOnly={true}
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <span className="text-xs font-semibold text-slate-400 block">Narrative Summary</span>
                    <div className="space-y-2 text-sm">
                      <p><strong>Achievements:</strong> {narratives.key_achievements || 'None'}</p>
                      <p><strong>Challenges:</strong> {narratives.challenges || 'None'}</p>
                      <p><strong>Solutions:</strong> {narratives.solutions || 'None'}</p>
                      <p><strong>Tomorrow Plans:</strong> {narratives.plans_for_tomorrow || 'None'}</p>
                      <p><strong>Feedback:</strong> {narratives.feedback || 'None'}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-6">
              {formStep > 1 ? (
                <Button variant="outline" onClick={() => setFormStep(prev => prev - 1)} disabled={loading}>
                  Previous
                </Button>
              ) : (
                <div />
              )}

              {formStep < 4 ? (
                <Button onClick={() => setFormStep(prev => prev + 1)}>
                  Next Step
                </Button>
              ) : (
                reports.find(r => r.event_day_id === activeDay?.id)?.status !== 'submitted' &&
                reports.find(r => r.event_day_id === activeDay?.id)?.status !== 'approved' ? (
                  <Button onClick={handleSubmitReport} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
                    {loading ? 'Submitting...' : 'Submit Report'}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setIsFormOpen(false)}>
                    Close View
                  </Button>
                )
              )}
            </CardFooter>
          </Card>
        )}
      </main>
    </div>
  )
}
