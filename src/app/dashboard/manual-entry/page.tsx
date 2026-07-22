'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getClient, isMock, mockDepartments, mockEventDays, Profile, Department } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SchemaFormRenderer } from '@/components/schema-form-renderer'
import { NumberField } from '@/components/ui/number-field'
import { CurrencyField } from '@/components/ui/currency-field'
import { FileEdit, ShieldCheck, CheckCircle2, Save, ArrowLeft, Building2, Calendar, UserCheck, AlertCircle } from 'lucide-react'

// Departments without workforce attendance breakdown
const DEPTS_WITHOUT_ATTENDANCE = ['dept-6', 'dept-9', 'dept-13', 'dept-19', 'dept-20', 'dept-25', 'dept-26', 'dept-29', 'dept-30', 'dept-39']

function ManualEntryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initDeptId = searchParams?.get('deptId')
  const initDayId = searchParams?.get('dayId')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [eventDays, setEventDays] = useState<any[]>([])

  // Target Selections
  const [selectedDeptId, setSelectedDeptId] = useState<string>(initDeptId || '')
  const [selectedDayId, setSelectedDayId] = useState<string>(initDayId || '')

  // Active Report State
  const [reportId, setReportId] = useState<string | null>(null)
  const [existingReport, setExistingReport] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form Fields
  const [attendanceMorning, setAttendanceMorning] = useState<number>(0)
  const [attendanceEvening, setAttendanceEvening] = useState<number>(0)
  const [workforce, setWorkforce] = useState({
    teachersMale: 0,
    teachersFemale: 0,
    teenagersMale: 0,
    teenagersFemale: 0,
    preteensMale: 0,
    preteensFemale: 0,
    childrenMale: 0,
    childrenFemale: 0,
  })
  const [offering, setOffering] = useState<number>(0)
  const [metricsData, setMetricsData] = useState<Record<string, any>>({})
  const [dailyOverview, setDailyOverview] = useState('')
  const [dailyAchievements, setDailyAchievements] = useState('')
  const [dailyChallenges, setDailyChallenges] = useState('')
  const [dailyRecommendations, setDailyRecommendations] = useState('')

  // 1. Initial Load & Authentication
  useEffect(() => {
    async function init() {
      const supabase = getClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user && !isMock) {
        router.push('/login')
        return
      }

      if (user) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (prof) {
          if (!['super_admin', 'national_coordinator', 'coordinator'].includes(prof.role)) {
            showToast('Access restricted to Secretariat & Coordinators', 'error')
            router.push('/dashboard')
            return
          }
          setProfile(prof)
        }
      } else {
        setProfile({
          id: 'mock-admin',
          email: 'admin@dtce.org',
          full_name: 'Secretariat Admin',
          role: 'super_admin',
        } as Profile)
      }

      // Load Departments
      let deptsList: Department[] = []
      if (isMock) {
        deptsList = mockDepartments as Department[]
      } else {
        const { data: depts } = await supabase.from('departments').select('*').order('name')
        deptsList = depts || []
      }
      setDepartments(deptsList)

      // Load Event Days
      let daysList: any[] = []
      if (isMock) {
        daysList = mockEventDays
      } else {
        const { data: days } = await supabase.from('event_days').select('*').order('day_number')
        daysList = days || []
      }
      setEventDays(daysList)

      // Set Default Selections if not passed via URL
      if (!initDeptId && deptsList.length > 0) {
        setSelectedDeptId(deptsList[0].id)
      }
      if (!initDayId && daysList.length > 0) {
        setSelectedDayId(daysList[0].id)
      }
    }

    init()
  }, [router, initDeptId, initDayId])

  // 2. Fetch existing report whenever department or day selection changes
  useEffect(() => {
    if (!selectedDeptId || !selectedDayId) return

    async function loadTargetReport() {
      setLoading(true)
      const supabase = getClient()

      let rep: any = null
      if (isMock) {
        const mockStore = require('@/utils/supabase/mockClient').getMockStore()
        rep = mockStore.dailyReports.find((r: any) =>
          r.department_id === selectedDeptId &&
          (r.event_day_id === selectedDayId || r.event_day_id === `day-${selectedDayId.replace('day-', '')}`)
        )
      } else {
        const { data } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('department_id', selectedDeptId)
          .eq('event_day_id', selectedDayId)
          .maybeSingle()
        rep = data
      }

      if (rep) {
        setReportId(rep.id)
        setExistingReport(rep)
        setAttendanceMorning(rep.attendance_morning || 0)
        setAttendanceEvening(rep.attendance_evening || 0)

        const mData = rep.metrics_data || {}
        setWorkforce({
          teachersMale: mData.workforce?.teachersMale || 0,
          teachersFemale: mData.workforce?.teachersFemale || 0,
          teenagersMale: mData.workforce?.teenagersMale || 0,
          teenagersFemale: mData.workforce?.teenagersFemale || 0,
          preteensMale: mData.workforce?.preteensMale || 0,
          preteensFemale: mData.workforce?.preteensFemale || 0,
          childrenMale: mData.workforce?.childrenMale || 0,
          childrenFemale: mData.workforce?.childrenFemale || 0,
        })
        setOffering(mData.offering || mData.total_offering || 0)
        setMetricsData(mData.custom_schema || {})

        const dn = mData.daily_narrative || {}
        setDailyOverview(dn.overview || '')
        setDailyAchievements(dn.achievements || '')
        setDailyChallenges(dn.challenges || '')
        setDailyRecommendations(dn.recommendations || '')
      } else {
        // Reset form for fresh paper report entry
        setReportId(null)
        setExistingReport(null)
        setAttendanceMorning(0)
        setAttendanceEvening(0)
        setWorkforce({
          teachersMale: 0,
          teachersFemale: 0,
          teenagersMale: 0,
          teenagersFemale: 0,
          preteensMale: 0,
          preteensFemale: 0,
          childrenMale: 0,
          childrenFemale: 0,
        })
        setOffering(0)
        setMetricsData({})
        setDailyOverview('')
        setDailyAchievements('')
        setDailyChallenges('')
        setDailyRecommendations('')
      }

      setLoading(false)
    }

    loadTargetReport()
  }, [selectedDeptId, selectedDayId])

  // Selected Objects
  const selectedDept = departments.find(d => d.id === selectedDeptId)
  const selectedDay = eventDays.find(d => d.id === selectedDayId || `day-${d.day_number}` === selectedDayId)
  const hasWorkforce = selectedDept ? !DEPTS_WITHOUT_ATTENDANCE.includes(selectedDept.id) : true

  // 3. Save / Submit Handler
  const handleSubmit = async (submitStatus: 'draft' | 'submitted') => {
    if (!profile || !selectedDept || !selectedDay) {
      showToast('Please select a valid department and event day.', 'error')
      return
    }

    setSaving(true)
    const supabase = getClient()

    const payload = {
      event_id: selectedDay.event_id || 'evt-1',
      event_day_id: selectedDay.id,
      department_id: selectedDept.id,
      submitted_by: profile.id,
      submitted_on_behalf_by: profile.id,
      attendance_morning: attendanceMorning,
      attendance_evening: attendanceEvening,
      status: submitStatus,
      metrics_data: {
        custom_schema: metricsData,
        workforce,
        offering,
        daily_narrative: {
          overview: dailyOverview,
          achievements: dailyAchievements,
          challenges: dailyChallenges,
          recommendations: dailyRecommendations,
        },
        proxy_entry: {
          entered_by_name: profile.full_name || profile.email,
          entered_by_id: profile.id,
          timestamp: new Date().toISOString(),
          is_manual_paper_entry: true,
        },
      },
    }

    try {
      if (reportId) {
        const { error } = await supabase
          .from('daily_reports')
          .update(payload)
          .eq('id', reportId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('daily_reports')
          .insert(payload)
          .select()
        if (error) throw error
        if (data && data.length > 0) {
          setReportId(data[0].id)
        }
      }

      showToast(
        submitStatus === 'submitted'
          ? `Paper report for ${selectedDept.name} submitted successfully!`
          : `Draft report for ${selectedDept.name} saved!`,
        'success'
      )
      router.push('/dashboard')
    } catch (err: any) {
      showToast(`Failed to save manual report: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="max-w-[1200px] mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* ── Page Top Header ────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
              Secretariat Desk Proxy Portal
            </span>
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <FileEdit className="h-6 w-6 text-amber-500" />
            Offline / Manual Paper Report Entry
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Digitize physical paper reports submitted by department HODs due to network issues or offline preference.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/dashboard')}
          className="h-9 px-4 text-xs font-semibold border-border/60 hover:bg-accent/60 cursor-pointer"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Command Centre
        </Button>
      </div>

      {/* ── Target Selection Bar ───────────────────── */}
      <Card className="glass-card border-border/50 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-500" />
            Step 1: Select Target Department & Event Day
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Choose the department whose paper report you are transcribing into the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Department Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Target Department
            </Label>
            <Select value={selectedDeptId} onValueChange={(val) => setSelectedDeptId(val || '')}>
              <SelectTrigger className="h-10 text-xs font-medium bg-background border-border/60">
                <SelectValue placeholder="Select Department..." />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id} className="text-xs">
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Event Day Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Convention Day
            </Label>
            <Select value={selectedDayId} onValueChange={(val) => setSelectedDayId(val || '')}>
              <SelectTrigger className="h-10 text-xs font-medium bg-background border-border/60">
                <SelectValue placeholder="Select Convention Day..." />
              </SelectTrigger>
              <SelectContent>
                {eventDays.map((day) => (
                  <SelectItem key={day.id} value={day.id} className="text-xs">
                    Day {day.day_number} &mdash; {new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Status & Audit Notice Bar ──────────────── */}
      {existingReport && (
        <div className="rounded-xl p-4 bg-amber-500/8 dark:bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <span className="font-bold text-amber-700 dark:text-amber-400 block">
                Existing Report Detected ({existingReport.status.toUpperCase()})
              </span>
              <p className="text-muted-foreground">
                A report for <strong>{selectedDept?.name}</strong> on <strong>Day {selectedDay?.day_number}</strong> already exists in the system. Submitting here will update and overwrite the digitized record with the physical paper report data.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 whitespace-nowrap self-start sm:self-center">
            <UserCheck className="h-3 w-3" />
            Proxy Edit Mode
          </span>
        </div>
      )}

      {/* ── Digitization Form ──────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-xs font-semibold text-muted-foreground">Loading department schema &amp; existing entries...</p>
        </div>
      ) : selectedDept && selectedDay ? (
        <div className="space-y-6">

          {/* Section 1: Attendance */}
          <Card className="glass-card border-border/50 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                1. Core Daily Attendance
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Enter total attendees logged on the paper report for morning and evening sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="m-att" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Morning Session</Label>
                <NumberField
                  id="m-att"
                  value={attendanceMorning}
                  onChange={setAttendanceMorning}
                  className="h-10 font-mono text-base text-center"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-att" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Evening Session</Label>
                <NumberField
                  id="e-att"
                  value={attendanceEvening}
                  onChange={setAttendanceEvening}
                  className="h-10 font-mono text-base text-center"
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Workforce Breakdown */}
          {hasWorkforce && (
            <Card className="glass-card border-border/50 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                  2. Attendee Category Breakdown
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Transcribe gender breakdown by age category from the paper report.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/40">
                  <div className="text-left">Category</div>
                  <div>Male</div>
                  <div>Female</div>
                </div>

                {/* Teachers */}
                <div className="grid grid-cols-3 gap-2 items-center text-xs py-1">
                  <span className="font-semibold text-foreground">Teachers / Helpers</span>
                  <NumberField
                    value={workforce.teachersMale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teachersMale: val }))}
                    className="h-9 font-mono text-center"
                  />
                  <NumberField
                    value={workforce.teachersFemale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teachersFemale: val }))}
                    className="h-9 font-mono text-center"
                  />
                </div>

                {/* Teenagers */}
                <div className="grid grid-cols-3 gap-2 items-center text-xs py-1">
                  <span className="font-semibold text-foreground">Teenagers</span>
                  <NumberField
                    value={workforce.teenagersMale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teenagersMale: val }))}
                    className="h-9 font-mono text-center"
                  />
                  <NumberField
                    value={workforce.teenagersFemale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teenagersFemale: val }))}
                    className="h-9 font-mono text-center"
                  />
                </div>

                {/* Pre-Teens */}
                <div className="grid grid-cols-3 gap-2 items-center text-xs py-1">
                  <span className="font-semibold text-foreground">Pre-Teens</span>
                  <NumberField
                    value={workforce.preteensMale}
                    onChange={(val) => setWorkforce(w => ({ ...w, preteensMale: val }))}
                    className="h-9 font-mono text-center"
                  />
                  <NumberField
                    value={workforce.preteensFemale}
                    onChange={(val) => setWorkforce(w => ({ ...w, preteensFemale: val }))}
                    className="h-9 font-mono text-center"
                  />
                </div>

                {/* Children */}
                <div className="grid grid-cols-3 gap-2 items-center text-xs py-1">
                  <span className="font-semibold text-foreground">Children</span>
                  <NumberField
                    value={workforce.childrenMale}
                    onChange={(val) => setWorkforce(w => ({ ...w, childrenMale: val }))}
                    className="h-9 font-mono text-center"
                  />
                  <NumberField
                    value={workforce.childrenFemale}
                    onChange={(val) => setWorkforce(w => ({ ...w, childrenFemale: val }))}
                    className="h-9 font-mono text-center"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 3: Financial Offering */}
          <Card className="glass-card border-border/50 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                3. Collections &amp; Financials
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Record total financial offering collected on the paper report for this day.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-w-sm">
                <Label htmlFor="offering-input" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Total Offering Collected
                </Label>
                <CurrencyField
                  id="offering-input"
                  value={offering}
                  onChange={setOffering}
                  className="h-10 font-mono text-base"
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Department Specific Fields */}
          {selectedDept.default_metrics_schema?.fields && selectedDept.default_metrics_schema.fields.length > 0 && (
            <Card className="glass-card border-border/50 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                  4. {selectedDept.name} Specific Operational Fields
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Fill specialized metrics defined for the {selectedDept.name} department.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SchemaFormRenderer
                  fields={selectedDept.default_metrics_schema.fields}
                  value={metricsData}
                  onChange={setMetricsData}
                  readOnly={false}
                />
              </CardContent>
            </Card>
          )}

          {/* Section 5: Daily Narrative */}
          <Card className="glass-card border-border/50 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                5. Executive Daily Narrative
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Transcribe qualitative notes, achievements, challenges, and recommendations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Operational Overview</Label>
                <Textarea
                  value={dailyOverview}
                  onChange={(e) => setDailyOverview(e.target.value)}
                  placeholder="Summary of daily activities and operations..."
                  rows={2}
                  className="text-xs bg-background border-border/60"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Key Achievements &amp; Highlights</Label>
                <Textarea
                  value={dailyAchievements}
                  onChange={(e) => setDailyAchievements(e.target.value)}
                  placeholder="Notable accomplishments for the day..."
                  rows={2}
                  className="text-xs bg-background border-border/60"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Challenges &amp; Bottlenecks</Label>
                <Textarea
                  value={dailyChallenges}
                  onChange={(e) => setDailyChallenges(e.target.value)}
                  placeholder="Issues or obstacles encountered..."
                  rows={2}
                  className="text-xs bg-background border-border/60"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Solutions &amp; Recommendations</Label>
                <Textarea
                  value={dailyRecommendations}
                  onChange={(e) => setDailyRecommendations(e.target.value)}
                  placeholder="Action points or support needed..."
                  rows={2}
                  className="text-xs bg-background border-border/60"
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Submit & Auditprovenance Action Bar ─── */}
          <div className="rounded-xl p-5 bg-card border border-border/60 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-foreground block">
                  Submitting On Behalf Of: {selectedDept.name}
                </span>
                <span className="text-muted-foreground">
                  Filed by Secretariat Staff: {profile?.full_name || profile?.email}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => handleSubmit('draft')}
                className="flex-1 sm:flex-none text-xs font-semibold h-10 px-4 border-border/60 hover:bg-accent/60 cursor-pointer"
              >
                <Save className="mr-1.5 h-4 w-4" />
                Save Proxy Draft
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => handleSubmit('submitted')}
                className="flex-1 sm:flex-none text-xs font-bold h-10 px-5 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
              >
                {saving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Submit Final Paper Report
                  </>
                )}
              </Button>
            </div>
          </div>

        </div>
      ) : null}
    </main>
  )
}

export default function ManualEntryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading Manual Entry Hub...</div>}>
      <ManualEntryContent />
    </Suspense>
  )
}
