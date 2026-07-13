'use client'

import {
  mockDepartments,
  mockEvents,
  mockEventDays,
  mockProfiles,
  mockDailyReports,
  mockDepartmentNarratives,
  Profile,
  DailyReport,
  DepartmentNarrative,
  ReportVersion,
  AuditLog
} from './mockData'

// Initialize localStorage state if empty
const isBrowser = typeof window !== 'undefined'

function getStorageItem<T>(key: string, defaultValue: T): T {
  if (!isBrowser) return defaultValue
  const item = localStorage.getItem(key)
  if (!item) {
    localStorage.setItem(key, JSON.stringify(defaultValue))
    return defaultValue
  }
  try {
    return JSON.parse(item)
  } catch {
    return defaultValue
  }
}

function setStorageItem<T>(key: string, value: T) {
  if (isBrowser) {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

// Stateful mock store
class MockSupabaseStore {
  get profiles(): Profile[] {
    return getStorageItem('dtce_mock_profiles', mockProfiles)
  }
  set profiles(val: Profile[]) {
    setStorageItem('dtce_mock_profiles', val)
  }

  get dailyReports(): DailyReport[] {
    return getStorageItem('dtce_mock_daily_reports', mockDailyReports)
  }
  set dailyReports(val: DailyReport[]) {
    setStorageItem('dtce_mock_daily_reports', val)
  }

  get narratives(): DepartmentNarrative[] {
    return getStorageItem('dtce_mock_narratives', mockDepartmentNarratives)
  }
  set narratives(val: DepartmentNarrative[]) {
    setStorageItem('dtce_mock_narratives', val)
  }

  get currentUser(): Profile | null {
    return getStorageItem('dtce_mock_current_user', null)
  }
  set currentUser(val: Profile | null) {
    setStorageItem('dtce_mock_current_user', val)
    if (isBrowser) {
      if (val) {
        document.cookie = `sb-mock-token=${val.id}; path=/`
      } else {
        document.cookie = `sb-mock-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC`
      }
    }
  }

  get reportVersions(): ReportVersion[] {
    return getStorageItem('dtce_mock_report_versions', [])
  }
  set reportVersions(val: ReportVersion[]) {
    setStorageItem('dtce_mock_report_versions', val)
  }

  get auditLogs(): AuditLog[] {
    return getStorageItem('dtce_mock_audit_logs', [])
  }
  set auditLogs(val: AuditLog[]) {
    setStorageItem('dtce_mock_audit_logs', val)
  }
}

export const store = new MockSupabaseStore()

// Thenable Mock Query Builder to support chained queries like Supabase client
class MockQueryBuilder {
  private table: string
  private filters: Array<(item: any) => boolean> = []
  private orderField?: string
  private orderAscending = true
  private isSingle = false
  private isMaybeSingle = false

  constructor(table: string) {
    this.table = table
  }

  eq(field: string, value: any) {
    this.filters.push((item) => item[field] === value)
    return this
  }

  order(field: string, { ascending = true } = {}) {
    this.orderField = field
    this.orderAscending = ascending
    return this
  }

  single() {
    this.isSingle = true
    return this
  }

  maybeSingle() {
    this.isMaybeSingle = true
    return this
  }

  async execute() {
    let data: any = []
    if (this.table === 'departments') {
      data = [...mockDepartments]
    } else if (this.table === 'events') {
      data = [...mockEvents]
    } else if (this.table === 'event_days') {
      data = [...mockEventDays]
    } else if (this.table === 'profiles') {
      data = [...store.profiles]
    } else if (this.table === 'daily_reports') {
      data = [...store.dailyReports]
    } else if (this.table === 'department_narratives') {
      data = [...store.narratives]
    } else if (this.table === 'audit_logs') {
      data = [...store.auditLogs]
    }

    // Apply filters
    for (const filter of this.filters) {
      data = data.filter(filter)
    }

    // Apply sorting
    if (this.orderField) {
      data.sort((a: any, b: any) => {
        const valA = a[this.orderField!]
        const valB = b[this.orderField!]
        if (valA < valB) return this.orderAscending ? -1 : 1
        if (valA > valB) return this.orderAscending ? 1 : -1
        return 0
      })
    }

    // Handle single/maybeSingle
    if (this.isSingle) {
      if (data.length === 0) {
        return { data: null, error: new Error('Record not found') }
      }
      return { data: data[0], error: null }
    }

    if (this.isMaybeSingle) {
      return { data: data[0] || null, error: null }
    }

    return { data, error: null }
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected)
  }
}

// Thenable Mock Insert Builder
class MockInsertBuilder {
  private table: string
  private data: any

  constructor(table: string, data: any) {
    this.table = table
    this.data = data
  }

  async execute() {
    let insertedRow: any = null
    if (this.table === 'daily_reports') {
      insertedRow = {
        id: 'report-' + Math.random().toString(36).substr(2, 9),
        attendance_morning: 0,
        attendance_evening: 0,
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...this.data
      }
      const reports = store.dailyReports
      reports.push(insertedRow)
      store.dailyReports = reports
    } else if (this.table === 'department_narratives') {
      insertedRow = {
        id: 'narrative-' + Math.random().toString(36).substr(2, 9),
        key_achievements: '',
        challenges: '',
        solutions: '',
        plans_for_tomorrow: '',
        feedback: '',
        ...this.data
      }
      const narratives = store.narratives
      narratives.push(insertedRow)
      store.narratives = narratives
    } else if (this.table === 'report_versions') {
      insertedRow = {
        id: 'version-' + Math.random().toString(36).substr(2, 9),
        version_number: 1,
        created_at: new Date().toISOString(),
        ...this.data
      }
      const versions = store.reportVersions
      versions.push(insertedRow)
      store.reportVersions = versions
    } else if (this.table === 'audit_logs') {
      insertedRow = {
        id: 'log-' + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        ...this.data
      }
      const logs = store.auditLogs
      logs.push(insertedRow)
      store.auditLogs = logs
    }

    return { data: insertedRow ? [insertedRow] : [], error: null }
  }

  select() {
    return this
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected)
  }
}

