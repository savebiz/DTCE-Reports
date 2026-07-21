export interface Event {
  id: string
  name: string
  start_date: string
  end_date: string
  theme_colors: {
    primary: string
    secondary: string
  }
}

export interface EventDay {
  id: string
  event_id: string
  day_number: number
  date: string
}

export interface Department {
  id: string
  name: string
  default_metrics_schema?: any
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: 'super_admin' | 'coordinator' | 'hod' | 'assistant'
  department_id?: string
  username?: string
  must_change_password?: boolean
  created_by?: string
  is_active?: boolean
}

export interface DailyReport {
  id: string
  event_id: string
  event_day_id: string
  department_id: string
  submitted_by: string
  submitted_on_behalf_by?: string
  attendance_morning: number
  attendance_evening: number
  status: 'draft' | 'submitted' | 'approved'
  created_at: string
  updated_at: string
  metrics_data?: any
}

export interface DepartmentNarrative {
  id: string
  daily_report_id?: string
  event_id?: string
  department_id?: string
  submitted_on_behalf_by?: string
  is_end_of_event?: boolean
  status?: 'draft' | 'submitted' | 'reviewed' | 'approved'
  overview?: string
  highlights?: string
  challenges_json?: Array<{ id: string, text: string }>
  recommendations_json?: Array<{ text: string, linked_challenge_id?: string }>
  key_achievements?: string
  challenges?: string
  solutions?: string
  plans_for_tomorrow?: string
  feedback?: string
}

export interface ReportVersion {
  id: string
  daily_report_id: string
  version_number: number
  changed_by: string
  change_summary: string
  data: any
  created_at: string
}

export interface AuditLog {
  id: string
  reviewer_id: string
  timestamp: string
  previous_value: string
  new_value: string
  report_id: string
}

