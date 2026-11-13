import { formatWatDateTime, startOfDayWAT } from './requisition-windows'

export interface DailyReportWindowState {
  isOpen: boolean
  opensAt: Date | null
  message: string
}

const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * Evaluates whether a daily report for `eventDay` can be officially submitted.
 * By default, each event day opens `leadHours` (6h) before 00:00 WAT on that day
 * (i.e. 18:00 WAT the evening before), preventing premature pre-event submissions.
 */
export function evaluateDailyReportWindow(
  eventDay: { date?: string | null; label?: string | null; day_number?: number | null } | null | undefined,
  now: Date = new Date(),
  leadHours = 6
): DailyReportWindowState {
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
      message: `Submissions for ${dayLabel} open on ${formatWatDateTime(opensAt)}. You can save a draft in the meantime.`,
    }
  }

  return {
    isOpen: true,
    opensAt,
    message: 'Reporting window is open.',
  }
}
