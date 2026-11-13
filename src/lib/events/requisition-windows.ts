import type { PlatformEvent, WindowOverride } from './current-event'

export type RequisitionStage = 'pre_event' | 'during_event'

export type WindowClosedReason =
  | 'no_event'
  | 'event_closed'
  | 'force_closed'
  | 'not_started'
  | 'closed'
  | 'no_dates'

export interface RequisitionWindowState {
  isOpen: boolean
  reason: WindowClosedReason | 'open' | 'force_open'
  opensAt: Date | null
  closesAt: Date | null
  isOverride: boolean
  overrideMode: WindowOverride
  message: string
}

const WAT_OFFSET_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Parses a YYYY-MM-DD date string as 00:00:00 WAT (UTC+1 / Africa/Lagos).
 */
export function startOfDayWAT(dateStr: string): Date | null {
  if (!dateStr) return null
  const clean = dateStr.slice(0, 10)
  const parsed = new Date(`${clean}T00:00:00+01:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Default Live Store Requisition open time: 1 day before event start_date at 00:00 WAT.
 */
export function getDefaultLiveRequisitionOpensAt(event: PlatformEvent | null): Date | null {
  if (!event?.start_date) return null
  const start = startOfDayWAT(event.start_date)
  if (!start) return null
  return new Date(start.getTime() - ONE_DAY_MS)
}

export function formatWatDateTime(date: Date | string | null | undefined): string {
  if (!date) return 'Not scheduled'
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return 'Invalid date'
  return (
    d.toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' WAT'
  )
}

/**
 * Converts a Date or ISO timestamp into a `YYYY-MM-DDTHH:mm` string in WAT (UTC+1)
 * suitable for `<input type="datetime-local" />`.
 */
export function toWatInputValue(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return ''
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(d.getTime())) return ''
  const watMs = d.getTime() + WAT_OFFSET_MS
  const wat = new Date(watMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${wat.getUTCFullYear()}-${pad(wat.getUTCMonth() + 1)}-${pad(wat.getUTCDate())}T${pad(wat.getUTCHours())}:${pad(wat.getUTCMinutes())}`
}

/**
 * Converts a `<input type="datetime-local" />` value (interpreted in WAT UTC+1) to an ISO UTC string.
 */
export function fromWatInputValue(val: string | null | undefined): string | null {
  if (!val || !val.trim()) return null
  const normalized = val.trim().length === 16 ? `${val.trim()}:00+01:00` : `${val.trim()}+01:00`
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function evaluateRequisitionWindow(
  event: PlatformEvent | null,
  stage: RequisitionStage,
  now: Date = new Date()
): RequisitionWindowState {
  if (!event) {
    return {
      isOpen: false,
      reason: 'no_event',
      opensAt: null,
      closesAt: null,
      isOverride: false,
      overrideMode: 'auto',
      message: 'No active event is configured on the platform.',
    }
  }

  if (event.status === 'closed' || event.status === 'archived') {
    return {
      isOpen: false,
      reason: 'event_closed',
      opensAt: null,
      closesAt: null,
      isOverride: false,
      overrideMode: 'auto',
      message: `${event.name} is ${event.status}. Submissions are closed.`,
    }
  }

  if (stage === 'pre_event') {
    const override: WindowOverride = event.pre_event_override || 'auto'
    const opensAt = event.requisition_opens_at ? new Date(event.requisition_opens_at) : null
    const closesAt = event.requisition_closes_at ? new Date(event.requisition_closes_at) : null

    if (override === 'force_open') {
      return {
        isOpen: true,
        reason: 'force_open',
        opensAt,
        closesAt,
        isOverride: true,
        overrideMode: override,
        message: `Pre-Event Needs List is open (Super Admin override active).`,
      }
    }
    if (override === 'force_closed') {
      return {
        isOpen: false,
        reason: 'force_closed',
        opensAt,
        closesAt,
        isOverride: true,
        overrideMode: override,
        message: `Pre-Event Needs List submissions have been closed by the Super Admin.`,
      }
    }

    if (opensAt && !Number.isNaN(opensAt.getTime()) && now.getTime() < opensAt.getTime()) {
      return {
        isOpen: false,
        reason: 'not_started',
        opensAt,
        closesAt,
        isOverride: false,
        overrideMode: 'auto',
        message: `Pre-Event Needs List opens on ${formatWatDateTime(opensAt)}.`,
      }
    }

    if (closesAt && !Number.isNaN(closesAt.getTime()) && now.getTime() > closesAt.getTime()) {
      return {
        isOpen: false,
        reason: 'closed',
        opensAt,
        closesAt,
        isOverride: false,
        overrideMode: 'auto',
        message: `Pre-Event Needs List window closed on ${formatWatDateTime(closesAt)}.`,
      }
    }

    return {
      isOpen: true,
      reason: 'open',
      opensAt,
      closesAt,
      isOverride: false,
      overrideMode: 'auto',
      message: closesAt
        ? `Pre-Event Needs List is open until ${formatWatDateTime(closesAt)}.`
        : `Pre-Event Needs List is currently open.`,
    }
  }

  // stage === 'during_event'
  const override: WindowOverride = event.live_requisition_override || 'auto'
  const opensAt = event.live_requisition_opens_at
    ? new Date(event.live_requisition_opens_at)
    : getDefaultLiveRequisitionOpensAt(event)

  if (override === 'force_open') {
    return {
      isOpen: true,
      reason: 'force_open',
      opensAt,
      closesAt: null,
      isOverride: true,
      overrideMode: override,
      message: `Live Event Store Requisitions are open (Super Admin override active).`,
    }
  }
  if (override === 'force_closed') {
    return {
      isOpen: false,
      reason: 'force_closed',
      opensAt,
      closesAt: null,
      isOverride: true,
      overrideMode: override,
      message: `Live Event Store Requisitions are currently closed by the Super Admin.`,
    }
  }

  if (!opensAt || Number.isNaN(opensAt.getTime())) {
    return {
      isOpen: false,
      reason: 'no_dates',
      opensAt: null,
      closesAt: null,
      isOverride: false,
      overrideMode: 'auto',
      message: `Live Event Store Requisitions are disabled until ${event.name} start dates are scheduled.`,
    }
  }

  if (now.getTime() < opensAt.getTime()) {
    return {
      isOpen: false,
      reason: 'not_started',
      opensAt,
      closesAt: null,
      isOverride: false,
      overrideMode: 'auto',
      message: `Live Event Store Requisitions are disabled before the event. They open on ${formatWatDateTime(opensAt)} (1 day before ${event.name} starts).`,
    }
  }

  return {
    isOpen: true,
    reason: 'open',
    opensAt,
    closesAt: null,
    isOverride: false,
    overrideMode: 'auto',
    message: `Live Event Store Requisitions are open for ${event.name}.`,
  }
}
