/**
 * Single source of truth for "which event is the platform running right now".
 *
 * Every page and API route that reads or writes event-scoped data (event days,
 * daily reports, narratives, store requisitions, HOD assignments) must resolve
 * the event through these helpers instead of picking `events[0]` or
 * `.limit(1)` on its own. With more than one event in the database
 * (Convention every August, Congress every December) ad-hoc picks silently
 * mix data from different events.
 *
 * Works with the browser client, the server client, the service-role client
 * and the mock client — anything with a Supabase-style `.from()`.
 */

export type EventType = 'convention' | 'congress' | 'other'
export type EventStatus = 'planning' | 'requisition_open' | 'live' | 'closed' | 'archived'
export type WindowOverride = 'auto' | 'force_open' | 'force_closed'

export interface PlatformEvent {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  theme_colors?: { primary: string; secondary: string } | null
  event_type?: EventType | null
  event_year?: number | null
  status?: EventStatus | null
  is_current?: boolean | null
  requisition_opens_at?: string | null
  requisition_closes_at?: string | null
  live_requisition_opens_at?: string | null
  pre_event_override?: WindowOverride | null
  live_requisition_override?: WindowOverride | null
  created_at?: string
}

export interface PlatformEventDay {
  id: string
  event_id: string
  day_number: number
  date: string
}

export interface DepartmentAssignment {
  department_id: string
  event_id: string | null
  role_in_event?: string | null
  [key: string]: any
}

// Loosely typed so the real, server, admin and mock clients all fit.
type QueryClient = { from: (table: string) => any }

/**
 * The event the platform is currently running.
 *
 * 1. The row flagged `is_current = true` (set by migration / set_current_event()).
 * 2. Fallback while the migration has not run, or if no row is flagged:
 *    the event with the latest start date.
 */
export async function getCurrentEvent(supabase: QueryClient): Promise<PlatformEvent | null> {
  try {
    const { data: flagged, error } = await supabase
      .from('events')
      .select('*')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle()
    if (!error && flagged) return flagged as PlatformEvent
  } catch {
    // Column may not exist yet (migration pending) — use the fallback.
  }

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('start_date', { ascending: false })

  if (!events || events.length === 0) return null
  // Postgres sorts NULL start dates first in DESC order; skip those if possible.
  const dated = (events as PlatformEvent[]).find(e => !!e.start_date)
  return dated || (events[0] as PlatformEvent)
}

export async function getCurrentEventId(supabase: QueryClient): Promise<string | null> {
  const event = await getCurrentEvent(supabase)
  return event?.id ?? null
}

/** Days of one event, in order. Never returns days from other events. */
export async function getEventDays(supabase: QueryClient, eventId: string | null | undefined): Promise<PlatformEventDay[]> {
  if (!eventId) return []
  const { data } = await supabase
    .from('event_days')
    .select('*')
    .eq('event_id', eventId)
    .order('day_number', { ascending: true })
  return (data || []) as PlatformEventDay[]
}

/**
 * A person's department for an event.
 *
 * People hold one assignment row per event. When `eventId` is given, only
 * the row for that event is returned (null if they are not on its team), so
 * former HODs lose their old department when a new event starts. Teams are
 * carried over when an event is created (see supabase/seed/). Without an
 * `eventId`, the most recent assignment is returned.
 * (Replaces `.eq('profile_id', id).maybeSingle()`, which errors as soon as a
 * person has rows for two events.)
 */
export async function getDepartmentAssignment(
  supabase: QueryClient,
  profileId: string,
  eventId: string | null | undefined,
  select = 'department_id, event_id, role_in_event, created_at'
): Promise<DepartmentAssignment | null> {
  const { data } = await supabase
    .from('hod_assignments')
    .select(select)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })

  const rows = (data || []) as DepartmentAssignment[]
  if (rows.length === 0) return null
  // With a current event, only that event's team counts: a former HOD who was
  // not carried over to the new event no longer gets their old department.
  if (eventId) return rows.find(r => r.event_id === eventId) || null
  return rows[0]
}

/**
 * Collapse assignment rows to one department per person, preferring the
 * given event. Used by admin screens that list everyone.
 */
export function assignmentMapForEvent(
  rows: Array<{ profile_id: string; department_id: string; event_id?: string | null }> | null | undefined,
  eventId: string | null | undefined
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows || []) {
    if (!row.profile_id || !row.department_id) continue
    const isCurrent = !!eventId && row.event_id === eventId
    if (isCurrent || !(row.profile_id in map)) {
      map[row.profile_id] = row.department_id
    }
  }
  return map
}
