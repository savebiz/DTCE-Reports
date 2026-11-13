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
import { ClipboardList, Wifi, WifiOff, Clock, Globe, ArrowLeft, ArrowRight, AlertTriangle, X, CheckCircle2 } from 'lucide-react'
import { useOfflineDraft } from '@/hooks/use-offline-draft'
import { PreEventRegistrationTotalsModal } from '@/components/registration/pre-event-totals-modal'
import { getCurrentEventId, getEventDays, getDepartmentAssignment } from '@/lib/events/current-event'
import { evaluateDailyReportWindow } from '@/lib/events/reporting-windows'
import { ModernSelect } from '@/components/ui/modern-select'

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
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
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
  const [isPreTotalsOpen, setIsPreTotalsOpen] = useState(false)
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
    setDataLoaded(false)
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

    const currentEventId = await getCurrentEventId(supabase)

    if (activeProfile) {
      if (!activeProfile.department_id && !isMock) {
        const assignment = await getDepartmentAssignment(supabase, activeProfile.id, currentEventId)
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
        if (nameLower.includes('ushering') && Array.isArray(activeDept.default_metrics_schema?.fields)) {
          activeDept.default_metrics_schema = {
            ...activeDept.default_metrics_schema,
            fields: activeDept.default_metrics_schema.fields.map((f: any) =>
              f.type === 'repeat-group' && f.name !== 'teachers_meeting' && !f.presets
                ? {
                    ...f,
                    presets: [
                      {
                        label: 'Insert Standard Sessions',
                        rows: ['Morning Plenary', 'Bible Study', 'Seminar', 'Evening Revival'].map((event) => ({
                          event,
                          preacher_or_invited_guest: '',
                          title_and_bible_text: '',
                          male: 0,
                          female: 0,
                          teachers_male: 0,
                          teachers_female: 0,
                          offering: 0,
                        })),
                      },
                    ],
                  }
                : f
            ),
          }
        }
        if (nameLower.includes('bible study') || nameLower.includes('holy land')) {
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
                presets: [
                  {
                    label: 'Pre-fill 12 Tribes',
                    rows: tribesList.map((tribe) => ({
                      tribe,
                      teachers_male: 0,
                      teachers_female: 0,
                      teenagers_male: 0,
                      teenagers_female: 0,
                    })),
                  },
                ],
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
        } else if (nameLower.includes('registration')) {
          activeDept.default_metrics_schema = activeDept.default_metrics_schema || {
            fields: [
              {
                name: 'online_manual_pickups',
                label: 'SECTION A — Online Manual Pickup (Today)',
                type: 'repeat-group',
                presets: [
                  {
                    label: 'Pre-fill 4 Categories',
                    rows: ['Teachers', 'Teens', 'Pre-teens', 'Children'].map((category) => ({
                      category,
                      count_picked_up_today: 0,
                    })),
                  },
                ],
                schema: [
                  { name: 'category', label: 'Category', type: 'select', options: ['Teachers', 'Teens', 'Pre-teens', 'Children'], required: true },
                  { name: 'count_picked_up_today', label: 'Manuals Picked Up Today', type: 'number', required: true }
                ]
              },
              {
                name: 'walkin_registrations',
                label: 'SECTION B — Offline / Walk-in Registration (Today)',
                type: 'repeat-group',
                presets: [
                  {
                    label: 'Pre-fill 4 Categories',
                    rows: ['Teachers', 'Teens', 'Pre-teens', 'Children'].map((category) => ({
                      category,
                      new_registrations: 0,
                      manuals_distributed: 0,
                      amount_collected: 0,
                    })),
                  },
                ],
                schema: [
                  { name: 'category', label: 'Category', type: 'select', options: ['Teachers', 'Teens', 'Pre-teens', 'Children'], required: true },
                  { name: 'new_registrations', label: 'New Registrations Today', type: 'number', required: true },
                  { name: 'manuals_distributed', label: 'Manuals Distributed Today', type: 'number', required: true },
                  { name: 'amount_collected', label: 'Amount Collected (₦)', type: 'number', required: true }
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
                presets: [
                  {
                    label: 'Pre-fill Age & Gender',
                    rows: [
                      { category: 'children', gender: 'male', count: 0 },
                      { category: 'children', gender: 'female', count: 0 },
                      { category: 'adult', gender: 'male', count: 0 },
                      { category: 'adult', gender: 'female', count: 0 },
                    ],
                  },
                ],
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
        } else if (nameLower.includes('ushering')) {
          activeDept.default_metrics_schema = {
            schema_version: 2,
            fields: [
              {
                name: 'teachers_meeting',
                type: 'repeat-group',
                label: "TEACHERS' MEETING",
                schema: [
                  { name: 'title', type: 'text', label: 'Title / Theme', required: false },
                  { name: 'preacher', type: 'text', label: 'Preacher / Minister', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
                ]
              },
              {
                name: 'toddlers_section',
                type: 'repeat-group',
                label: 'TODDLERS SECTION',
                schema: [
                  { name: 's_n', type: 'computed', label: 'S/N', computeFormula: 'row_index' },
                  { name: 'event', type: 'text', label: 'Event / Session', required: false },
                  { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
                  { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
                  { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
                ]
              },
              {
                name: 'junior_section',
                type: 'repeat-group',
                label: 'JUNIOR SECTION',
                schema: [
                  { name: 's_n', type: 'computed', label: 'S/N', computeFormula: 'row_index' },
                  { name: 'event', type: 'text', label: 'Event / Session', required: false },
                  { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
                  { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
                  { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
                ]
              },
              {
                name: 'pre_teens_section',
                type: 'repeat-group',
                label: 'PRE-TEENS SECTION',
                schema: [
                  { name: 's_n', type: 'computed', label: 'S/N', computeFormula: 'row_index' },
                  { name: 'event', type: 'text', label: 'Event / Session', required: false },
                  { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
                  { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
                  { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
                ]
              },
              {
                name: 'teenagers_section',
                type: 'repeat-group',
                label: 'TEENAGERS SECTION',
                schema: [
                  { name: 's_n', type: 'computed', label: 'S/N', computeFormula: 'row_index' },
                  { name: 'event', type: 'text', label: 'Event / Session', required: false },
                  { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
                  { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
                  { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
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

        // Unconditionally force Ushering schema if department name is Ushering
        if (nameLower.includes('ushering')) {
          activeDept.default_metrics_schema = {
            schema_version: 2,
            fields: [
              {
                name: 'teachers_meeting',
                type: 'repeat-group',
                label: "TEACHERS' MEETING",
                schema: [
                  { name: 'title', type: 'text', label: 'Title / Theme', required: false },
                  { name: 'preacher', type: 'text', label: 'Preacher / Minister', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
                ]
              },
              {
                name: 'toddlers_section',
                type: 'repeat-group',
                label: 'TODDLERS SECTION',
                schema: [
                  { name: 's_n', type: 'computed', label: 'S/N', computeFormula: 'row_index' },
                  { name: 'event', type: 'text', label: 'Event / Session', required: false },
                  { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
                  { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
                  { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
                ]
              },
              {
                name: 'junior_section',
                type: 'repeat-group',
                label: 'JUNIOR SECTION',
                schema: [
                  { name: 's_n', type: 'computed', label: 'S/N', computeFormula: 'row_index' },
                  { name: 'event', type: 'text', label: 'Event / Session', required: false },
                  { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
                  { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
                  { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
                ]
              },
              {
                name: 'pre_teens_section',
                type: 'repeat-group',
                label: 'PRE-TEENS SECTION',
                schema: [
                  { name: 's_n', type: 'computed', label: 'S/N', computeFormula: 'row_index' },
                  { name: 'event', type: 'text', label: 'Event / Session', required: false },
                  { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
                  { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
                  { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
                ]
              },
              {
                name: 'teenagers_section',
                type: 'repeat-group',
                label: 'TEENAGERS SECTION',
                schema: [
                  { name: 's_n', type: 'computed', label: 'S/N', computeFormula: 'row_index' },
                  { name: 'event', type: 'text', label: 'Event / Session', required: false },
                  { name: 'preacher_or_invited_guest', type: 'text', label: 'Preacher / Invited Guest', required: false },
                  { name: 'title_and_bible_text', type: 'text', label: 'Title & Bible Text', required: false },
                  { name: 'male', type: 'number', label: 'Male Attendance', required: false },
                  { name: 'female', type: 'number', label: 'Female Attendance', required: false },
                  { name: 'total', type: 'computed', label: 'Total Attendance', computeFormula: 'sum_fields', sumOf: ['male', 'female'] },
                  { name: 'teachers_male', type: 'number', label: 'Teachers (Male)', required: false },
                  { name: 'teachers_female', type: 'number', label: 'Teachers (Female)', required: false },
                  { name: 'offering', type: 'number', label: 'Offering Collected (₦)', required: false }
                ]
              }
            ]
          }
        }

        setDepartment(activeDept)
      }

      // Fetch days of the current event only
      let days: any[] = []
      if (isMock) {
        days = [...mockEventDays]
      } else {
        days = await getEventDays(supabase, currentEventId)
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

  // ── Restore offline draft when switching days or mounting ─────────────────
  useEffect(() => {
    if (!dataLoaded || !department?.id || !activeDay?.id) return
    if (status === 'submitted' || status === 'approved') return
    const draft = loadDraft()
    if (draft) {
      if (draft.attendanceMorning !== undefined) setAttendanceMorning(draft.attendanceMorning)
      if (draft.attendanceEvening !== undefined) setAttendanceEvening(draft.attendanceEvening)
      if (draft.workforce) setWorkforce(draft.workforce)
      if (draft.offering !== undefined) setOffering(draft.offering)
      if (draft.dailyOverview !== undefined) setDailyOverview(draft.dailyOverview)
      if (draft.dailyAchievements !== undefined) setDailyAchievements(draft.dailyAchievements)
      if (draft.dailyChallenges !== undefined) setDailyChallenges(draft.dailyChallenges)
      if (draft.dailyRecommendations !== undefined) setDailyRecommendations(draft.dailyRecommendations)
      if (draft.metricsData) setMetricsData(draft.metricsData)
    }
  }, [dataLoaded, department?.id, activeDay?.id, status, loadDraft])

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

  const getMissingRequiredCustomFields = useCallback((): string[] => {
    const fields = department?.default_metrics_schema?.fields
    if (!Array.isArray(fields)) return []
    const missing: string[] = []
    for (const f of fields) {
      if (!f.required || f.type === 'computed') continue
      const val = metricsData?.[f.name]
      if (f.type === 'repeat-group') {
        if (!Array.isArray(val) || val.length === 0) missing.push(f.label)
      } else if (val === undefined || val === null || String(val).trim() === '') {
        missing.push(f.label)
      }
    }
    return missing
  }, [department, metricsData])

  const handlePreSubmitCheck = () => {
    if (!activeDay || !department) return
    const windowCheck = evaluateDailyReportWindow(activeDay)
    if (!isSuperAdminActing && !windowCheck.isOpen) {
      showToast(windowCheck.message, 'warning')
      return
    }
    const missingRequired = getMissingRequiredCustomFields()
    if (missingRequired.length > 0) {
      showToast(`Please complete required field(s): ${missingRequired.join(', ')}`, 'error')
      return
    }
    setIsReviewModalOpen(true)
  }

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

    let targetId = reportId
    if (!targetId && payload.event_day_id && payload.department_id) {
      const { data: existing } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('event_day_id', payload.event_day_id)
        .eq('department_id', payload.department_id)
        .maybeSingle()
      if (existing?.id) targetId = existing.id
    }

    if (targetId) {
      const { error } = await supabase
        .from('daily_reports')
        .update(payload)
        .eq('id', targetId)
      if (error) throw error
      setReportId(targetId)
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
    const windowCheck = evaluateDailyReportWindow(activeDay)
    if (!isSuperAdminActing && !windowCheck.isOpen) {
      showToast(windowCheck.message, 'warning')
      return
    }
    setLoading(true)
    try {
      await performSubmit(pendingPayload, true)
      showToast('Report auto-submitted — you\'re back online!', 'success')
    } catch (err: any) {
      showToast(`Auto-submit failed: ${err.message}. Will retry on next load.`, 'error')
    } finally {
      setLoading(false)
    }
  }, [performSubmit])

  const handleSubmit = async (submit = false) => {
    if (!profile || !department || !activeDay) return
    const windowCheck = evaluateDailyReportWindow(activeDay)
    if (submit && !isSuperAdminActing && !windowCheck.isOpen) {
      showToast(windowCheck.message, 'warning')
      return
    }
    setLoading(true)

    let finalOffering = offering
    if (department.name.toLowerCase().includes('ushering') && (metricsData.teachers_meeting || metricsData.toddlers_section || metricsData.junior_section || metricsData.pre_teens_section || metricsData.teenagers_section || !reportId)) {
      const sumArr = (arr: any[]) => Array.isArray(arr) ? arr.reduce((sum, r) => sum + (Number(r?.offering) || 0), 0) : 0
      finalOffering = sumArr(metricsData.teachers_meeting) + sumArr(metricsData.toddlers_section) + sumArr(metricsData.junior_section) + sumArr(metricsData.pre_teens_section) + sumArr(metricsData.teenagers_section)
    }

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
        offering: finalOffering,
        schema_version: department.name.toLowerCase().includes('ushering') ? 2 : undefined,
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
      showToast('No signal — report saved locally. Will auto-submit when back online.', 'warning')
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
    
    // Check if diagnosis is already present in current client options
    if (department && department.default_metrics_schema) {
      const diagField = department.default_metrics_schema.fields?.find((f: any) => f.name === 'diagnoses_cases')
      const subDiag = diagField?.schema?.find((s: any) => s.name === 'diagnosis')
      if (subDiag?.options?.some((opt: string) => opt.trim().toUpperCase() === name)) {
        showToast(`"${name}" is already available in the diagnosis options list!`, 'info')
        setNewDiagText('')
        return
      }
    }

    if (isMock) {
      showToast(`Diagnosis "${name}" added locally!`, 'success')
      setNewDiagText('')
      if (department && department.default_metrics_schema) {
        const fields = [...department.default_metrics_schema.fields]
        const diagField = fields.find((f: any) => f.name === 'diagnoses_cases')
        if (diagField && diagField.schema) {
          const subDiag = diagField.schema.find((s: any) => s.name === 'diagnosis')
          if (subDiag && subDiag.options) {
            subDiag.options = Array.from(new Set([...subDiag.options, name])).sort()
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
      // Pre-check DB for case-insensitive duplicate
      const { data: existing } = await (supabase.from('diagnoses') as any)
        .select('name')
        .ilike('name', name)
        .maybeSingle()

      if (existing) {
        showToast(`"${existing.name}" is already available in the diagnosis list!`, 'info')
        setNewDiagText('')
        await loadData()
        return
      }

      const { error } = await supabase.from('diagnoses').insert({ name })
      if (error) {
        if (error.code === '23505' || error.message?.includes('unique constraint') || error.message?.includes('duplicate key')) {
          showToast(`"${name}" is already available in the diagnosis list!`, 'info')
          setNewDiagText('')
          await loadData()
          return
        }
        throw error
      }

      showToast(`Diagnosis "${name}" added to dropdown list!`, 'success')
      setNewDiagText('')
      await loadData()
    } catch (e: any) {
      if (e.code === '23505' || e.message?.includes('unique constraint') || e.message?.includes('duplicate key')) {
        showToast(`"${name}" is already available in the diagnosis list!`, 'info')
        setNewDiagText('')
        await loadData()
      } else {
        showToast(`Unable to add diagnosis: ${e.message}`, 'error')
      }
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
            <span className="inline-flex items-center gap-1.5"><ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard</span>
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
            Fill and submit department specific metrics for event days.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(isSuperAdminActing ? '/dashboard' : '/my-department')}
          className="text-xs h-9 cursor-pointer w-fit"
        >
          <span className="inline-flex items-center gap-1.5"><ArrowLeft className="h-3.5 w-3.5" /> {isSuperAdminActing ? 'Back to Submission Board' : 'Back to Dashboard'}</span>
        </Button>
      </div>

      {/* On behalf warning */}
      {isSuperAdminActing && (
        <div className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)' }}>
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>
              <span className="text-[12px] font-bold text-amber-700 dark:text-amber-700 dark:text-amber-400 uppercase block tracking-wider">Secretariat On-Behalf Submission Mode</span>
              <p className="text-[11px] text-muted-foreground">
                You are entering daily logs for the <strong>{department.name}</strong> department. Any submit action will record you as reviewer on-behalf.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')} className="text-xs h-9 shrink-0 w-full sm:w-auto">
            Cancel Secretariat Mode
          </Button>
        </div>
      )}

      {/* Admin Department Switcher */}
      {isSuperAdminActing && allDepartments.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 bg-card border border-border p-4 rounded-xl">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Switch Department Form:</span>
          <ModernSelect
            value={department?.id || ''}
            onChange={(e) => {
              const newDeptId = e.target.value
              const urlParams = new URLSearchParams(window.location.search)
              urlParams.set('deptId', newDeptId)
              router.push(`/my-department/daily-log?${urlParams.toString()}`)
            }}
            className="w-full sm:w-auto bg-background border border-border rounded-lg text-xs font-semibold px-3 py-1.5 text-foreground h-10 sm:h-9"
          >
            {allDepartments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </ModernSelect>
        </div>
      )}
      {behalfAdminName && (
        <div className="rounded-xl p-4 flex items-center gap-2.5 border" style={{ background: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.2)' }}>
          <span className="text-base text-blue-700 dark:text-blue-400">ℹ️</span>
          <p className="text-[12px] text-muted-foreground">
            This log was <strong>Submitted on behalf of {department.name} by {behalfAdminName}</strong>.
          </p>
        </div>
      )}

      {/* Date Day Selector — Horizontal Apple-Style Scrollable Rail */}
      <div className="glass-card p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Event Reporting Day</span>
          <span className="text-[10px] text-amber-700 dark:text-amber-700 dark:text-amber-400 font-mono font-semibold sm:hidden inline-flex items-center gap-1">Swipe <ArrowLeft className="h-2.5 w-2.5" /><ArrowRight className="h-2.5 w-2.5" /></span>
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
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40 shadow-xs'
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

          {/* Workforce breakdown section vs Ushering 5-Section Repeat Groups */}
          {department?.name?.toLowerCase().includes('ushering') && (metricsData.teachers_meeting || metricsData.toddlers_section || metricsData.junior_section || metricsData.pre_teens_section || metricsData.teenagers_section || !reportId) ? (
            <Card className="glass-card border-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold text-foreground uppercase tracking-wider">
                  2. Ushering Operational Meetings &amp; Sections
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Record attendance, leaders/preachers, and offerings across Teachers' Meeting and the 4 section tables (Toddlers, Junior, Pre-Teens, Teenagers).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {department.default_metrics_schema?.fields && (
                  <SchemaFormRenderer
                    fields={department.default_metrics_schema.fields}
                    value={metricsData}
                    onChange={setMetricsData}
                    readOnly={isReadOnly}
                  />
                )}
              </CardContent>
            </Card>
          ) : hasWorkforce && (
            <Card className="glass-card border-none">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg font-bold text-foreground uppercase tracking-wider">
                    2. Attendee Category Breakdown
                  </CardTitle>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/25 whitespace-nowrap">
                    Total Workforce: {Object.values(workforce).reduce((a, b) => a + b, 0).toLocaleString()}
                  </span>
                </div>
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
                    className="input-dark font-mono text-center text-foreground h-10 sm:h-9"
                  />
                  <NumberField
                    value={workforce.teachersFemale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teachersFemale: val }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground h-10 sm:h-9"
                  />
                </div>

                {/* Teenagers */}
                <div className="grid grid-cols-3 gap-2 items-center text-xs sm:text-sm py-1">
                  <span className="font-semibold text-foreground">Teenagers</span>
                  <NumberField
                    value={workforce.teenagersMale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teenagersMale: val }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground h-10 sm:h-9"
                  />
                  <NumberField
                    value={workforce.teenagersFemale}
                    onChange={(val) => setWorkforce(w => ({ ...w, teenagersFemale: val }))}
                    disabled={isReadOnly}
                    className="input-dark font-mono text-center text-foreground h-10 sm:h-9"
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
                  {department?.name?.toLowerCase().includes('ushering') && (metricsData.teachers_meeting || metricsData.toddlers_section || metricsData.junior_section || metricsData.pre_teens_section || metricsData.teenagers_section || !reportId)
                    ? 'Auto-computed from section offering collections'
                    : 'Record total offering collected for this day.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {department?.name?.toLowerCase().includes('ushering') && (metricsData.teachers_meeting || metricsData.toddlers_section || metricsData.junior_section || metricsData.pre_teens_section || metricsData.teenagers_section || !reportId) ? (
                  (() => {
                    const sumArr = (arr: any[]) => Array.isArray(arr) ? arr.reduce((sum, r) => sum + (Number(r?.offering) || 0), 0) : 0
                    const tm = sumArr(metricsData.teachers_meeting)
                    const tod = sumArr(metricsData.toddlers_section)
                    const jun = sumArr(metricsData.junior_section)
                    const pt = sumArr(metricsData.pre_teens_section)
                    const tn = sumArr(metricsData.teenagers_section)
                    const total = tm + tod + jun + pt + tn

                    return (
                      <div className="space-y-2.5 font-mono text-xs">
                        <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                          <span className="text-muted-foreground font-sans font-medium">Teachers' Meeting:</span>
                          <span className="font-bold text-foreground">₦{tm.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                          <span className="text-muted-foreground font-sans font-medium">Toddlers Section:</span>
                          <span className="font-bold text-foreground">₦{tod.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                          <span className="text-muted-foreground font-sans font-medium">Junior Section:</span>
                          <span className="font-bold text-foreground">₦{jun.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                          <span className="text-muted-foreground font-sans font-medium">Pre-Teens Section:</span>
                          <span className="font-bold text-foreground">₦{pt.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5 border-b border-border/40">
                          <span className="text-muted-foreground font-sans font-medium">Teenagers Section:</span>
                          <span className="font-bold text-foreground">₦{tn.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 text-sm border-t-2 border-emerald-500/50">
                          <span className="font-bold text-emerald-700 dark:text-emerald-700 dark:text-emerald-400 font-sans uppercase tracking-wider">Grand Total Offering:</span>
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-400 font-mono text-base">₦{total.toLocaleString()}</span>
                        </div>
                      </div>
                    )
                  })()
                ) : (
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
                )}
              </CardContent>
            </Card>
          )}

          {/* Custom Schema Form rendering (Conditional: rendered ONLY when custom fields exist and not Ushering main column) */}
          {!department?.name?.toLowerCase().includes('ushering') &&
           department.default_metrics_schema &&
           department.default_metrics_schema.fields &&
           department.default_metrics_schema.fields.length > 0 && (
            <Card className="glass-card border-none">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider">
                    Department Custom Metrics
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Log metrics specific to {department.name} operations.
                  </CardDescription>
                </div>
                {department.name.toLowerCase().includes('registration') && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsPreTotalsOpen(true)}
                    className="text-[11px] h-9 sm:h-8 px-3 border-teal-500/40 text-teal-700 dark:text-teal-400 whitespace-nowrap hover:bg-teal-500/10 font-bold shrink-0"
                  >
                    <Globe className="w-3 h-3 mr-1" />
                    Online Pre-Totals
                  </Button>
                )}
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
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        id="add-diag-opt"
                        placeholder="e.g. CHOLERA"
                        value={newDiagText}
                        onChange={(e) => setNewDiagText(e.target.value)}
                        className="input-dark h-10 sm:h-9 text-xs flex-1 text-foreground"
                      />
                      <Button
                        onClick={handleAddDiagnosisInline}
                        size="sm"
                        className="h-10 sm:h-9 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 shrink-0"
                      >
                        Add option
                      </Button>
                    </div>
                  </div>
                )}
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
          {/* Submission panel */}
          <Card className="glass-card border-none">
            <CardContent className="pt-6 space-y-4">

              {/* Network + Draft status indicators */}
              <div className="flex items-center justify-between text-[11px] pb-3 border-b border-border gap-2">
                <div className="flex items-center gap-1.5">
                  {isOnline
                    ? <Wifi className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                    : <WifiOff className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 animate-pulse" />}
                  <span className={isOnline ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-amber-700 dark:text-amber-400 font-semibold'}>
                    {isOnline ? 'Online' : 'No signal'}
                  </span>
                  {draftSaved && (
                    <span className="ml-2 text-muted-foreground italic">· Draft saved</span>
                  )}
                </div>
                <span
                  className="font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
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
                  <Clock className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-amber-800 dark:text-amber-300">
                    <span className="font-bold block">Report queued for sync</span>
                    <span className="text-amber-700/90 dark:text-amber-700 dark:text-amber-400/80">This report will auto-submit the moment your connection is restored. No action needed.</span>
                  </div>
                </div>
              )}

              {/* Form Validation Warnings */}
              {!isReadOnly && validationErrors.length > 0 && (
                <div className="rounded-xl p-3 text-[11px] space-y-1.5" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: '#D97706' }}>
                  <span className="font-bold uppercase tracking-wide inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Gating Warnings</span>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {validationErrors.map((e, idx) => <li key={idx}>{e}</li>)}
                  </ul>
                </div>
              )}

              {isReadOnly ? (
                <p className="text-muted-foreground text-center text-xs italic">
                  This report is submitted/approved and locked. Contact Secretariat to make updates.
                </p>
              ) : (() => {
                const reportWindow = evaluateDailyReportWindow(activeDay)
                const isSubmitLockedByWindow = !isSuperAdminActing && !reportWindow.isOpen
                return (
                  <div className="flex flex-col gap-2">
                    {isSubmitLockedByWindow && (
                      <div className="rounded-xl p-3 text-[11px] bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-800 dark:text-amber-300">
                        <span className="font-bold block mb-0.5">Submission Window Not Open</span>
                        <span>{reportWindow.message}</span>
                      </div>
                    )}
                    <Button
                      onClick={() => handleSubmit(false)}
                      disabled={loading || hasPendingSync}
                      variant="outline"
                      className="w-full text-xs font-semibold"
                    >
                      {loading ? 'Saving...' : 'Save Draft'}
                    </Button>
                    <Button
                      onClick={handlePreSubmitCheck}
                      disabled={loading || isSubmitLockedByWindow}
                      className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                    >
                      {loading
                        ? 'Submitting...'
                        : isSubmitLockedByWindow
                        ? 'Submission Locked Until Event Day'
                        : !isOnline
                        ? <span className="inline-flex items-center gap-1.5"><WifiOff className="h-3.5 w-3.5" /> Review & Queue Offline</span>
                        : 'Review & Submit Daily Log'}
                    </Button>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── PRE-SUBMISSION REVIEW MODAL ── */}
      {isReviewModalOpen && activeDay && department && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 dark:bg-slate-950/80 backdrop-blur-md animate-fade-in-up"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) setIsReviewModalOpen(false)
          }}
        >
          <Card className="w-full max-w-lg bg-card border border-border text-foreground shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3 border-b border-border">
              <div>
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Review Daily Log Before Submitting
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  {department.name} · Day {activeDay.day_number} — Please verify your figures before locking this submission.
                </CardDescription>
              </div>
              <button
                onClick={() => !loading && setIsReviewModalOpen(false)}
                aria-label="Close review modal"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 flex-1 min-h-0 overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                {!DEPTS_WITHOUT_ATTENDANCE.includes(department.id) && (
                  <>
                    <div className="p-3 rounded-xl bg-muted/50 border border-border">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">Morning Attendance</span>
                      <span className="text-lg font-mono font-bold text-foreground">{attendanceMorning.toLocaleString()}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/50 border border-border">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">Evening Attendance</span>
                      <span className="text-lg font-mono font-bold text-foreground">{attendanceEvening.toLocaleString()}</span>
                    </div>
                  </>
                )}
                {hasWorkforce && (
                  <div className="p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">Total Workforce</span>
                    <span className="text-lg font-mono font-bold text-blue-700 dark:text-blue-400">
                      {Object.values(workforce).reduce((a, b) => a + b, 0).toLocaleString()}
                    </span>
                  </div>
                )}
                {(hasOffering || department.name.toLowerCase().includes('ushering')) && (
                  <div className="p-3 rounded-xl bg-muted/50 border border-border">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">Recorded Offering</span>
                    <span className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      ₦{offering.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {validationErrors.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1">
                  <span className="font-bold uppercase tracking-wider text-[10px] inline-flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Pre-Submission Warnings
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1 text-[11px] text-muted-foreground">
                <div><strong className="text-foreground">Daily Narrative:</strong> {dailyOverview.trim() ? 'Provided' : 'Not entered'}</div>
                <div><strong className="text-foreground">Custom Metrics Fields:</strong> {Object.keys(metricsData || {}).length} populated</div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsReviewModalOpen(false)}
                disabled={loading}
                className="text-xs h-9 px-4"
              >
                Back to Edit
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  setIsReviewModalOpen(false)
                  await handleSubmit(true)
                }}
                disabled={loading}
                className="text-xs h-9 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                {!isOnline ? 'Confirm & Queue Offline' : 'Confirm & Submit Report'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      
      {/* Sticky Mobile Bottom Summary & Action Bar */}
      {!isReadOnly && (
        <div className="lg:hidden sticky bottom-0 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur-md border-t border-border shadow-lg flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Day {activeDay?.day_number || 1} Summary
            </div>
            <div className="text-xs font-mono font-bold text-foreground truncate">
              {(attendanceMorning + attendanceEvening).toLocaleString()} Att.
              {hasOffering ? ` · ₦${offering.toLocaleString()}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleSubmit(false)}
              disabled={loading || hasPendingSync}
              className="h-9 px-3 text-xs font-semibold"
            >
              {loading ? 'Saving...' : 'Draft'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePreSubmitCheck}
              disabled={loading || (!isSuperAdminActing && !evaluateDailyReportWindow(activeDay).isOpen)}
              className="h-9 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
            >
              {!isOnline ? 'Queue' : 'Submit'}
            </Button>
          </div>
        </div>
      )}

      <PreEventRegistrationTotalsModal
        isOpen={isPreTotalsOpen}
        onClose={() => setIsPreTotalsOpen(false)}
        userRole={profile?.role}
      />
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