// 40 departments
export const mockDepartments: Department[] = [
  { id: 'dept-1', name: 'Accommodation' },
  { id: 'dept-2', name: 'Counselling' },
  { id: 'dept-3', name: 'Drama' },
  { id: 'dept-4', name: 'General Welfare' },
  { id: 'dept-5', name: 'Education & Resource Development' },
  { id: 'dept-6', name: 'Electrical' },
  { id: 'dept-7', name: 'Entrepreneurship & Skills Acquisition' },
  { id: 'dept-8', name: 'Evangelism' },
  { id: 'dept-9', name: 'ICT' },
  { id: 'dept-10', name: 'Medical', default_metrics_schema: {
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
        name: 'diagnoses',
        label: 'Diagnoses & Cases',
        type: 'repeat-group',
        schema: [
          { name: 'diagnosis', label: 'Diagnosis / Symptom', type: 'text' },
          { name: 'count', label: 'Count', type: 'number' }
        ]
      }
    ]
  }},
  { id: 'dept-11', name: 'Music' },
  { id: 'dept-12', name: 'Prayer' },
  { id: 'dept-13', name: 'Press' },
  { id: 'dept-14', name: 'Programs (Teens)' },
  { id: 'dept-15', name: 'Programs (Pre-Teens)' },
  { id: 'dept-16', name: 'Programs (6-8 years)' },
  { id: 'dept-17', name: 'Programs (Toddler)' },
  { id: 'dept-18', name: 'Protocol' },
  { id: 'dept-19', name: 'Projects & Maintenance' },
  { id: 'dept-20', name: 'Publicity' },
  { id: 'dept-21', name: 'Registration', default_metrics_schema: {
    fields: [
      {
        name: 'registration_data',
        label: 'Registration Data (by Mode)',
        type: 'repeat-group',
        schema: [
          { name: 'mode', label: 'Mode', type: 'select', options: ['online', 'offline'] },
          { name: 'teachers', "label": "Teachers Registered", "type": "number" },
          { name: 'teens', "label": "Teens Registered", "type": "number" },
          { name: 'pre_teens', "label": "Pre-Teens Registered", "type": "number" },
          { name: 'children', "label": "Children Registered", "type": "number" },
          { name: 'amount_collected', "label": "Amount Collected (₦)", "type": "number" }
        ]
      }
    ]
  }},
  { id: 'dept-22', name: 'Research & Development' },
  { id: 'dept-23', name: 'SEPU' },
  { id: 'dept-24', name: 'Sanitation' },
  { id: 'dept-25', name: 'Secretariat' },
  { id: 'dept-26', name: 'Security' },
  { id: 'dept-27', name: 'Special Children' },
  { id: 'dept-28', name: 'Sports' },
  { id: 'dept-29', name: 'Stores' },
  { id: 'dept-30', name: 'Technical' },
  { id: 'dept-31', name: 'Toddlers' },
  { id: 'dept-32', name: 'Transportation' },
  { id: 'dept-33', name: 'Ushering', default_metrics_schema: {
    fields: [
      {
        name: 'services',
        label: 'Services',
        type: 'repeat-group',
        schema: [
          { name: 'event_title', label: 'Service / Event Title', type: 'text' },
          { name: 'preacher', label: 'Preacher', type: 'text' },
          { name: 'male', label: 'Male Attendance', type: 'number' },
          { name: 'female', label: 'Female Attendance', type: 'number' },
          { name: 'offering', label: 'Offering Collected (₦)', type: 'number' },
          {
            name: 'attendance_by_category',
            label: 'Attendance by Category',
            type: 'repeat-group',
            schema: [
              { name: 'category', label: 'Category', type: 'select', options: ['Toddlers', '5-9', '8-12', 'Teenagers', 'Teaching Teachers', 'Other Depts'] },
              { name: 'male', label: 'Male', type: 'number' },
              { name: 'female', label: 'Female', type: 'number' }
            ]
          }
        ]
      }
    ]
  }},
  { id: 'dept-34', name: 'Welfare (Kitchen/Serving)', default_metrics_schema: {
    fields: [
      {
        name: 'meals',
        label: 'Meals Served',
        type: 'repeat-group',
        schema: [
          { name: 'meal_type', label: 'Meal Type', type: 'select', options: ['breakfast', 'lunch', 'dinner'] },
          { name: 'item', label: 'Food Item', type: 'text' },
          { name: 'quantity', label: 'Quantity', type: 'number' },
          { name: 'unit', label: 'Unit (e.g. Plates, Packs, Bags)', type: 'text' }
        ]
      }
    ]
  }},
  { id: 'dept-35', name: 'Public Relations' },
  { id: 'dept-36', name: 'Human & Capacity Development' },
  { id: 'dept-37', name: 'Finance' },
  { id: 'dept-38', name: 'Decoration & Event Planning' },
  { id: 'dept-39', name: 'Media' },
  { id: 'dept-40', name: 'DTCE Ambassadors' },
  { id: 'dept-41', name: 'National Competitions Committee' }
]

