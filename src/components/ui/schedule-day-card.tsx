'use client'

import React from 'react'

export type DayStatus = 'submitted' | 'today' | 'upcoming' | 'missed'

interface StatusBadgeProps {
  status: DayStatus
  className?: string
}

const statusConfig: Record<DayStatus, { label: string; className: string }> = {
  submitted: {
    label: 'Submitted',
    className: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
  },
  today: {
    label: 'Today',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  upcoming: {
    label: 'Upcoming',
    className: 'bg-muted text-muted-foreground border-border',
  },
  missed: {
    label: 'Missed',
    className: 'bg-red-500/12 text-red-700 dark:text-red-400 border-red-500/25',
  },
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const cfg = statusConfig[status]
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${cfg.className} ${className}`}
    >
      {cfg.label}
    </span>
  )
}

interface ScheduleDayCardProps {
  dayNum: number
  dayLabel: string
  status: DayStatus
  isToday?: boolean
}

export function ScheduleDayCard({ dayNum, dayLabel, status, isToday }: ScheduleDayCardProps) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-all duration-300 ${
        isToday
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-card/60 border-border'
      }`}
    >
      <div className="flex items-center gap-3">
        {isToday && (
          <span className="h-1.5 w-1.5 rounded-full pulse-dot bg-amber-500 dark:bg-amber-400 shrink-0" />
        )}
        <span
          className={`font-tabular text-sm font-bold ${
            isToday ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
          }`}
        >
          {dayNum.toString().padStart(2, '0')}
        </span>
        <span
          className={`text-[11px] font-semibold uppercase tracking-wider ${
            isToday ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {dayLabel}
        </span>
      </div>
      <StatusBadge status={status} />
    </div>
  )
}
