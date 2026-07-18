'use client'

import React from 'react'

export type DayStatus = 'submitted' | 'today' | 'upcoming' | 'missed'

interface StatusBadgeProps {
  status: DayStatus
  className?: string
}

const statusConfig: Record<DayStatus, { label: string; bg: string; color: string; border: string }> = {
  submitted: {
    label: 'Submitted',
    bg: 'rgba(16,185,129,0.10)',
    color: '#34D399',
    border: 'rgba(16,185,129,0.22)',
  },
  today: {
    label: 'Today',
    bg: 'rgba(245,158,11,0.15)',
    color: '#FCD34D',
    border: 'rgba(245,158,11,0.30)',
  },
  upcoming: {
    label: 'Upcoming',
    bg: 'rgba(255,255,255,0.04)',
    color: '#334155',
    border: 'rgba(255,255,255,0.07)',
  },
  missed: {
    label: 'Missed',
    bg: 'rgba(239,68,68,0.10)',
    color: '#FCA5A5',
    border: 'rgba(239,68,68,0.22)',
  },
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const cfg = statusConfig[status]
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${className}`}
      style={{
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
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
      className="flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-300"
      style={
        isToday
          ? { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.28)' }
          : { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }
      }
    >
      <div className="flex items-center gap-3">
        {isToday && (
          <span
            className="h-1.5 w-1.5 rounded-full pulse-dot"
            style={{ background: '#FBBF24' }}
          />
        )}
        <span
          className="font-tabular text-sm font-bold"
          style={{ color: isToday ? '#FCD34D' : '#475569' }}
        >
          {dayNum.toString().padStart(2, '0')}
        </span>
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: isToday ? '#F1F5F9' : '#475569' }}
        >
          {dayLabel}
        </span>
      </div>
      <StatusBadge status={status} />
    </div>
  )
}
