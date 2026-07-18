import { createClient as createBrowserClient } from './client'
import { mockSupabaseClient, store } from './mockClient'

const hasSupabaseEnv = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export const isMock = !hasSupabaseEnv

export function getClient() {
  if (isMock) {
    return mockSupabaseClient
  }
  return createBrowserClient()
}

export { store }
export type { Profile, DailyReport, DepartmentNarrative, Event, EventDay, Department } from './mockData'
export { mockDepartments, mockEvents, mockEventDays, mockProfiles } from './mockData'
