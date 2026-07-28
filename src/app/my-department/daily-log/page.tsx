'use client'

import React, { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getClient, isMock, mockDepartments, mockEventDays, Profile, DailyReport, Department } from '@/utils/supabase'
import { showToast } from '@/components/ui/toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { SchemaFormRenderer } from '@/components/schema-form-renderer'
import { NumberField } from '@/components/ui/number-field'
import { CurrencyField } from '@/components/ui/currency-field'
import { ClipboardList, Wifi, WifiOff, Clock } from 'lucide-react'
import { useOfflineDraft } from '@/hooks/use-offline-draft'

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
  
  // Workforce Breakdown (Teachers/Helpers & Teenagers ONLY)
  const [workforce, setWorkforce] = useState({
    teachersMale: 0, teachersFemale: 0,
    teenagersMale: 0, teenagersFemale: 0,
  })

  // Financials
  const [offering, setOffering] = useState(0)

  // Daily qualitative narrative entries
  const [dailyOverview, setDailyOverview] = useState('')
  const [dailyAchievements, setDailyAchievements] = useState('')
  const [dailyChallenges, setDailyChallenges] = useState('')
  const [dailyRecommendations, setDailyRecommendations] = useState('')

  // Custom schema metrics
  const [metricsData, setMetricsData] = useState<any>({})
  
  const [loading, setLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isSuperAdminActing, setIsSuperAdminActing] = useState(false)
  const [behalfAdminName, setBehalfAdminName] = useState<string>('')
  
  // Custom lookup inline inputs
  const [newDiagText, setNewDiagText] = useState('')
  const [allDepartments, setAllDepartments] = useState<Department[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)

  // ── Offline draft hook ─────────────────────────────────────────────────────
  const draftKey = department?.id && activeDay?.id
    ? `${department.id}_${activeDay.id}`
    : 'pending'
  const {
    isOnline,
    draftSaved,
    hasPendingSync,
    loadDraft,
    saveDraft,
    clearDraft,
    queueForSync,
    getPendingPayload,
  } = useOfflineDraft<any>(draftKey)

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
        department_id: meta?.department_id || null,
        username: meta?.username || user.email?.split('@')[0] || 'user',
        must_change_password: false,
        is_active: true
      }
    }

    if (activeProfile) {
      if (!activeProfile.department_id && !isMock) {
        const { data: assignment } = await supabase
          .from('hod_assignments')
          .select('department_id')
          .eq('profile_id', activeProfile.id)
          .maybeSingle()
        if (assignment) {
          activeProfile.department_id = assignment.department_id
        }
      }
      setProfile(activeProfile)
      
      // Determine department context
      const isAdmin = activeProfile.role === 'super_admin' || activeProfile.role === 'coordinator'
      let activeDeptId = activeProfile.department_id
      
      let sortedDepts: Department[] = []
      if (isAdmin) {
        setIsSuperAdminActing(true)
        const { data: depts } = await supabase.from('departments').select('*')
        sortedDepts = ((depts || mockDepartments) as Department[]).sort((a,b) => a.name.localeCompare(b.name))
        setAllDepartments(sortedDepts)
        
        if (deptIdParam) {
          activeDeptId = deptIdParam
        } else if (!activeDeptId && sortedDepts.length > 0) {
          activeDeptId = sortedDepts[0].id
        }
      }

      let activeDept: any = null
      const dept = mockDepartments.find(d => d.id === activeDeptId)
      if (dept) {
        activeDept = { ...dept }
      } else {
        const { data: dbDept } = await supabase
          .from('departments')
          .select('*')
          .eq('id', activeDeptId)
          .maybeSingle()
        if (dbDept) {
          activeDept = { ...dbDept }
        }
      }

      if (activeDept) {
        const nameLower = activeDept.name.toLowerCase()
        if (nameLower.includes('bible study') || nameLower.includes('holy land') || nameLower.includes('registration')) {
          // Fetch tribes from database
          let tribesList: string[] = []
          if (!isMock) {
            const { data: tribesData } = await supabase.from('tribes').select('name').order('name', { ascending: true })
            tribesList = tribesData?.map((t: any) => t.name) || []
          }
          if (tribesList.length === 0) {
            tribesList = ['Reuben', 'Simeon', 'Judah', 'Levi', 'Issachar', 'Zebulun', 'Dan', 'Naphtali', 'Gad', 'Asher', 'Joseph', 'Benjamin']
          }

          activeDept.default_metrics_schema = {
            fields: [
              {
                name: 'tribes_attendance',
                label: 'Tribal & Mode Attendance Statistics',
                type: 'repeat-group',
                schema: [
                  { name: 'tribe', label: 'Tribe / Category', type: 'select', options: tribesList },
                  { name: 'teachers_male', label: 'Teachers (Male)', type: 'number' },
                  { name: 'teachers_female', label: 'Teachers (Female)', type: 'number' },
                  { name: 'teenagers_male', label: 'Teenagers (Male)', type: 'number' },
                  { name: 'teenagers_female', label: 'Teenagers (Female)', type: 'number' }
                ]
              }
            ]
          }
        } else if (nameLower.includes('medical')) {
          // Fetch diagnoses from database
          let diagnosesList: string[] = []
          if (!isMock) {
            const { data: diagData } = await supabase.from('diagnoses').select('name').order('name', { ascending: true })
            diagnosesList = diagData?.map((d: any) => d.name) || []
          }
          if (diagnosesList.length === 0) {
            diagnosesList = [
              'DIARRHOEA/VOMITTING/STOOLING', 'RTI', 'FEVER', 'ABDOMINAL PAINS',
              'FAINTING SYNDROME', 'INJURY/LACERATION', 'BODY WEAKNESS', 'BODY PAINS',
              'TOOTHACHE', 'BOIL/SWELLING ON TOE, NECK ETC', 'CONJUCTIVITIS', 'ULCER',
              'MENSTRUAL PAIN', 'RASH', 'ASTHMATIC ATTACK', 'SWOLLEN GUM', 'CONSTIPATION'
            ]
          }

          activeDept.default_metrics_schema = {
            fields: [
              {
                name: 'patients_demographics',
                label: 'Patient Demographics',
                type: 'repeat-group',
                schema: [
                  { name: 'category', label: 'Category', type: 'select', options: ['children', 'adult'] },
                  { name: 'gender', label: 'Gender', type: 'select', options: ['male', 'female'] },
                  { name: 'count', label: 'Count', type: 'number' }
                ]
              },
              {
                name: 'diagnoses_cases',
                label: 'Diagnoses & Cases',
                type: 'repeat-group',
                schema: [
                  { name: 'diagnosis', label: 'Diagnosis / Symptom', type: 'select', options: diagnosesList },
                  { name: 'count', label: 'Count', type: 'number' }
                ]
              }
            ]
          }
        } else if (nameLower.includes('store') || nameLower.includes('stores')) {
          activeDept.default_metrics_schema = {
            fields: [
              {
                name: 'durables',
                label: 'Durables Inventory Tracking',
                type: 'repeat-group',
                schema: [
                  { name: 'item_name', label: 'Item Name', type: 'text' },
                  { name: 'department', label: 'Department', type: 'text' },
                  { name: 'qty_instock', label: 'Quantity In-Stock', type: 'number' },
                  { name: 'qty_issued', label: 'Quantity Issued', type: 'number' },
                  { name: 'qty_returned', label: 'Quantity Returned', type: 'number' }
                ]
              },
              {
                name: 'consumables',
                label: 'Consumables Inventory Tracking',
                type: 'repeat-group',
                schema: [
                  { name: 'item_name', label: 'Item Name', type: 'text' },
                  { name: 'department', label: 'Department', type: 'text' },
                  { name: 'qty_instock', label: 'Quantity In-Stock', type: 'number' },
                  { name: 'qty_issued', label: 'Quantity Issued', type: 'number' }
                ]
              }
            ]
          }
        } else if (nameLower.includes('welfare') || nameLower.includes('kitchen') || nameLower.includes('serving')) {
          activeDept.default_metrics_schema = {
            fields: [
              {
                name: 'welfare_logs',
                label: 'Welfare Kitchen Allocations',
                type: 'repeat-group',
                schema: [
                  { name: 'meal_type', label: 'Meal Type', type: 'select', options: ['Breakfast', 'Lunch', 'Dinner'] },
                  { name: 'qty_served', label: 'Quantity Served', type: 'number' },
                  { name: 'time_logged', label: 'Distribution Time', type: 'text' }
                ]
              }
            ]
          }
        } else if (nameLower.includes('safety') || nameLower.includes('sepu')) {
          activeDept.default_metrics_schema = {
            fields: [
              {
                name: 'incidents_log',
                label: 'SEPU Daily Incident Index',
                type: 'repeat-group',
                schema: [
                  { name: 'incidence', label: 'Incident Description', type: 'text' },
                  { name: 'action_taken', label: 'Action Taken', type: 'text' },
                  { name: 'remarks', label: 'Remarks / Follow-up', type: 'text' }
                ]
              }
            ]
          }
        } else if (nameLower.includes('programme') || nameLower.includes('program') || nameLower.includes('teens')) {
          activeDept.default_metrics_schema = {
            fields: [
              {
                name: 'session_logs',
                label: 'Teens Service & Sessions Statistics',
                type: 'repeat-group',
                schema: [
                  { name: 'session_name', label: 'Session Name', type: 'select', options: ['Morning', 'Afternoon', 'Evening'] },
                  { name: 'details', label: 'Program Details', type: 'text' },
                  { name: 'atten', label: 'Attendance', type: 'number' },
                  { name: 'offering_sum', label: 'Offering Collected (₦)', type: 'number' }
                ]
              }
            ]
          }
        } else {
          // Generic Fallback Schema for all other database-loaded departments
          activeDept.default_metrics_schema = {
            fields: [
              {
                name: 'generic_metrics',
                label: 'Department Metrics Log',
                type: 'repeat-group',
                schema: [
                  { name: 'key_metric_label', label: 'Metric Description', type: 'text' },
                  { name: 'value', label: 'Value / Count', type: 'number' }
                ]
              }
            ]
          }
        }
        setDepartment(activeDept)
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
      setDataLoaded(true)
    } else {
      setDataLoaded(true)
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
      })
      
      const dNarrative = mData.daily_narrative || {}
      setDailyOverview(dNarrative.overview || '')
      setDailyAchievements(dNarrative.achievements || '')
      setDailyChallenges(dNarrative.challenges || '')
      setDailyRecommendations(dNarrative.recommendations || '')
      
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
      })
      setDailyOverview('')
      setDailyAchievements('')
      setDailyChallenges('')
      setDailyRecommendations('')
      setBehalfAdminName('')
    }
  }

  useEffect(() => {
    loadData()
  }, [deptIdParam, dayIdParam])

  // ── Auto-save draft on every form field change ────────────────────────────
  useEffect(() => {
    if (!dataLoaded || !department?.id || !activeDay?.id) return
    // Only auto-save new/draft reports (not submitted/approved)
    if (status === 'submitted' || status === 'approved') return
    saveDraft({
      attendanceMorning, attendanceEvening,
      workforce, offering,
      dailyOverview, dailyAchievements, dailyChallenges, dailyRecommendations,
      metricsData,
    })
  }, [
    attendanceMorning, attendanceEvening, workforce, offering,
    dailyOverview, dailyAchievements, dailyChallenges, dailyRecommendations,
    metricsData, dataLoaded, department, activeDay, status, saveDraft,
  ])

  // ── Listen for SW Background Sync trigger (app was offline, now back) ─────
  useEffect(() => {
    const handleSwSync = (e: Event) => {
      const custom = e as CustomEvent
      if (custom.detail?.key !== draftKey) return
      const pending = getPendingPayload()
      if (pending) {
        handleOfflineFlush(pending)
      }
    }
    window.addEventListener('dtce-sync-flush', handleSwSync)
    // Also listen for SW postMessage trigger
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'SW_SYNC_TRIGGER') {
        const pending = getPendingPayload()
        if (pending) handleOfflineFlush(pending)
      }
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage)
    }
    return () => {
      window.removeEventListener('dtce-sync-flush', handleSwSync)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, getPendingPayload])

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



    setValidationErrors(errors)
  }, [attendanceMorning, attendanceEvening, workforce, offering, department])

  const handleDayChange = (dayId: string) => {
    if (department) {
      const urlParams = new URLSearchParams(window.location.search)
      urlParams.set('dayId', dayId)
      router.push(`/my-department/daily-log?${urlParams.toString()}`)
    }
  }

  // ── Core submit: works online AND as the flush target for offline queue ───
  const performSubmit = useCallback(async (payload: any, submit: boolean) => {
    const supabase = getClient()
    const targetStatus = submit ? 'submitted' : 'draft'
    payload.status = targetStatus

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
      if (data && data.length > 0) setReportId(data[0].id)
    }

    setStatus(targetStatus)
    clearDraft()
    showToast(submit ? 'Daily Log submitted!' : 'Draft saved!', 'success')

    if (isSuperAdminActing) {
      setTimeout(() => router.push('/dashboard'), 1000)
    } else {
      await loadReportForDay(activeDay!.id, department!.id)
    }
  }, [reportId, clearDraft, isSuperAdminActing, router, activeDay, department])

  // ── Auto-flush when connection returns with a pending offline payload ──────
  const handleOfflineFlush = useCallback(async (pendingPayload: any) => {
    setLoading(true)
    try {
      await performSubmit(pendingPayload, true)
      showToast('✅ Report auto-submitted — you\'re back online!', 'success')
    } catch (err: any) {
      showToast(`Auto-submit failed: ${err.message}. Will retry on next load.`, 'error')
    } finally {
      setLoading(false)
    }
  }, [performSubmit])

  const handleSubmit = async (submit = false) => {
    if (!profile || !department || !activeDay) return
    setLoading(true)

    const payload = {
      event_id: activeDay.event_id,
      event_day_id: activeDay.id,
      department_id: department.id,
      submitted_by: profile.id,
      attendance_morning: attendanceMorning,
      attendance_evening: attendanceEvening,
      status: submit ? 'submitted' : 'draft',
      submitted_on_behalf_by: isSuperAdminActing ? profile.id : null,
      metrics_data: {
        custom_schema: metricsData,
        workforce,
        offering,
        daily_narrative: {
          overview: dailyOverview,
          achievements: dailyAchievements,
          challenges: dailyChallenges,
          recommendations: dailyRecommendations
        }
      }
    }

    // ── OFFLINE: queue for auto-submit when connectivity returns ──────────
    if (submit && !navigator.onLine) {
      queueForSync(payload)
      setStatus('submitted') // Optimistic: show as submitted from HOD's perspective
      clearDraft()
      setLoading(false)
      showToast('📶 No signal — report saved locally. Will auto-submit when back online.', 'warning')
      return
    }

    try {
      await performSubmit(payload, submit)
    } catch (err: any) {
      showToast(`Submission failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAddDiagnosisInline = async () => {
    if (!newDiagText.trim()) return
    const name = newDiagText.trim().toUpperCase()
    
    if (isMock) {
      showToast(`Diagnosis "${name}" added locally!`, 'success')
      setNewDiagText('')
      if (department && department.default_metrics_schema) {
        const fields = [...department.default_metrics_schema.fields]
        const diagField = fields.find((f: any) => f.name === 'diagnoses_cases')
        if (diagField && diagField.schema) {
          const subDiag = diagField.schema.find((s: any) => s.name === 'diagnosis')
          if (subDiag && subDiag.options) {
            subDiag.options = [...subDiag.options, name].sort()
          }
        }
        setDepartment({
          ...department,
          default_metrics_schema: { fields }
        })
      }
      return
    }

    const supabase = getClient()
    try {
      const { error } = await supabase.from('diagnoses').insert({ name })
      if (error) throw error
      showToast(`Diagnosis "${name}" added to dropdown list!`, 'success')
      setNewDiagText('')
      await loadData()
    } catch (e: any) {
      showToast(`Failed to add diagnosis: ${e.message}`, 'error')
    }
  }

  if (!dataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <p className="text-sm font-mono animate-pulse text-slate-500">Loading Daily Reporting Workspace...</p>
      </div>
    )
  }

  if (!profile || !department || !activeDay) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="text-center space-y-4 max-w-md">
          <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto block" />
          <h2 className="text-xl font-bold text-foreground">Daily Log Not Available</h2>
          <p className="text-sm text-muted-foreground">
            {!activeDay
              ? 'No active event days have been configured in the database yet. Please ask the Super Admin to create event days before filing daily reports.'
              : !department
                ? 'Your profile is not assigned to a department. Please contact the Super Admin to assign you.'
                : 'Unable to load your profile. Please try signing out and back in.'}
          </p>
          <button
            onClick={() => router.push('/my-department')}
            className="h-9 rounded-xl px-5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black cursor-pointer transition-all"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const hasWorkforce = !DEPTS_WITHOUT_ATTENDANCE.includes(department.id)
  const hasOffering = true
  const isReadOnly = (status === 'submitted' || status === 'approved') &&
                     (profile?.role !== 'super_admin' && profile?.role !== 'coordinator')

  return (
    <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Page Title Block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">HOD DAILY REPORTING</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{department.name} Daily Log Workspace</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Fill and submit department specific metrics for convention days.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(isSuperAdminActing ? '/dashboard' : '/my-department')}
          className="text-xs h-9 cursor-pointer w-fit"
        >
          ← {isSuperAdminActing ? 'Back to Submission Board' : 'Back to Dashboard'}
        </Button>
      </div>

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

      {/* Admin Department Switcher */}
      {isSuperAdminActing && allDepartments.length > 0 && (
        <div className="flex items-center gap-3 bg-card border border-border p-4 rounded-xl">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Switch Department Form:</span>
          <select
            value={department?.id || ''}
            onChange={(e) => {
              const newDeptId = e.target.value
              const urlParams = new URLSearchParams(window.location.search)
              urlParams.set('deptId', newDeptId)
              router.push(`/my-department/daily-log?${urlParams.toString()}`)
            }}
            className="bg-background border border-border rounded-lg text-xs font-semibold px-3 py-1.5 text-foreground h-9"
          >
            {allDepartments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
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

      {/* Date Day Selector — Horizontal Apple-Style Scrollable Rail */}
      <div className="glass-card p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Event Reporting Day</span>
          <span className="text-[10px] text-amber-500 font-mono font-semibold sm:hidden">Swipe ← →</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none snap-x -mx-1 px-1">
          {eventDays.map((d: any) => {
            const active = d.id === activeDay.id
            return (
              <button
                key={d.id}
                onClick={() => handleDayChange(d.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all border cursor-pointer snap-center ${
                  active
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-xs'
                    : 'bg-card text-muted-foreground border-border hover:border-slate-400 dark:hover:border-slate-700'
                }`}
              >
                Day {d.day_number} ({new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })})
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core numbers form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card border-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold text-foreground uppercase tracking-wider">
                1. Core Daily Attendance
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Enter total attendees logged for morning and evening services.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="m-att" className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest block truncate">Morning Session</Label>
                <NumberField
                  id="m-att"
                  value={attendanceMorning}
                  onChange={setAttendanceMorning}
                  disabled={isReadOnly || loading}
                  className="input-dark font-mono text-base sm:text-lg text-center text-foreground h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-att" className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest block truncate">Evening Session</Label>
                <NumberField
                  id="e-att"
                  value={attendanceEvening}
                  onChange={setAttendanceEvening}
                  disabled={isReadOnly || loading}
                  className="input-dark font-mono text-base sm:text-lg text-center text-foreground h-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Workforce breakdown section (Streamlined to Teachers/Helpers & Teenagers across ALL devices) */}
          {hasWorkforce && (
            <Card className="glass-card border-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold text-foreground uppercase tracking-wider">
                  2. Attendee Category Breakdown
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Break down logged attendee counts by category and gender.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 border-b border-border">
                  <div className="text-left">Category</div>
                  <div>Male</div>
                  <div>Female</div>
                </div>

                {/* Teachers / Helpers */}
                <div className="grid grid-cols-3 gap-2 items-center text-xs sm:text-sm py-1">
                  <span className="font-semibold text-foreground">Teachers / Helpers</span>
                  <NumberField
                    value={workforce.teachersMale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teachersMale: val }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground h-9"
                  />
                  <NumberField
                    value={workforce.teachersFemale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teachersFemale: val }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground h-9"
                  />
                </div>

                {/* Teenagers */}
                <div className="grid grid-cols-3 gap-2 items-center text-xs sm:text-sm py-1">
                  <span className="font-semibold text-foreground">Teenagers</span>
                  <NumberField
                    value={workforce.teenagersMale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teenagersMale: val }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground h-9"
                  />
                  <NumberField
                    value={workforce.teenagersFemale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teenagersFemale: val }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground h-9"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Financial offering section */}
          {hasOffering && (
            <Card className="glass-card border-none">
              <CardHeader className="pb-3">
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
                  <CurrencyField
                    id="offering-fin"
                    value={offering}
                    onChange={setOffering}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-lg text-foreground"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Daily Qualitative Report & Feedback */}
          <Card className="glass-card border-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold text-foreground uppercase tracking-wider">
                Daily Qualitative Report &amp; Feedback
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Log key activities, achievements, challenges encountered, and recommendations for Day {activeDay?.day_number || 1}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="daily-overview" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Daily Overview &amp; Issues Logged
                </Label>
                <Textarea
                  id="daily-overview"
                  value={dailyOverview}
                  onChange={(e) => setDailyOverview(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Summarize key operational events, general flow, or notable issues that occurred today..."
                  rows={3}
                  className="input-dark text-xs text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="daily-achieve" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Daily Achievements &amp; Key Successes
                </Label>
                <Textarea
                  id="daily-achieve"
                  value={dailyAchievements}
                  onChange={(e) => setDailyAchievements(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Record major milestones, operational wins, or positive outcomes for today..."
                  rows={3}
                  className="input-dark text-xs text-foreground"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="daily-chall" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Challenges Faced
                  </Label>
                  <Textarea
                    id="daily-chall"
                    value={dailyChallenges}
                    onChange={(e) => setDailyChallenges(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="List bottlenecks, resource shortages, or difficulties encountered..."
                    rows={3}
                    className="input-dark text-xs text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="daily-recom" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Recommendations &amp; Next Steps
                  </Label>
                  <Textarea
                    id="daily-recom"
                    value={dailyRecommendations}
                    onChange={(e) => setDailyRecommendations(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Suggestions for resolution or adjustments for upcoming days..."
                    rows={3}
                    className="input-dark text-xs text-foreground"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right side: Schema metrics & save panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Custom Schema Form rendering (Conditional: rendered ONLY when custom fields exist) */}
          {department.default_metrics_schema &&
           department.default_metrics_schema.fields &&
           department.default_metrics_schema.fields.length > 0 && (
            <Card className="glass-card border-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                  Department Custom Metrics
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Log metrics specific to {department.name} operations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SchemaFormRenderer
                  fields={department.default_metrics_schema.fields}
                  value={metricsData}
                  onChange={setMetricsData}
                  readOnly={isReadOnly}
                />

                {/* Dynamic Add Diagnosis Input */}
                {!isReadOnly && department.name.toLowerCase().includes('medical') && (
                  <div className="mt-6 pt-6 border-t border-border/60 space-y-2">
                    <Label htmlFor="add-diag-opt" className="text-xs font-bold text-foreground uppercase tracking-widest block">Add Custom Diagnosis Option</Label>
                    <div className="flex gap-2">
                      <Input
                        id="add-diag-opt"
                        placeholder="e.g. CHOLERA"
                        value={newDiagText}
                        onChange={(e) => setNewDiagText(e.target.value)}
                        className="input-dark h-9 text-xs flex-1 text-foreground"
                      />
                      <Button
                        onClick={handleAddDiagnosisInline}
                        size="sm"
                        className="h-9 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4"
                      >
                        Add option
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Submission panel */}
          <Card className="glass-card border-none">
            <CardContent className="pt-6 space-y-4">

              {/* Network + Draft status indicators */}
              <div className="flex items-center justify-between text-[11px] pb-3 border-b border-border gap-2">
                <div className="flex items-center gap-1.5">
                  {isOnline
                    ? <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    : <WifiOff className="h-3.5 w-3.5 text-amber-400 animate-pulse" />}
                  <span className={isOnline ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                    {isOnline ? 'Online' : 'No signal'}
                  </span>
                  {draftSaved && (
                    <span className="ml-2 text-slate-400 italic">· Draft saved</span>
                  )}
                </div>
                <span
                  className="font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={
                    hasPendingSync ? { background: 'rgba(245,158,11,0.12)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' } :
                    status === 'draft' ? { background: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.2)' } :
                    status === 'submitted' ? { background: 'rgba(59,130,246,0.1)', color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' } :
                    { background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }
                  }
                >
                  {hasPendingSync ? 'Pending Sync' : status}
                </span>
              </div>

              {/* Pending sync banner */}
              {hasPendingSync && (
                <div className="flex items-start gap-2.5 rounded-xl p-3 text-[11px]" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-amber-300">
                    <span className="font-bold block">Report queued for sync</span>
                    <span className="text-amber-400/80">This report will auto-submit the moment your connection is restored. No action needed.</span>
                  </div>
                </div>
              )}

              {/* Form Validation Warnings */}
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
                    disabled={loading || hasPendingSync}
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
                    {loading ? 'Submitting...' : !isOnline ? '📶 Submit (queues offline)' : 'Submit Daily Log'}
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