// Dynamically assign schemas to all departments
mockDepartments.forEach(dept => {
  if (dept.id === 'dept-9') { // ICT
    dept.default_metrics_schema = {
      fields: [
        {
          name: 'ict_logs',
          label: 'ICT Sub-unit Submissions',
          type: 'repeat-group',
          schema: [
            { name: 'subunit', label: 'Sub-unit', type: 'select', options: ['CBS', 'Technical', 'Research & Help Desk', 'Cybersecurity'] },
            { name: 'issues_resolved', label: 'Issues Resolved', type: 'number' },
            { name: 'outstanding_tickets', label: 'Outstanding Tickets', type: 'number' },
            { name: 'downtime_minutes', label: 'Downtime (min)', type: 'number' }
          ]
        }
      ]
    }
  } else if (dept.id === 'dept-28' || dept.id === 'dept-41') { // Sports & NCC
    dept.default_metrics_schema = {
      fields: [
        {
          name: 'competition_results',
          label: 'Competition Results',
          type: 'repeat-group',
          schema: [
            { name: 'category', label: 'Category', type: 'select', options: ['Football', 'Athletics', 'Bible Quiz', 'Spelling Bee', 'Chess'] },
            { name: 'subcategory', label: 'Sub-category', type: 'text' },
            { name: 'region_or_zone', label: 'Province / Region / Zone', type: 'text' },
            { name: 'position', label: 'Position achieved', type: 'number' }
          ]
        }
      ]
    }
  } else if (!dept.default_metrics_schema) { // Generic Fallback
    dept.default_metrics_schema = {
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
})

export const mockEvents: Event[] = [
  {
    id: 'event-1',
    name: 'RCCG DTCE 2026 Annual Convention',
    start_date: '2026-08-03',
    end_date: '2026-08-08',
    theme_colors: {
      primary: '#1B3A6B',
      secondary: '#C49A00'
    }
  }
]

export const mockEventDays: EventDay[] = [
  { id: 'day-1', event_id: 'event-1', day_number: 1, date: '2026-08-03' },
  { id: 'day-2', event_id: 'event-1', day_number: 2, date: '2026-08-04' },
  { id: 'day-3', event_id: 'event-1', day_number: 3, date: '2026-08-05' },
  { id: 'day-4', event_id: 'event-1', day_number: 4, date: '2026-08-06' },
  { id: 'day-5', event_id: 'event-1', day_number: 5, date: '2026-08-07' },
  { id: 'day-6', event_id: 'event-1', day_number: 6, date: '2026-08-08' }
]

export const mockProfiles: Profile[] = [
  { id: 'user-admin', email: 'admin@dtce.org', username: 'admin.secretariat', full_name: 'Admin Chief', role: 'super_admin', must_change_password: false, is_active: true },
  { id: 'user-coord', email: 'coordinator@dtce.org', username: 'jane.coordinator', full_name: 'Coordinator Jane', role: 'coordinator', must_change_password: false, is_active: true },
  { id: 'user-hod-med', email: 'hod@dtce.org', username: 'smith.medical', full_name: 'Dr. Smith (HOD)', role: 'hod', department_id: 'dept-10', must_change_password: false, is_active: true },
  { id: 'user-asst-med', email: 'assistant@dtce.org', username: 'kelly.medical', full_name: 'Nurse Kelly (Asst)', role: 'assistant', department_id: 'dept-10', must_change_password: false, is_active: true },
  { id: 'user-hod-reg', email: 'reg_hod@dtce.org', username: 'robert.registration', full_name: 'Elder Robert (Registration)', role: 'hod', department_id: 'dept-21', must_change_password: false, is_active: true },
  { id: 'user-hod-ush', email: 'ush_hod@dtce.org', username: 'john.ushering', full_name: 'Deacon John (Ushering)', role: 'hod', department_id: 'dept-33', must_change_password: false, is_active: true },
  { id: 'user-hod-wel', email: 'wel_hod@dtce.org', username: 'mary.welfare', full_name: 'Sister Mary (Welfare)', role: 'hod', department_id: 'dept-34', must_change_password: false, is_active: true }
]

export const mockDailyReports: DailyReport[] = [
  {
    id: 'report-1',
    event_id: 'event-1',
    event_day_id: 'day-1',
    department_id: 'dept-10', // Medical
    submitted_by: 'user-hod-med',
    attendance_morning: 45,
    attendance_evening: 62,
    status: 'approved',
    created_at: '2026-07-13T12:00:00Z',
    updated_at: '2026-07-13T19:00:00Z',
    metrics_data: {
      patients_demographics: [
        { category: 'children', gender: 'male', count: 12 },
        { category: 'children', gender: 'female', count: 15 },
        { category: 'adult', gender: 'male', count: 20 },
        { category: 'adult', gender: 'female', count: 25 }
      ],
      diagnoses: [
        { diagnosis: 'Malaria', count: 8 },
        { diagnosis: 'Headache / Fatigue', count: 14 },
        { diagnosis: 'Minor Cuts / Abrasions', count: 5 }
      ]
    }
  },
  {
    id: 'report-2',
    event_id: 'event-1',
    event_day_id: 'day-1',
    department_id: 'dept-21', // Registration
    submitted_by: 'user-hod-reg',
    attendance_morning: 20,
    attendance_evening: 25,
    status: 'submitted',
    created_at: '2026-07-13T14:30:00Z',
    updated_at: '2026-07-13T14:30:00Z',
    metrics_data: {
      registration_data: [
        { mode: 'offline', teachers: 3, teens: 45, pre_teens: 30, children: 25, amount_collected: 15000 },
        { mode: 'online', teachers: 5, teens: 80, pre_teens: 60, children: 50, amount_collected: 45000 }
      ]
    }
  },
  {
    id: 'report-3',
    event_id: 'event-1',
    event_day_id: 'day-2',
    department_id: 'dept-10', // Medical
    submitted_by: 'user-hod-med',
    attendance_morning: 30,
    attendance_evening: 45,
    status: 'draft',
    created_at: '2026-07-14T11:00:00Z',
    updated_at: '2026-07-14T11:15:00Z',
    metrics_data: {
      patients_demographics: [
        { category: 'adult', gender: 'female', count: 18 }
      ],
      diagnoses: [
        { diagnosis: 'Dehydration', count: 4 }
      ]
    }
  }
]

export const mockDepartmentNarratives: DepartmentNarrative[] = [
  {
    id: 'narrative-1',
    daily_report_id: 'report-1',
    key_achievements: 'Provided prompt medical attention to all visiting delegates. Successfully treated a minor sprain without needing hospital transfer.',
    challenges: 'High volume of patients in the afternoon causing slight delays in medication dispensing.',
    solutions: 'Assigned an assistant HOD to handle dispensing while the doctor focused strictly on consultations.',
    plans_for_tomorrow: 'Set up an extra triage desk to speed up intake processing.',
    feedback: 'Need more paracetamol supply.'
  },
  {
    id: 'narrative-2',
    daily_report_id: 'report-2',
    key_achievements: 'Smooth onboarding of delegates. Offline backup synced properly when connection was restored.',
    challenges: 'Slow internet connection at peak hours.',
    solutions: 'Used offline spreadsheets and logged details locally.',
    plans_for_tomorrow: 'Secure a secondary cellular router.',
    feedback: 'System runs very fast offline.'
  },
  {
    id: 'eoe-narrative-med',
    event_id: 'event-1',
    department_id: 'dept-10',
    is_end_of_event: true,
    status: 'submitted',
    overview: 'The Medical Department was fully active throughout the convention, running consultations and administering first aid treatment.',
    highlights: 'Successfully handled 170+ patient cases with zero referrals or casualties. Setup double consulting tables to reduce wait times during peak intervals.',
    challenges_json: [
      { "id": "med-c1", "text": "Insufficient stock of basic analgesics (paracetamol) on Day 2" },
      { "id": "med-c2", "text": "Poor lighting at the triage deck during evening sessions" }
    ],
    recommendations_json: [
      { "text": "Increase procurement quantities of pediatric and adult analgesics by 50%", "linked_challenge_id": "med-c1" },
      { "text": "Provide high-intensity rechargeable LED lamps for evening shift desk lighting", "linked_challenge_id": "med-c2" }
    ]
  },
  {
    id: 'eoe-narrative-reg',
    event_id: 'event-1',
    department_id: 'dept-21',
    is_end_of_event: true,
    status: 'approved',
    overview: 'The Registration Department completed the checking and physical tag printing for all delegates.',
    highlights: 'Over 850 delegates successfully registered. Live online dashboard database synced with local offline cache without packet loss.',
    challenges_json: [
      { "id": "reg-c1", "text": "Cramped layout of the main lobby registration tables" }
    ],
    recommendations_json: [
      { "text": "Move tag printing machines to a separate backroom; keep front desk only for collection", "linked_challenge_id": "reg-c1" }
    ]
  }
]
