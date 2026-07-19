'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getClient, isMock, mockDepartments, mockEventDays, Profile, DailyReport, Department } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SchemaFormRenderer } from '@/components/schema-form-renderer'

// Departments without workforce attendance breakdown
const DEPTS_WITHOUT_ATTENDANCE = ['dept-6', 'dept-9', 'dept-13', 'dept-19', 'dept-20', 'dept-25', 'dept-26', 'dept-29', 'dept-30', 'dept-39']

// Departments that collect offerings
const DEPTS_WITH_OFFERING = ['dept-21', 'dept-33', 'dept-37']

function DailyLogContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const deptIdParam = searchParams?.get('deptId')
  const dayIdParam = searchParams?.get('dayId')

  const [profile, setProfile] = useState<Profile | null>(null)
  const [department, setDepartment] = useState<Department | null>(null)
  const [activeDay, setActiveDay] = useState<any | null>(null)
  const [eventDays, setEventDays] = useState<any[]>([])
  
  // Data State
  const [reportId, setReportId] = useState<string | null>(null)
  const [status, setStatus] = useState<'draft' | 'submitted' | 'approved'>('draft')
  const [attendanceMorning, setAttendanceMorning] = useState(0)
  const [attendanceEvening, setAttendanceEvening] = useState(0)
  
  // Workforce Breakdown
  const [workforce, setWorkforce] = useState({
    teachersMale: 0, teachersFemale: 0,
    teenagersMale: 0, teenagersFemale: 0,
    preteensMale: 0, preteensFemale: 0,
    childrenMale: 0, childrenFemale: 0,
  })

  // Financials
  const [offering, setOffering] = useState(0)

  // Custom schema metrics
  const [metricsData, setMetricsData] = useState<any>({})
  
  const [loading, setLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isSuperAdminActing, setIsSuperAdminActing] = useState(false)
  const [behalfAdminName, setBehalfAdminName] = useState<string>('')

  // 1. Fetch User profile and Event Days
  const loadData = async () => {
    const supabase = getClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    let activeProfile = prof
    if (!activeProfile && user) {
      const meta = user.user_metadata as any
      activeProfile = {
        id: user.id,
        email: user.email || '',
        full_name: meta?.full_name || user.email?.split('@')[0] || 'Department HOD',
        role: meta?.role || 'hod',
        department_id: meta?.department_id || 'dept-10',
        username: meta?.username || user.email?.split('@')[0] || 'user',
        must_change_password: false,
        is_active: true
      }
    }

    if (activeProfile) {
      setProfile(activeProfile)
      
      // Determine department context
      const isAdmin = activeProfile.role === 'super_admin' || activeProfile.role === 'coordinator'
      let activeDeptId = activeProfile.department_id
      if (isAdmin && deptIdParam) {
        activeDeptId = deptIdParam
        setIsSuperAdminActing(true)
      }

      const dept = mockDepartments.find(d => d.id === activeDeptId)
      if (dept) {
        setDepartment(dept)
      } else {
        const { data: dbDept } = await supabase
          .from('departments')
          .select('*')
          .eq('id', activeDeptId)
          .maybeSingle()
        if (dbDept) setDepartment(dbDept)
      }

      // Fetch Event Days
      let days = []
      if (isMock) {
        days = [...mockEventDays]
      } else {
        const { data: daysDb } = await supabase
          .from('event_days')
          .select('*')
          .order('day_number', { ascending: true })
        days = daysDb || []
      }
      setEventDays(days)

      // Set active day
      let selectedDay = days[0]
      if (dayIdParam) {
        selectedDay = days.find((d: any) => d.id === dayIdParam) || days[0]
      } else {
        // Default to today if date range fits
        const todayStr = new Date().toISOString().split('T')[0]
        const todayDay = days.find((d: any) => d.date === todayStr)
        if (todayDay) selectedDay = todayDay
      }
      setActiveDay(selectedDay)

      if (selectedDay && activeDeptId) {
        await loadReportForDay(selectedDay.id, activeDeptId)
      }
    }
  }

  const loadReportForDay = async (dayId: string, deptId: string) => {
    const supabase = getClient()
    const { data: reps } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('event_day_id', dayId)
      .eq('department_id', deptId)
      .maybeSingle()

    if (reps) {
      setReportId(reps.id)
      setStatus(reps.status || 'draft')
      setAttendanceMorning(reps.attendance_morning || 0)
      setAttendanceEvening(reps.attendance_evening || 0)
      
      const mData = reps.metrics_data || {}
      setMetricsData(mData.custom_schema || {})
      setOffering(mData.offering || 0)
      setWorkforce(mData.workforce || {
        teachersMale: 0, teachersFemale: 0,
        teenagersMale: 0, teenagersFemale: 0,
        preteensMale: 0, preteensFemale: 0,
        childrenMale: 0, childrenFemale: 0,
      })
      
      if (reps.submitted_on_behalf_by) {
        let adminProf = null
        if (isMock) {
          const { store: mockStore } = require('@/utils/supabase/mockClient')
          adminProf = mockStore.profiles.find((p: any) => p.id === reps.submitted_on_behalf_by)
        } else {
          const { data: ap } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', reps.submitted_on_behalf_by)
            .single()
          adminProf = ap
        }
        setBehalfAdminName(adminProf?.full_name || 'Secretariat Admin')
      } else {
        setBehalfAdminName('')
      }
    } else {
      // Clear form for new entry
      setReportId(null)
      setStatus('draft')
      setAttendanceMorning(0)
      setAttendanceEvening(0)
      setMetricsData({})
      setOffering(0)
      setWorkforce({
        teachersMale: 0, teachersFemale: 0,
        teenagersMale: 0, teenagersFemale: 0,
        preteensMale: 0, preteensFemale: 0,
        childrenMale: 0, childrenFemale: 0,
      })
      setBehalfAdminName('')
    }
  }

  useEffect(() => {
    loadData()
  }, [deptIdParam, dayIdParam])

  // Run validation checks on fields
  useEffect(() => {
    const errors: string[] = []
    if (attendanceMorning === 0 && attendanceEvening === 0) {
      errors.push('Both Morning and Evening attendance figures are currently zero.')
    }
    
    if (department && !DEPTS_WITHOUT_ATTENDANCE.includes(department.id)) {
      const totalWorkforce = Object.values(workforce).reduce((a, b) => a + b, 0)
      if (totalWorkforce === 0) {
        errors.push('Workforce breakdown counts are currently empty / zero.')
      }
    }

    if (department && DEPTS_WITH_OFFERING.includes(department.id) && offering === 0) {
      errors.push('No Offering finance total collected has been logged for this day.')
    }

    setValidationErrors(errors)
  }, [attendanceMorning, attendanceEvening, workforce, offering, department])

  const handleDayChange = (dayId: string) => {
    if (department) {
      const urlParams = new URLSearchParams(window.location.search)
      urlParams.set('dayId', dayId)
      router.push(`/my-department/daily-log?${urlParams.toString()}`)
    }
  }

  const handleSubmit = async (submit = false) => {
    if (!profile || !department || !activeDay) return
    setLoading(true)

    const targetStatus = submit ? 'submitted' : 'draft'
    const supabase = getClient()

    const payload = {
      event_id: activeDay.event_id,
      event_day_id: activeDay.id,
      department_id: department.id,
      submitted_by: profile.id,
      attendance_morning: attendanceMorning,
      attendance_evening: attendanceEvening,
      status: targetStatus,
      submitted_on_behalf_by: isSuperAdminActing ? profile.id : null,
      metrics_data: {
        custom_schema: metricsData,
        workforce,
        offering
      }
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

      setStatus(targetStatus)
      showToast(submit ? 'Daily Log submitted successfully!' : 'Draft daily log saved!', 'success')
      
      // If super admin, refresh or go back to board
      if (isSuperAdminActing) {
        setTimeout(() => {
          router.push('/dashboard')
        }, 1000)
      } else {
        await loadReportForDay(activeDay.id, department.id)
      }
    } catch (err: any) {
      showToast(`Submission failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!profile || !department || !activeDay) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-slate-500">Loading Daily Reporting Workspace...</p>
      </div>
    )
  }

  const hasWorkforce = !DEPTS_WITHOUT_ATTENDANCE.includes(department.id)
  const hasOffering = DEPTS_WITH_OFFERING.includes(department.id)
  const isReadOnly = (status === 'submitted' || status === 'approved') &&
                     (profile?.role !== 'super_admin' && profile?.role !== 'coordinator')

  return (
    <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* On behalf warning */}
      {isSuperAdminActing && (
        <div className="rounded-xl p-4 flex items-center justify-between border" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)' }}>
          <div className="flex items-center gap-2.5">
            <span className="text-base">⚠️</span>
            <div>
              <span className="text-[12px] font-bold text-amber-500 uppercase block tracking-wider">Secretariat On-Behalf Submission Mode</span>
              <p className="text-[11px] text-muted-foreground">
                You are entering daily logs for the <strong>{department.name}</strong> department. Any submit action will record you as reviewer on-behalf.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')} className="text-xs h-7">
            Cancel Secretariat Mode
          </Button>
        </div>
      )}
      {behalfAdminName && (
        <div className="rounded-xl p-4 flex items-center gap-2.5 border" style={{ background: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.2)' }}>
          <span className="text-base text-blue-400">ℹ️</span>
          <p className="text-[12px] text-muted-foreground">
            This log was <strong>Submitted on behalf of {department.name} by {behalfAdminName}</strong>.
          </p>
        </div>
      )}

      {/* Date Day Selector */}
      <div className="glass-card p-5 space-y-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Event reporting Day</span>
        <div className="flex flex-wrap gap-2">
          {eventDays.map((d: any) => {
            const active = d.id === activeDay.id
            return (
              <button
                key={d.id}
                onClick={() => handleDayChange(d.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all border cursor-pointer ${
                  active
                    ? 'bg-amber-500/10 text-amber-550 dark:text-amber-400 border-amber-500/30'
                    : 'bg-card text-muted-foreground border-border hover:border-slate-400 dark:hover:border-slate-700'
                }`}
              >
                Day {d.day_number} ({new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })})
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core numbers form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-foreground uppercase tracking-wider">
                1. Core Daily Attendance
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Enter total attendees logged for both morning and evening services.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="m-att" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Morning Session</Label>
                <Input
                  id="m-att"
                  type="number"
                  value={attendanceMorning}
                  onChange={(e) => setAttendanceMorning(Math.max(0, parseInt(e.target.value) || 0))}
                  disabled={isReadOnly || loading}
                  className="input-dark font-mono text-lg text-center text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-att" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Evening Session</Label>
                <Input
                  id="e-att"
                  type="number"
                  value={attendanceEvening}
                  onChange={(e) => setAttendanceEvening(Math.max(0, parseInt(e.target.value) || 0))}
                  disabled={isReadOnly || loading}
                  className="input-dark font-mono text-lg text-center text-foreground"
                />
              </div>
            </CardContent>
          </Card>

          {/* Workforce breakdown section */}
          {hasWorkforce && (
            <Card className="glass-card border-none">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-foreground uppercase tracking-wider">
                  2. Attendee Category Breakdown
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Break down logged attendee counts by age category and gender.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border">
                  <div className="text-left">Category</div>
                  <div>Male</div>
                  <div>Female</div>
                </div>

                {/* Teachers */}
                <div className="grid grid-cols-3 gap-2 items-center text-sm py-1">
                  <span className="font-semibold text-foreground">Teachers / Helpers</span>
                  <Input
                    type="number"
                    value={workforce.teachersMale}
                    onChange={(e) => setWorkforce(w => ({ ...w, teachersMale: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground"
                  />
                  <Input
                    type="number"
                    value={workforce.teachersFemale}
                    onChange={(e) => setWorkforce(w => ({ ...w, teachersFemale: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground"
                  />
                </div>

                {/* Teenagers */}
                <div className="grid grid-cols-3 gap-2 items-center text-sm py-1">
                  <span className="font-semibold text-foreground">Teenagers</span>
                  <Input
                    type="number"
                    value={workforce.teenagersMale}
                    onChange={(e) => setWorkforce(w => ({ ...w, teenagersMale: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground"
                  />
                  <Input
                    type="number"
                    value={workforce.teenagersFemale}
                    onChange={(e) => setWorkforce(w => ({ ...w, teenagersFemale: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground"
                  />
                </div>

                {/* Pre-teens */}
                <div className="grid grid-cols-3 gap-2 items-center text-sm py-1">
                  <span className="font-semibold text-foreground">Pre-Teens</span>
                  <Input
                    type="number"
                    value={workforce.preteensMale}
                    onChange={(e) => setWorkforce(w => ({ ...w, preteensMale: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground"
                  />
                  <Input
                    type="number"
                    value={workforce.preteensFemale}
                    onChange={(e) => setWorkforce(w => ({ ...w, preteensFemale: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground"
                  />
                </div>

                {/* Children */}
                <div className="grid grid-cols-3 gap-2 items-center text-sm py-1">
                  <span className="font-semibold text-foreground">Children</span>
                  <Input
                    type="number"
                    value={workforce.childrenMale}
                    onChange={(e) => setWorkforce(w => ({ ...w, childrenMale: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground"
                  />
                  <Input
                    type="number"
                    value={workforce.childrenFemale}
                    onChange={(e) => setWorkforce(w => ({ ...w, childrenFemale: Math.max(0, parseInt(e.target.value) || 0) }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Financial offering section */}
          {hasOffering && (
            <Card className="glass-card border-none">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-foreground uppercase tracking-wider">
                  3. Collections &amp; Financials
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Record total offering collected for this day.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="offering-fin" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Total Offering Collected</Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-sans text-sm font-semibold">₦</span>
                    <Input
                      id="offering-fin"
                      type="number"
                      value={offering}
                      onChange={(e) => setOffering(Math.max(0, parseInt(e.target.value) || 0))}
                      disabled={isReadOnly}
                      className="input-dark pl-8 font-mono text-lg text-foreground"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right side: Schema metrics & save panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Custom Schema Form rendering */}
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                Department Custom Metrics
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Log metrics specific to {department.name} operations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {department.default_metrics_schema ? (
                <SchemaFormRenderer
                  fields={department.default_metrics_schema.fields}
                  value={metricsData}
                  onChange={setMetricsData}
                  readOnly={isReadOnly}
                />
              ) : (
                <p className="text-muted-foreground italic text-[12px]">No custom metrics schema required for this department.</p>
              )}
            </CardContent>
          </Card>

          {/* Submission panel */}
          <Card className="glass-card border-none">
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center text-[12px] pb-3 border-b border-border">
                <span className="text-muted-foreground">Current Status:</span>
                <span
                  className="font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={
                    status === 'draft' ? { background: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' } :
                    status === 'submitted' ? { background: 'rgba(59,130,246,0.1)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' } :
                    { background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }
                  }
                >
                  {status}
                </span>
              </div>

              {/* Form Validation Warnings (Task 8) */}
              {!isReadOnly && validationErrors.length > 0 && (
                <div className="rounded-xl p-3 text-[11px] space-y-1.5" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: '#D97706' }}>
                  <span className="font-bold uppercase tracking-wide">⚠️ Gating Warnings</span>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {validationErrors.map((e, idx) => <li key={idx}>{e}</li>)}
                  </ul>
                </div>
              )}

              {isReadOnly ? (
                <p className="text-muted-foreground text-center text-xs italic">
                  This report is submitted/approved and locked. Contact Secretariat to make updates.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => handleSubmit(false)}
                    disabled={loading}
                    variant="outline"
                    className="w-full text-xs font-semibold"
                  >
                    {loading ? 'Saving...' : 'Save Draft'}
                  </Button>
                  <Button
                    onClick={() => handleSubmit(true)}
                    disabled={loading}
                    className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    {loading ? 'Submitting...' : 'Submit Daily Log'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

export default function DailyLogPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-slate-500">Loading Suspense Guard...</p>
      </div>
    }>
      <DailyLogContent />
    </Suspense>
  )
}
