/**
 * Secretariat Metrics Extractor
 * ─────────────────────────────
 * Compiles all platform data into a structured metrics object
 * for the Secretariat Strategic Board Report DOCX generator.
 */

// ── Shared Types ─────────────────────────────────────────────────────────

export interface DaySubmission {
  dayNumber: number
  date: string
  submitted: number
  expected: number
  rate: number
}

export interface DepartmentRanking {
  name: string
  submitted: number
  approved: number
  complianceRate: number
  missingDays: number[]
}

export interface RequisitionStatusBreakdown {
  pending: number
  approved: number
  declined: number
  inProgress: number
  partiallyFulfilled: number
  readyForCollection: number
  delivered: number
}

export interface FeedbackEntry {
  fullName: string
  departmentName: string
  overallSatisfaction: number
  dailyReportEase: number
  requisitionEase: number
  vsPaperProcess: string
  encounteredBugs: boolean
  bugsDescription: string | null
  mobileExperience: number | null
  npsScore: number
  topImprovement: string
  additionalComments: string | null
}

export interface EndOfEventNarrative {
  departmentName: string
  overview: string
  highlights: string
  challenges: string[]
  recommendations: string[]
}

export interface SecretariatMetrics {
  // Event metadata
  eventName: string
  eventStartDate: string
  eventEndDate: string
  totalDays: number
  totalDepartments: number
  reportGeneratedAt: string

  // Reporting Compliance
  totalExpectedSubmissions: number
  totalActualSubmissions: number
  overallComplianceRate: number
  submissionsByDay: DaySubmission[]
  statusBreakdown: { draft: number; submitted: number; reviewed: number; approved: number }
  departmentRankings: DepartmentRanking[]
  topPerformers: DepartmentRanking[]
  nonCompliantDepartments: DepartmentRanking[]

  // Store Requisitions
  totalRequisitions: number
  requisitionStatus: RequisitionStatusBreakdown
  fulfillmentRate: number
  topRequestingDepartments: Array<{ name: string; count: number; units: number }>
  totalItemsRequested: number
  totalItemsApproved: number

  // Inventory
  totalInventoryItems: number
  durableCount: number
  consumableCount: number
  lowStockItems: number
  totalTransactions: number
  transactionsByType: { restock: number; fulfillment: number; adjustment: number; return: number }

  // Notifications
  totalNotifications: number
  remindersSent: number
  digestsSent: number
  pushNotificationsSent: number

  // Users
  totalUsers: number
  usersByRole: { super_admin: number; coordinator: number; national_coordinator: number; hod: number; assistant: number }
  activeUsers: number
  passwordResetCompleted: number

  // Platform Feedback
  feedbackCount: number
  avgOverallSatisfaction: number
  avgDailyReportEase: number
  avgRequisitionEase: number
  avgMobileExperience: number
  npsScore: number
  npsPromoters: number
  npsPassives: number
  npsDetractors: number
  vsPaperBreakdown: { much_easier: number; easier: number; same: number; harder: number; much_harder: number }
  bugReportCount: number
  feedbackEntries: FeedbackEntry[]

  // Challenges
  totalChallenges: number
  resolvedChallenges: number
  openChallenges: number
  resolutionRate: number
  challengesByDepartment: Array<{ name: string; count: number }>

  // Offering
  totalOffering: number
  offeringByDay: Array<{ dayNumber: number; amount: number }>

  // End-of-Event Narratives
  endOfEventNarratives: EndOfEventNarrative[]
}

// ── Extraction Logic ─────────────────────────────────────────────────────

const parseNum = (v: any): number => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''))
    return isNaN(n) ? 0 : n
  }
  return 0
}

const parseItemsJson = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return []
}

