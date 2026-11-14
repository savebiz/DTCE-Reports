export interface WorkforceCounts {
  teachersMale: number
  teachersFemale: number
  teenagersMale: number
  teenagersFemale: number
}

export function isUsheringDept(deptName?: string | null): boolean {
  return Boolean(deptName && deptName.toLowerCase().includes('ushering'))
}

export function isAttendanceDept(deptName?: string | null): boolean {
  if (!deptName) return false
  const lower = deptName.toLowerCase()
  return (
    lower.includes('ushering') ||
    lower.includes('program') ||
    lower.includes('toddler') ||
    lower.includes('special children')
  )
}

export function computeUsheringAttendance(metricsData: any): {
  morning: number
  evening: number
  total: number
} {
  if (!metricsData || typeof metricsData !== 'object') {
    return { morning: 0, evening: 0, total: 0 }
  }
  const sections = [
    metricsData.toddlers_section,
    metricsData.junior_section,
    metricsData.pre_teens_section,
    metricsData.teenagers_section,
  ]
  let morning = 0
  let evening = 0
  let total = 0

  for (const sec of sections) {
    if (!Array.isArray(sec)) continue
    for (const row of sec) {
      const rowTotal = (Number(row?.male) || 0) + (Number(row?.female) || 0)
      total += rowTotal
      const ev = String(row?.event || '').toLowerCase()
      if (ev.includes('evening') || ev.includes('revival')) {
        evening += rowTotal
      } else {
        morning += rowTotal
      }
    }
  }

  return { morning, evening, total }
}

export function computeDerivedOffering(
  deptName: string | null | undefined,
  metricsData: any,
  manualOffering: number
): number {
  const lower = (deptName || '').toLowerCase()
  if (lower.includes('ushering')) {
    const sumArr = (arr: any[]) =>
      Array.isArray(arr) ? arr.reduce((sum, r) => sum + (Number(r?.offering) || 0), 0) : 0
    return (
      sumArr(metricsData?.teachers_meeting) +
      sumArr(metricsData?.toddlers_section) +
      sumArr(metricsData?.junior_section) +
      sumArr(metricsData?.pre_teens_section) +
      sumArr(metricsData?.teenagers_section)
    )
  }
  if (lower.includes('registration')) {
    const walkin = metricsData?.walkin_registrations
    return Array.isArray(walkin)
      ? walkin.reduce((sum, r) => sum + (Number(r?.amount_collected) || 0), 0)
      : 0
  }
  return Number(manualOffering) || 0
}

export function summarizeCustomMetrics(
  metricsData: any
): Array<{ label: string; count: number }> {
  if (!metricsData || typeof metricsData !== 'object') return []
  return Object.entries(metricsData)
    .map(([key, val]) => {
      const count = Array.isArray(val)
        ? val.length
        : val !== null && val !== undefined && val !== ''
        ? 1
        : 0
      const label = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
      return { label, count }
    })
    .filter((item) => item.count > 0)
}

export function totalWorkforceCount(workforce?: Partial<WorkforceCounts> | null): number {
  if (!workforce) return 0
  return (
    (Number(workforce.teachersMale) || 0) +
    (Number(workforce.teachersFemale) || 0) +
    (Number(workforce.teenagersMale) || 0) +
    (Number(workforce.teenagersFemale) || 0)
  )
}
