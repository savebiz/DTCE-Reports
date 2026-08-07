export interface CustomMetricSummaryItem {
  categoryOrName: string
  metricLabel: string
  value: number
}

export interface CustomMetricGroupSummary {
  groupKey: string
  groupTitle: string
  items: CustomMetricSummaryItem[]
}

const PROPERTY_LABELS: Record<string, string> = {
  count_picked_up_today: 'Picked Up',
  new_registrations: 'New Registrations',
  manuals_distributed: 'Manuals Distributed',
  amount_collected: 'Amount Collected (₦)',
  count: 'Count',
  quantity: 'Quantity',
  cases: 'Cases',
  offering: 'Offering (₦)',
  atten: 'Attendance',
}

function formatPropertyLabel(prop: string): string {
  if (PROPERTY_LABELS[prop]) return PROPERTY_LABELS[prop]
  return prop
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatGroupTitle(key: string): string {
  const titles: Record<string, string> = {
    online_manual_pickups: 'SECTION A — Online Manual Pickups',
    walkin_registrations: 'SECTION B — Offline / Walk-in Registrations',
    patients_demographics: 'Patient Demographics',
    diagnoses_cases: 'Diagnoses & Cases Treated',
    items_issued: 'Inventory & Items Issued',
    meals_served: 'Meals & Food Distribution',
    services: 'Service Collections & Attendance',
    teachers_meeting: "Teachers' Meeting",
    toddlers_section: "Toddlers Section",
    junior_section: "Junior Section",
    pre_teens_section: "Pre-Teens Section",
    teenagers_section: "Teenagers Section",
  }
  if (titles[key]) return titles[key]
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function extractCustomMetricsSummary(reports: any[]): CustomMetricGroupSummary[] {
  if (!Array.isArray(reports) || reports.length === 0) return []

  const groupsMap: Record<string, Record<string, Record<string, number>>> = {}
  // groupKey -> categoryOrName -> metricProp -> sumValue

  reports.forEach(r => {
    const mData = r.metrics_data || {}
    const custom = mData.custom_schema || mData

    if (typeof custom !== 'object' || custom === null) return

    Object.keys(custom).forEach(key => {
      // Exclude standard non-custom fields
      if (['offering', 'workforce', 'daily_narrative', 'attendance_morning', 'attendance_evening', 'proxy_entry', 'schema_version', 'reviewer_feedback', 'custom_schema'].includes(key)) return

      const val = custom[key]
      if (Array.isArray(val) && val.length > 0) {
        if (!groupsMap[key]) groupsMap[key] = {}

        val.forEach((item: any) => {
          if (typeof item !== 'object' || item === null) return
          const catName = item.category || item.diagnosis || item.item_name || item.name || item.type || item.group || item.event || item.title || 'General'

          if (!groupsMap[key][catName]) groupsMap[key][catName] = {}

          Object.keys(item).forEach(prop => {
            if (['category', 'diagnosis', 'item_name', 'name', 'type', 'group', 's_n', 'event', 'title', 'preacher', 'preacher_or_invited_guest', 'title_and_bible_text'].includes(prop)) return
            const numVal = Number(item[prop])
            if (!isNaN(numVal) && numVal > 0) {
              groupsMap[key][catName][prop] = (groupsMap[key][catName][prop] || 0) + numVal
            }
          })
        })
      } else if (typeof val === 'number' && val > 0) {
        if (!groupsMap[key]) groupsMap[key] = {}
        if (!groupsMap[key]['General']) groupsMap[key]['General'] = {}
        groupsMap[key]['General'][key] = (groupsMap[key]['General'][key] || 0) + val
      }
    })
  })

  const result: CustomMetricGroupSummary[] = []

  Object.keys(groupsMap).forEach(groupKey => {
    const categories = groupsMap[groupKey]
    const itemsList: CustomMetricSummaryItem[] = []

    Object.keys(categories).forEach(catName => {
      const props = categories[catName]
      Object.keys(props).forEach(prop => {
        itemsList.push({
          categoryOrName: catName,
          metricLabel: formatPropertyLabel(prop),
          value: props[prop]
        })
      })
    })

    if (itemsList.length > 0) {
      result.push({
        groupKey,
        groupTitle: formatGroupTitle(groupKey),
        items: itemsList
      })
    }
  })

  return result
}

export function formatCustomMetricsTextLines(reports: any[]): string[] {
  const groups = extractCustomMetricsSummary(reports)
  const lines: string[] = []

  groups.forEach(g => {
    const itemStrings = g.items.map(i => `${i.categoryOrName} (${i.metricLabel}: ${i.value.toLocaleString()})`)
    lines.push(`${g.groupTitle}: ${itemStrings.join(' · ')}`)
  })

  return lines
}

// ── Ushering V2 Structured Summary ──────────────────────────────────────
export interface UsheringV2SectionRow {
  event: string
  preacher: string
  male: number
  female: number
  total: number
  teachersMale: number
  teachersFemale: number
  offering: number
}

export interface UsheringV2SectionSummary {
  sectionKey: string
  sectionTitle: string
  rows: UsheringV2SectionRow[]
  totals: { male: number; female: number; total: number; teachersMale: number; teachersFemale: number; offering: number }
}

const USHERING_SECTIONS = ['teachers_meeting', 'toddlers_section', 'junior_section', 'pre_teens_section', 'teenagers_section']
const USHERING_SECTION_TITLES: Record<string, string> = {
  teachers_meeting: "Teachers' Meeting",
  toddlers_section: 'Toddlers Section',
  junior_section: 'Junior Section',
  pre_teens_section: 'Pre-Teens Section',
  teenagers_section: 'Teenagers Section',
}

export function extractUsheringV2Summary(reports: any[]): UsheringV2SectionSummary[] {
  if (!Array.isArray(reports) || reports.length === 0) return []

  const sections: UsheringV2SectionSummary[] = []

  USHERING_SECTIONS.forEach(sectionKey => {
    const allRows: UsheringV2SectionRow[] = []
    const totals = { male: 0, female: 0, total: 0, teachersMale: 0, teachersFemale: 0, offering: 0 }

    reports.forEach(r => {
      const mData = r.metrics_data || {}
      const schemaVersion = mData.schema_version || mData.custom_schema?.schema_version
      if (schemaVersion !== 2) return // Only process v2 rows

      const custom = mData.custom_schema || mData
      const sectionData = custom[sectionKey]
      if (!Array.isArray(sectionData)) return

      sectionData.forEach((item: any) => {
        const m = Number(item.male) || 0
        const f = Number(item.female) || 0
        const t = m + f
        const tm = Number(item.teachers_male) || 0
        const tf = Number(item.teachers_female) || 0
        const off = Number(item.offering) || 0

        allRows.push({
          event: item.event || item.title || '',
          preacher: item.preacher || item.preacher_or_invited_guest || '',
          male: m,
          female: f,
          total: t,
          teachersMale: tm,
          teachersFemale: tf,
          offering: off,
        })

        totals.male += m
        totals.female += f
        totals.total += t
        totals.teachersMale += tm
        totals.teachersFemale += tf
        totals.offering += off
      })
    })

    if (allRows.length > 0) {
      sections.push({
        sectionKey,
        sectionTitle: USHERING_SECTION_TITLES[sectionKey] || formatGroupTitle(sectionKey),
        rows: allRows,
        totals,
      })
    }
  })

  return sections
}

// ── Registration Two-Channel Summary ────────────────────────────────────
export interface RegistrationCategorySummary {
  category: string
  pickedUp: number
  newRegistrations: number
  manualsDistributed: number
  amountCollected: number
}

export interface RegistrationTwoChannelSummary {
  sectionA: RegistrationCategorySummary[] // Online Manual Pickups
  sectionB: RegistrationCategorySummary[] // Walk-in Registrations
  totals: {
    pickedUp: number
    newRegistrations: number
    manualsDistributed: number
    amountCollected: number
  }
}

export function extractRegistrationTwoChannelSummary(reports: any[]): RegistrationTwoChannelSummary {
  const catMapA: Record<string, number> = {}
  const catMapB: Record<string, { newRegs: number; manuals: number; amount: number }> = {}
  const totals = { pickedUp: 0, newRegistrations: 0, manualsDistributed: 0, amountCollected: 0 }

  reports.forEach(r => {
    const mData = r.metrics_data || {}
    const custom = mData.custom_schema || mData

    // Section A
    const pickups = Array.isArray(custom.online_manual_pickups) ? custom.online_manual_pickups
      : Array.isArray(mData.online_manual_pickups) ? mData.online_manual_pickups : []
    pickups.forEach((item: any) => {
      const cat = item.category || 'Other'
      const count = Number(item.count_picked_up_today) || 0
      catMapA[cat] = (catMapA[cat] || 0) + count
      totals.pickedUp += count
    })

    // Section B
    const walkins = Array.isArray(custom.walkin_registrations) ? custom.walkin_registrations
      : Array.isArray(mData.walkin_registrations) ? mData.walkin_registrations : []
    walkins.forEach((item: any) => {
      const cat = item.category || 'Other'
      const newRegs = Number(item.new_registrations) || 0
      const manuals = Number(item.manuals_distributed) || 0
      const amount = Number(item.amount_collected) || 0
      if (!catMapB[cat]) catMapB[cat] = { newRegs: 0, manuals: 0, amount: 0 }
      catMapB[cat].newRegs += newRegs
      catMapB[cat].manuals += manuals
      catMapB[cat].amount += amount
      totals.newRegistrations += newRegs
      totals.manualsDistributed += manuals
      totals.amountCollected += amount
    })
  })

  const sectionA = Object.entries(catMapA).map(([category, pickedUp]) => ({
    category, pickedUp, newRegistrations: 0, manualsDistributed: 0, amountCollected: 0
  }))

  const sectionB = Object.entries(catMapB).map(([category, data]) => ({
    category, pickedUp: 0, newRegistrations: data.newRegs, manualsDistributed: data.manuals, amountCollected: data.amount
  }))

  return { sectionA, sectionB, totals }
}

// ── Offering Summary ────────────────────────────────────────────────────
export interface DeptOfferingSummary {
  departmentId: string
  departmentName: string
  worshipOffering: number
  registrationFees: number
  totalFinancial: number
}

export function extractOfferingSummary(
  reports: any[],
  departments: any[]
): DeptOfferingSummary[] {
  const deptMap: Record<string, { worship: number; regFees: number }> = {}

  reports.forEach(r => {
    const deptId = r.department_id
    if (!deptMap[deptId]) deptMap[deptId] = { worship: 0, regFees: 0 }

    const mData = r.metrics_data || {}
    const custom = mData.custom_schema || mData

    // Top-level offering (worship)
    const rawOffering = mData.offering ?? mData.offering_amount ?? mData.total_offering ?? mData.offering_collected ?? custom?.offering ?? custom?.total_offering ?? 0
    const offeringVal = Number(String(rawOffering).replace(/[^\d.]/g, '')) || 0
    deptMap[deptId].worship += offeringVal

    // Ushering section-level offerings
    const usheringSections = ['teachers_meeting', 'toddlers_section', 'junior_section', 'pre_teens_section', 'teenagers_section']
    usheringSections.forEach(sec => {
      const secData = custom?.[sec]
      if (Array.isArray(secData)) {
        secData.forEach((item: any) => {
          const sectionOffering = Number(item.offering) || 0
          deptMap[deptId].worship += sectionOffering
        })
      }
    })

    // Registration fees (amount_collected from walk-in registrations)
    const walkins = Array.isArray(custom?.walkin_registrations) ? custom.walkin_registrations
      : Array.isArray(mData.walkin_registrations) ? mData.walkin_registrations : []
    walkins.forEach((item: any) => {
      deptMap[deptId].regFees += Number(item.amount_collected) || 0
    })
  })

  const result: DeptOfferingSummary[] = []
  departments.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).forEach((dept: any) => {
    const data = deptMap[dept.id]
    if (data && (data.worship > 0 || data.regFees > 0)) {
      result.push({
        departmentId: dept.id,
        departmentName: dept.name,
        worshipOffering: data.worship,
        registrationFees: data.regFees,
        totalFinancial: data.worship + data.regFees,
      })
    }
  })

  return result
}

// ── Daily Narrative Challenges/Recommendations Extractor ────────────────
export interface DailyNarrativeChallenge {
  departmentName: string
  dayLabel: string
  text: string
}

export interface DailyNarrativeRecommendation {
  departmentName: string
  dayLabel: string
  text: string
}

export function extractDailyNarrativeChallenges(
  reports: any[],
  departments: any[],
  eventDays: any[]
): { challenges: DailyNarrativeChallenge[]; recommendations: DailyNarrativeRecommendation[] } {
  const challenges: DailyNarrativeChallenge[] = []
  const recommendations: DailyNarrativeRecommendation[] = []

  const dayMap: Record<string, number> = {}
  if (Array.isArray(eventDays)) {
    eventDays.forEach((ed: any) => { dayMap[ed.id] = ed.day_number })
  }

  reports.forEach(r => {
    const mData = r.metrics_data || {}
    const narrative = mData.daily_narrative || mData.custom_schema?.daily_narrative
    if (!narrative || typeof narrative !== 'object') return

    const dept = departments.find((d: any) => d.id === r.department_id)
    const deptName = dept?.name || 'Unknown Department'
    const dayNum = dayMap[r.event_day_id] || 0
    const dayLabel = dayNum > 0 ? `Day ${dayNum}` : 'Unknown Day'

    // Challenges
    const challText = narrative.challenges || ''
    if (challText.trim()) {
      challenges.push({ departmentName: deptName, dayLabel, text: challText.trim() })
    }

    // Solutions/Recommendations
    const solText = narrative.solutions || narrative.recommendations || ''
    if (solText.trim()) {
      recommendations.push({ departmentName: deptName, dayLabel, text: solText.trim() })
    }
  })

  return { challenges, recommendations }
}

// ── All Consolidated Challenges & Recommendations Extractor ─────────────
export interface ConsolidatedChallengeItem {
  id?: string
  departmentName: string
  departmentId: string
  source: string // e.g. 'End-of-Event Narrative', 'Day 1 Log'
  text: string
}

export interface ConsolidatedRecommendationItem {
  departmentName: string
  departmentId: string
  source: string
  text: string
  linkedChallengeId?: string
}

export function extractAllConsolidatedChallenges(
  reports: any[],
  narratives: any[],
  departments: any[],
  eventDays: any[]
): { challenges: ConsolidatedChallengeItem[]; recommendations: ConsolidatedRecommendationItem[] } {
  const challenges: ConsolidatedChallengeItem[] = []
  const recommendations: ConsolidatedRecommendationItem[] = []

  const dayMap: Record<string, number> = {}
  if (Array.isArray(eventDays)) {
    eventDays.forEach((ed: any) => { dayMap[ed.id] = ed.day_number })
  }

  // 1. Process End-of-Event and Daily Narratives from `department_narratives` table
  if (Array.isArray(narratives)) {
    narratives.forEach(n => {
      const dept = departments.find((d: any) => d.id === n.department_id)
      const deptName = dept?.name || 'Department'
      const deptId = n.department_id || ''

      // Structured challenges_json (End-of-event)
      if (Array.isArray(n.challenges_json)) {
        n.challenges_json.forEach((ch: any) => {
          if (ch && ch.text && ch.text.trim()) {
            challenges.push({
              id: ch.id || undefined,
              departmentName: deptName,
              departmentId: deptId,
              source: n.is_end_of_event ? 'End-of-Event' : 'Daily Narrative',
              text: ch.text.trim()
            })
          }
        })
      }

      // Legacy string challenge field
      if (n.challenges && typeof n.challenges === 'string' && n.challenges.trim()) {
        const exists = challenges.some(c => c.departmentId === deptId && c.text === n.challenges.trim())
        if (!exists) {
          challenges.push({
            departmentName: deptName,
            departmentId: deptId,
            source: n.is_end_of_event ? 'End-of-Event' : 'Daily Narrative',
            text: n.challenges.trim()
          })
        }
      }

      // Structured recommendations_json (End-of-event)
      if (Array.isArray(n.recommendations_json)) {
        n.recommendations_json.forEach((rec: any) => {
          if (rec && rec.text && rec.text.trim()) {
            recommendations.push({
              departmentName: deptName,
              departmentId: deptId,
              source: n.is_end_of_event ? 'End-of-Event' : 'Daily Narrative',
              text: rec.text.trim(),
              linkedChallengeId: rec.linked_challenge_id || undefined
            })
          }
        })
      }

      // Legacy string solutions field
      if (n.solutions && typeof n.solutions === 'string' && n.solutions.trim()) {
        const exists = recommendations.some(r => r.departmentId === deptId && r.text === n.solutions.trim())
        if (!exists) {
          recommendations.push({
            departmentName: deptName,
            departmentId: deptId,
            source: n.is_end_of_event ? 'End-of-Event' : 'Daily Narrative',
            text: n.solutions.trim()
          })
        }
      }
    })
  }

  // 2. Process Daily Narratives embedded inside `daily_reports` metrics_data
  if (Array.isArray(reports)) {
    reports.forEach((r, idx) => {
      const dept = departments.find((d: any) => d.id === r.department_id)
      const deptName = dept?.name || 'Department'
      const deptId = r.department_id || ''
      const dayNum = dayMap[r.event_day_id] || (idx + 1)
      const dayLabel = `Day ${dayNum}`

      const mData = r.metrics_data || {}
      const dNarrative = mData.daily_narrative || mData.custom_schema?.daily_narrative || {}

      // Daily Challenge
      const challText = dNarrative.challenges || mData.challenges || mData.custom_schema?.challenges || ''
      if (typeof challText === 'string' && challText.trim()) {
        const exists = challenges.some(c => c.departmentId === deptId && c.text === challText.trim())
        if (!exists) {
          challenges.push({
            departmentName: deptName,
            departmentId: deptId,
            source: `${dayLabel} Log`,
            text: challText.trim()
          })
        }
      }

      // Daily Recommendation / Solution
      const solText = dNarrative.recommendations || dNarrative.solutions || mData.solutions || ''
      if (typeof solText === 'string' && solText.trim()) {
        const exists = recommendations.some(rec => rec.departmentId === deptId && rec.text === solText.trim())
        if (!exists) {
          recommendations.push({
            departmentName: deptName,
            departmentId: deptId,
            source: `${dayLabel} Log`,
            text: solText.trim()
          })
        }
      }
    })
  }

  return { challenges, recommendations }
}

// ── Department Qualitative Narrative Logs Extractor ──────────────────────
export interface DailyQualitativeLog {
  dayLabel: string
  overview?: string
  achievements?: string
  challenges?: string
  recommendations?: string
  plansForTomorrow?: string
  feedback?: string
}

export function extractDepartmentQualitativeLogs(
  deptId: string,
  reports: any[],
  narratives: any[],
  eventDays: any[]
): DailyQualitativeLog[] {
  const logs: DailyQualitativeLog[] = []
  const dayMap: Record<string, number> = {}
  if (Array.isArray(eventDays)) {
    eventDays.forEach((ed: any) => { dayMap[ed.id] = ed.day_number })
  }

  const deptReports = reports.filter((r: any) => r.department_id === deptId)
  const sortedReports = [...deptReports].sort((a: any, b: any) => {
    const dayA = dayMap[a.event_day_id] || 0
    const dayB = dayMap[b.event_day_id] || 0
    return dayA - dayB
  })

  sortedReports.forEach((r, idx) => {
    const dayNum = dayMap[r.event_day_id] || (idx + 1)
    const dayLabel = `Day ${dayNum}`
    const mData = r.metrics_data || {}
    const dNarrative = mData.daily_narrative || mData.custom_schema?.daily_narrative || {}

    // Check matching department narrative for this report if any
    const deptNarrative = narratives.find((n: any) => n.daily_report_id === r.id)

    const overview = dNarrative.overview || deptNarrative?.overview || ''
    const achievements = dNarrative.achievements || deptNarrative?.key_achievements || ''
    const challenges = dNarrative.challenges || deptNarrative?.challenges || ''
    const recommendations = dNarrative.recommendations || dNarrative.solutions || deptNarrative?.solutions || ''
    const plansForTomorrow = dNarrative.plans_for_tomorrow || deptNarrative?.plans_for_tomorrow || ''
    const feedback = dNarrative.feedback || deptNarrative?.feedback || ''

    if (overview || achievements || challenges || recommendations || plansForTomorrow || feedback) {
      logs.push({
        dayLabel,
        overview: overview.trim() || undefined,
        achievements: achievements.trim() || undefined,
        challenges: challenges.trim() || undefined,
        recommendations: recommendations.trim() || undefined,
        plansForTomorrow: plansForTomorrow.trim() || undefined,
        feedback: feedback.trim() || undefined,
      })
    }
  })

  return logs
}