export function compileSecretariatMetrics(data: {
  event: any
  departments: any[]
  eventDays: any[]
  reports: any[]
  narratives: any[]
  storeRequests: any[]
  inventoryItems: any[]
  inventoryTransactions: any[]
  profiles: any[]
  feedbacks: any[]
  challengeResolutions: any[]
  notificationLogs: any[]
}): SecretariatMetrics {
  const {
    event, departments, eventDays, reports, narratives,
    storeRequests, inventoryItems, inventoryTransactions,
    profiles, feedbacks, challengeResolutions, notificationLogs
  } = data

  const deptMap = new Map<string, string>()
  departments.forEach(d => deptMap.set(d.id, d.name))

  // ── 1. COMPLIANCE ──────────────────────────────────────────────────

  const totalDepts = departments.length
  const totalDays = eventDays.length || 6
  const totalExpected = totalDepts * totalDays

  const validStatuses = ['submitted', 'reviewed', 'approved']
  const submittedReports = reports.filter((r: any) => validStatuses.includes(r.status))
  const totalActual = submittedReports.length
  const overallRate = totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0

  // By day
  const submissionsByDay: DaySubmission[] = (eventDays.length > 0 ? eventDays : []).map((day: any) => {
    const dayReports = submittedReports.filter((r: any) => r.event_day_id === day.id)
    return {
      dayNumber: day.day_number,
      date: day.date || '',
      submitted: dayReports.length,
      expected: totalDepts,
      rate: totalDepts > 0 ? Math.round((dayReports.length / totalDepts) * 100) : 0
    }
  })

  // Status breakdown
  const statusBreakdown = { draft: 0, submitted: 0, reviewed: 0, approved: 0 }
  reports.forEach((r: any) => {
    if (r.status in statusBreakdown) statusBreakdown[r.status as keyof typeof statusBreakdown]++
  })

  // Department rankings
  const deptRankings: DepartmentRanking[] = departments.map((d: any) => {
    const deptReports = reports.filter((r: any) => r.department_id === d.id)
    const submitted = deptReports.filter((r: any) => validStatuses.includes(r.status)).length
    const approved = deptReports.filter((r: any) => r.status === 'approved').length
    const rate = totalDays > 0 ? Math.round((submitted / totalDays) * 100) : 0

    const submittedDayIds = new Set(deptReports.filter((r: any) => validStatuses.includes(r.status)).map((r: any) => r.event_day_id))
    const missing = eventDays
      .filter((day: any) => !submittedDayIds.has(day.id))
      .map((day: any) => day.day_number)

    return { name: d.name, submitted, approved, complianceRate: rate, missingDays: missing }
  }).sort((a, b) => b.complianceRate - a.complianceRate || b.submitted - a.submitted)

  const topPerformers = deptRankings.filter(d => d.complianceRate === 100)
  const nonCompliant = deptRankings.filter(d => d.complianceRate < 100)

  // ── 2. STORE REQUISITIONS ──────────────────────────────────────────

  const reqStatusMap: RequisitionStatusBreakdown = {
    pending: 0, approved: 0, declined: 0, inProgress: 0,
    partiallyFulfilled: 0, readyForCollection: 0, delivered: 0
  }
  const statusKeyMap: Record<string, keyof RequisitionStatusBreakdown> = {
    'pending_coordinator': 'pending',
    'approved': 'approved',
    'declined': 'declined',
    'in_progress': 'inProgress',
    'partially_fulfilled': 'partiallyFulfilled',
    'ready_for_collection': 'readyForCollection',
    'delivered': 'delivered'
  }
  storeRequests.forEach((r: any) => {
    const key = statusKeyMap[r.status]
    if (key) reqStatusMap[key]++
  })

  const totalReqs = storeRequests.length
  const deliveredReqs = reqStatusMap.delivered
  const fulfillmentRate = totalReqs > 0 ? Math.round((deliveredReqs / totalReqs) * 100) : 0

  // Top requesting departments
  const deptReqCount: Record<string, { count: number; units: number }> = {}
  storeRequests.forEach((r: any) => {
    const dName = deptMap.get(r.department_id) || 'Unknown'
    if (!deptReqCount[dName]) deptReqCount[dName] = { count: 0, units: 0 }
    deptReqCount[dName].count++
    const items = parseItemsJson(r.items_json)
    items.forEach((item: any) => {
      deptReqCount[dName].units += parseNum(item.quantity || item.requested_quantity || 0)
    })
  })
  const topRequestingDepts = Object.entries(deptReqCount)
    .map(([name, v]) => ({ name, count: v.count, units: v.units }))
    .sort((a, b) => b.count - a.count)

  // Items requested vs approved
  let totalItemsReq = 0
  let totalItemsApp = 0
  storeRequests.forEach((r: any) => {
    const items = parseItemsJson(r.items_json)
    items.forEach((item: any) => {
      totalItemsReq += parseNum(item.quantity || item.requested_quantity || 0)
      totalItemsApp += parseNum(item.approved_quantity || (r.status !== 'declined' ? (item.quantity || item.requested_quantity || 0) : 0))
    })
  })

  // ── 3. INVENTORY ───────────────────────────────────────────────────

  const durables = inventoryItems.filter((i: any) => i.category === 'durable').length
  const consumables = inventoryItems.filter((i: any) => i.category === 'consumable').length
  const lowStock = inventoryItems.filter((i: any) => (i.current_stock || 0) < (i.low_stock_threshold || 0)).length

  const txnTypes = { restock: 0, fulfillment: 0, adjustment: 0, return: 0 }
  const txnKeyMap: Record<string, keyof typeof txnTypes> = {
    'restock': 'restock',
    'fulfillment_deduction': 'fulfillment',
    'adjustment': 'adjustment',
    'return': 'return'
  }
  inventoryTransactions.forEach((t: any) => {
    const key = txnKeyMap[t.transaction_type]
    if (key) txnTypes[key]++
  })

  // ── 4. NOTIFICATIONS ──────────────────────────────────────────────

  let remindersSent = 0
  let digestsSent = 0
  let pushSent = 0
  notificationLogs.forEach((n: any) => {
    if (n.type === 'missing_report_reminder') remindersSent++
    if (n.type === 'secretariat_summary') digestsSent++
    if (n.push_sent === true) pushSent++
  })

  // ── 5. USERS ───────────────────────────────────────────────────────

  const roleCount = { super_admin: 0, coordinator: 0, national_coordinator: 0, hod: 0, assistant: 0 }
  let activeCount = 0
  let pwdResetDone = 0
  profiles.forEach((p: any) => {
    const r = p.role as keyof typeof roleCount
    if (r in roleCount) roleCount[r]++
    if (p.is_active !== false) activeCount++
    if (p.must_change_password === false) pwdResetDone++
  })

  // ── 6. PLATFORM FEEDBACK ──────────────────────────────────────────

  const fbCount = feedbacks.length
  let sumSat = 0, sumEase = 0, sumReq = 0, sumMobile = 0, mobileN = 0
  let promoters = 0, passives = 0, detractors = 0
  let bugCount = 0
  const vsPaper = { much_easier: 0, easier: 0, same: 0, harder: 0, much_harder: 0 }

  const fbEntries: FeedbackEntry[] = feedbacks.map((fb: any) => {
    sumSat += parseNum(fb.overall_satisfaction)
    sumEase += parseNum(fb.daily_report_ease)
    sumReq += parseNum(fb.requisition_ease)
    const mob = parseNum(fb.mobile_experience_rating)
    if (mob > 0) { sumMobile += mob; mobileN++ }

    const nps = parseNum(fb.nps_score)
    if (nps >= 9) promoters++
    else if (nps >= 7) passives++
    else detractors++

    if (fb.encountered_bugs) bugCount++

    const vpKey = (fb.vs_paper_process || 'same') as keyof typeof vsPaper
    if (vpKey in vsPaper) vsPaper[vpKey]++

    // Resolve profile details
    const prof = profiles.find((p: any) => p.id === fb.profile_id)
    const deptName = prof?.department_id ? (deptMap.get(prof.department_id) || 'Secretariat') : 'Secretariat / National'

    return {
      fullName: fb.profile?.full_name || prof?.full_name || 'HOD User',
      departmentName: fb.profile?.department_name || deptName,
      overallSatisfaction: parseNum(fb.overall_satisfaction),
      dailyReportEase: parseNum(fb.daily_report_ease),
      requisitionEase: parseNum(fb.requisition_ease),
      vsPaperProcess: fb.vs_paper_process || 'same',
      encounteredBugs: !!fb.encountered_bugs,
      bugsDescription: fb.bugs_description || null,
      mobileExperience: fb.mobile_experience_rating || null,
      npsScore: nps,
      topImprovement: fb.top_improvement || '',
      additionalComments: fb.additional_comments || null,
    }
  })

  const npsScore = fbCount > 0
    ? Math.round(((promoters / fbCount) - (detractors / fbCount)) * 100)
    : 0

  // ── 7. CHALLENGES ─────────────────────────────────────────────────

  // Extract from reports and narratives
  const challengeSet: Array<{ dept: string; text: string }> = []
  reports.forEach((r: any) => {
    const dn = r.metrics_data?.daily_narrative || {}
    const ch = dn.challenges || r.metrics_data?.custom_schema?.challenges || ''
    if (ch && String(ch).trim().length > 0) {
      challengeSet.push({ dept: deptMap.get(r.department_id) || 'Department', text: String(ch).trim() })
    }
  })
  narratives.forEach((n: any) => {
    if (n.challenges && String(n.challenges).trim().length > 0) {
      challengeSet.push({ dept: deptMap.get(n.department_id) || 'Department', text: String(n.challenges).trim() })
    }
    // Also from challenges_json
    if (Array.isArray(n.challenges_json)) {
      n.challenges_json.forEach((c: any) => {
        if (c.text && String(c.text).trim().length > 0) {
          challengeSet.push({ dept: deptMap.get(n.department_id) || 'Department', text: String(c.text).trim() })
        }
      })
    }
  })

  const resolved = challengeResolutions.filter((cr: any) => cr.resolution_status === 'resolved').length
  const totalChal = challengeSet.length
  const resRate = totalChal > 0 ? Math.round((resolved / totalChal) * 100) : 0

  // By department
  const chalByDept: Record<string, number> = {}
  challengeSet.forEach(c => {
    chalByDept[c.dept] = (chalByDept[c.dept] || 0) + 1
  })
  const challengesByDepartment = Object.entries(chalByDept)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // ── 8. OFFERING ───────────────────────────────────────────────────

  let totalOffering = 0
  const offeringByDayMap: Record<number, number> = {}

  reports.forEach((r: any) => {
    const mData = r.metrics_data || {}
    const rawVal = mData.offering ?? mData.offering_amount ?? mData.total_offering ??
      mData.offering_collected ?? mData.custom_schema?.offering ?? mData.custom_schema?.total_offering ?? 0
    const val = parseNum(rawVal)
    totalOffering += val

    const day = eventDays.find((d: any) => d.id === r.event_day_id)
    if (day) {
      offeringByDayMap[day.day_number] = (offeringByDayMap[day.day_number] || 0) + val
    }
  })

  const offeringByDay = Object.entries(offeringByDayMap)
    .map(([dn, amount]) => ({ dayNumber: parseInt(dn), amount }))
    .sort((a, b) => a.dayNumber - b.dayNumber)

  // ── 9. END-OF-EVENT NARRATIVES ─────────────────────────────────────

  const eoeNarrs: EndOfEventNarrative[] = narratives
    .filter((n: any) => n.is_end_of_event === true)
    .map((n: any) => ({
      departmentName: deptMap.get(n.department_id) || 'Department',
      overview: n.overview || '',
      highlights: n.highlights || '',
      challenges: Array.isArray(n.challenges_json) ? n.challenges_json.map((c: any) => c.text || '') : (n.challenges ? [n.challenges] : []),
      recommendations: Array.isArray(n.recommendations_json) ? n.recommendations_json.map((r: any) => r.text || '') : (n.solutions ? [n.solutions] : []),
    }))

  // ── ASSEMBLE ───────────────────────────────────────────────────────

  return {
    eventName: event?.name || 'RCCG DTCE 2026 Annual Convention',
    eventStartDate: event?.start_date || '2026-08-03',
    eventEndDate: event?.end_date || '2026-08-08',
    totalDays,
    totalDepartments: totalDepts,
    reportGeneratedAt: new Date().toISOString(),

    totalExpectedSubmissions: totalExpected,
    totalActualSubmissions: totalActual,
    overallComplianceRate: overallRate,
    submissionsByDay,
    statusBreakdown,
    departmentRankings: deptRankings,
    topPerformers,
    nonCompliantDepartments: nonCompliant,

    totalRequisitions: totalReqs,
    requisitionStatus: reqStatusMap,
    fulfillmentRate,
    topRequestingDepartments: topRequestingDepts,
    totalItemsRequested: totalItemsReq,
    totalItemsApproved: totalItemsApp,

    totalInventoryItems: inventoryItems.length,
    durableCount: durables,
    consumableCount: consumables,
    lowStockItems: lowStock,
    totalTransactions: inventoryTransactions.length,
    transactionsByType: txnTypes,

    totalNotifications: notificationLogs.length,
    remindersSent,
    digestsSent,
    pushNotificationsSent: pushSent,

    totalUsers: profiles.length,
    usersByRole: roleCount,
    activeUsers: activeCount,
    passwordResetCompleted: pwdResetDone,

    feedbackCount: fbCount,
    avgOverallSatisfaction: fbCount > 0 ? Math.round((sumSat / fbCount) * 10) / 10 : 0,
    avgDailyReportEase: fbCount > 0 ? Math.round((sumEase / fbCount) * 10) / 10 : 0,
    avgRequisitionEase: fbCount > 0 ? Math.round((sumReq / fbCount) * 10) / 10 : 0,
    avgMobileExperience: mobileN > 0 ? Math.round((sumMobile / mobileN) * 10) / 10 : 0,
    npsScore,
    npsPromoters: promoters,
    npsPassives: passives,
    npsDetractors: detractors,
    vsPaperBreakdown: vsPaper,
    bugReportCount: bugCount,
    feedbackEntries: fbEntries,

    totalChallenges: totalChal,
    resolvedChallenges: resolved,
    openChallenges: totalChal - resolved,
    resolutionRate: resRate,
    challengesByDepartment,

    totalOffering,
    offeringByDay,

    endOfEventNarratives: eoeNarrs,
  }
}