// Thenable Mock Update Builder
class MockUpdateBuilder {
  private table: string
  private data: any
  private filterField?: string
  private filterValue?: any

  constructor(table: string, data: any) {
    this.table = table
    this.data = data
  }

  eq(field: string, value: any) {
    this.filterField = field
    this.filterValue = value
    return this
  }

  async execute() {
    let updatedRows: any[] = []
    if (this.table === 'daily_reports') {
      const reports = store.dailyReports
      const idx = reports.findIndex(r => r[this.filterField as keyof DailyReport] === this.filterValue)
      if (idx !== -1) {
        reports[idx] = {
          ...reports[idx],
          ...this.data,
          updated_at: new Date().toISOString()
        }
        store.dailyReports = reports
        updatedRows = [reports[idx]]
      }
    } else if (this.table === 'department_narratives') {
      const narratives = store.narratives
      const idx = narratives.findIndex(n => n[this.filterField as keyof DepartmentNarrative] === this.filterValue)
      if (idx !== -1) {
        narratives[idx] = { ...narratives[idx], ...this.data }
        store.narratives = narratives
        updatedRows = [narratives[idx]]
      }
    }
    return { data: updatedRows, error: null }
  }

  select() {
    return this
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected)
  }
}

// Stateful mock client that mimics Supabase client
export const mockSupabaseClient = {
  auth: {
    async signInWithOtp({ email }: { email: string }) {
      const profile = store.profiles.find(p => p.email.toLowerCase() === email.toLowerCase())
      if (!profile) {
        return { data: { user: null }, error: new Error('User not found in seeded profile lists') }
      }
      return { data: { user: { id: profile.id, email } }, error: null }
    },

    async signInWithMockUser(email: string) {
      const profile = store.profiles.find(p => p.email.toLowerCase() === email.toLowerCase())
      if (!profile) {
        return { data: { user: null }, error: new Error('User not found') }
      }
      store.currentUser = profile
      return { data: { user: { id: profile.id, email, user_metadata: { role: profile.role, full_name: profile.full_name } } }, error: null }
    },

    async signOut() {
      store.currentUser = null
      return { error: null }
    },

    async getUser() {
      const u = store.currentUser
      if (!u) return { data: { user: null }, error: null }
      return {
        data: {
          user: {
            id: u.id,
            email: u.email,
            user_metadata: { role: u.role, full_name: u.full_name }
          }
        },
        error: null
      }
    },

    onAuthStateChange() {
      return { data: { subscription: { unsubscribe: () => {} } } }
    }
  },

  from(table: string) {
    return {
      select() {
        return new MockQueryBuilder(table)
      },

      insert(data: any) {
        return new MockInsertBuilder(table, data)
      },

      update(data: any) {
        return new MockUpdateBuilder(table, data)
      }
    }
  }
}
