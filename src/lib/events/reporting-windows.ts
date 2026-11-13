import { formatWatDateTime, startOfDayWAT } from './requisition-windows'

export interface DailyReportWindowState {
  isOpen: boolean
  opensAt: Date | null
  message: string
}

const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * Evaluates whether a daily report for `eventDay` can be entered/submitted.
 * By default, each event day opens `leadHours` (6h) before 00:00 WAT on that day
 * (i.e. 18:00 WAT the evening before). If `event` is still in a pre-event
 * phase (`requisition_open`, `draft`, `planning`) or its `start_date` has not
 * reached the opening window, daily reporting remains locked.
 */
export function evaluateDailyReportWindow(
  eventDay: { date?: string | null; label?: string | null; day_number?: number | null } | null | undefined,
  now: Date = new Date(),
  leadHours = 6,
  event?: { status?: string | null; start_date?: string | null } | null
): DailyReportWindowState {
  if (event) {
    const preEventStatuses = ['requisition_open', 'draft', 'planning']
    const evStart = event.start_date ? startOfDayWAT(event.start_date) : null
    const evOpensAt = evStart ? new Date(evStart.getTime() - leadHours * ONE_HOUR_MS) : null

    if (event.status && preEventStatuses.includes(event.status)) {
      return {
        isOpen: false,
        opensAt: evOpensAt,
        message: evOpensAt
          ? `Daily reporting opens on ${formatWatDateTime(evOpensAt)}. Only pre-event store requests are open right now.`
          : 'Daily reporting is locked during the pre-event requisition phase.',
      }
    }

    if (evOpensAt && now.getTime() < evOpensAt.getTime()) {
      return {
        isOpen: false,
        opensAt: evOpensAt,
        message: `Daily reporting opens on ${formatWatDateTime(evOpensAt)}.`,
      }
    }
  }

  if (!eventDay?.date) {
    return {
      isOpen: true,
      opensAt: null,
      message: 'Reporting window is open.',
    }
  }

  const dayStart = startOfDayWAT(eventDay.date)
  if (!dayStart) {
    return {
      isOpen: true,
      opensAt: null,
      message: 'Reporting window is open.',
    }
  }

  const opensAt = new Date(dayStart.getTime() - leadHours * ONE_HOUR_MS)
  if (now.getTime() < opensAt.getTime()) {
    const dayLabel = eventDay.label || (eventDay.day_number ? `Day ${eventDay.day_number}` : 'this day')
    return {
      isOpen: false,
      opensAt,
      message: `Submissions for ${dayLabel} open on ${formatWatDateTime(opensAt)}.`,
    }
  }

  return {
    isOpen: true,
    opensAt,
    message: 'Reporting window is open.',
  }
}
