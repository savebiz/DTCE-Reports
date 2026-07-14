import { createClient as createBrowserClient } from './client'
import { mockSupabaseClient, store } from './mockClient'

export const isMock = true

export function getClient() {
  if (isMock) {
    return mockSupabaseClient
  }
  return createBrowserClient()
}

export { store }
export type { Profile, DailyReport, DepartmentNarrative, Event, EventDay, Department } from './mockData'
export { mockDepartments, mockEvents, mockEventDays, mockProfiles } from './mockData'
