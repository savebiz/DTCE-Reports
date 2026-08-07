import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  ImageRun
} from 'docx'
import {
  extractCustomMetricsSummary,
  extractUsheringV2Summary,
  extractRegistrationTwoChannelSummary,
  extractOfferingSummary,
  extractAllConsolidatedChallenges,
  extractDepartmentQualitativeLogs
} from '@/utils/customMetricsSummarizer'

// Colors
const NAVY = '1B3A6B'
const GOLD = 'C49A00'
const SLATE_DARK = '334155'
const SLATE_LIGHT = 'F1F5F9'
const GRAY_BORDER = 'E2E8F0'
const TEAL = '0D9488'

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatCurrency(val: number): string {
  return `₦${val.toLocaleString()}`
}

function parseOfferingAmount(rawVal: any): number {
  if (typeof rawVal === 'number') return rawVal
  if (typeof rawVal === 'string') {
    const num = Number(rawVal.replace(/[^\d.]/g, ''))
    return isNaN(num) ? 0 : num
  }
  return 0
}

export async function generateDTCEConventionDocx({
  event,
  departments,
  reports,
  narratives,
  eventDays,
  preEventTotals,
  logoBuffer
}: {
  event: any
  departments: any[]
  reports: any[]
  narratives: any[]
  eventDays?: any[]
  preEventTotals?: any[]
  logoBuffer?: Buffer
}): Promise<Buffer> {

  // Helper to create spacing
  const spacing = (before = 120, after = 120) => ({ before, after, line: 240 })

  // Helper for Section Headings
  const createHeading1 = (text: string) => {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 180 },
      keepNext: true,
      children: [
        new TextRun({
          text,
          color: NAVY,
          bold: true,
          font: 'Outfit'
        })
      ]
    })
  }

  const createHeading2 = (text: string) => {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      keepNext: true,
      children: [
        new TextRun({
          text,
          color: GOLD,
          bold: true,
          font: 'Outfit'
        })
      ]
    })
  }

  const createHeading3 = (text: string) => {
    return new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 180, after: 80 },
      keepNext: true,
      children: [
        new TextRun({
          text,
          color: TEAL,
          bold: true,
          font: 'Outfit',
          size: 20,
        })
      ]
    })
  }

  const createFreshnessLine = (text: string) => {
    return new Paragraph({
      spacing: spacing(40, 80),
      children: [
        new TextRun({
          text: `📊 Data freshness: ${text}`,
          italics: true,
          color: '64748B',
          size: 16,
          font: 'Outfit'
        })
      ]
    })
  }

  const createNarrativeProse = (text: string) => {
    return new Paragraph({
      spacing: spacing(60, 120),
      children: [
        new TextRun({
          text,
          size: 20,
          font: 'Outfit'
        })
      ]
    })
  }

  // Standard table borders
  const tableBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
    left: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
    right: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER }
  }

  // ── Build event_day_id → day_number mapping ──────────────────────────
  const dayMap: Record<string, number> = {}
  const sortedEventDays = (eventDays || []).sort((a: any, b: any) => (a.day_number || 0) - (b.day_number || 0))
  sortedEventDays.forEach((ed: any) => {
    dayMap[ed.id] = ed.day_number
  })
  const totalExpectedDays = sortedEventDays.length || 1

  // Sort departments alphabetically
  const sortedDepts = [...departments].sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // ── Header and Footer ────────────────────────────────────────────────
  const pageHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: 'RCCG JUNIOR CHURCH GLOBAL • DELEGATES REPORT SUMMARY',
            size: 16,
            color: '94A3B8',
            font: 'Outfit'
          })
        ]
      })
    ]
  })

  const pageFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'Page ',
            size: 18,
            color: '64748B',
            font: 'Outfit'
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: 18,
            color: '64748B',
            font: 'Outfit'
          })
        ]
      })
    ]
  })

  // ── Cover Page ───────────────────────────────────────────────────────
  const coverChildren: any[] = []

  if (logoBuffer) {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 720, after: 360 },
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: {
              width: 140,
              height: 140
            },
            type: "png"
          })
        ]
      })
    )
  }

  coverChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: 'THE REDEEMED CHRISTIAN CHURCH OF GOD',
          size: 24,
          bold: true,
          color: NAVY,
          font: 'Outfit'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 360 },
      children: [
        new TextRun({
          text: 'JUNIOR CHURCH GLOBAL SECRETARIAT',
          size: 18,
          bold: true,
          color: GOLD,
          font: 'Outfit'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1440, after: 120 },
      children: [
        new TextRun({
          text: event?.name || 'CONVENTION REPORT',
          size: 40,
          bold: true,
          color: NAVY,
          font: 'Outfit'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 1440 },
      children: [
        new TextRun({
          text: 'OFFICIAL DELEGATE AND DEPARTMENTS REPORT SUMMARY',
          size: 16,
          color: SLATE_DARK,
          font: 'Outfit'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 720, after: 120 },
      children: [
        new TextRun({
          text: `Dates: ${formatDate(event?.start_date)} to ${formatDate(event?.end_date)}`,
          size: 14,
          italics: true,
          color: '475569',
          font: 'Outfit'
        })
      ]
    })
  )

  const docSections: any[] = []

  // 1. Cover Page Section
  docSections.push({
    properties: {
      titlePage: true
    },
    children: coverChildren
  })

  // ══════════════════════════════════════════════════════════════════════
  // MAIN CONTENT
  // ══════════════════════════════════════════════════════════════════════
  const mainChildren: any[] = []

  // ── SECTION 1: Executive Summary ─────────────────────────────────────
  mainChildren.push(createHeading1('1. Executive Summary'))

  const deptsWithData = new Set(reports.map(r => r.department_id))
  const endOfEventNarratives = narratives.filter(n => n.is_end_of_event === true)
  const deptsWithNarratives = new Set(endOfEventNarratives.map(n => n.department_id))

  mainChildren.push(
    new Paragraph({
      spacing: spacing(120, 180),
      children: [
        new TextRun({
          text: `This consolidated report presents the administrative, attendance, and operational metrics of the Junior Church Global Secretariat during the ${event?.name || 'Annual Convention'}. It compiles metrics from all ${sortedDepts.length} departments tasked with delegate management, welfare, medical care, and logistics. Through diligent data collation and real-time offline-first form synchronization, the Secretariat maintained comprehensive reporting standards to ensure the spiritual and physical well-being of all attendees.`,
          size: 22,
          font: 'Outfit'
        })
      ]
    })
  )

  mainChildren.push(
    createFreshnessLine(
      `${deptsWithData.size} of ${sortedDepts.length} departments have submitted daily data. ` +
      `${deptsWithNarratives.size} of ${sortedDepts.length} departments have finalized end-of-event narratives.`
    )
  )

  // ── SECTION 2: General Report of Activities ──────────────────────────
  mainChildren.push(createHeading1('2. General Report of Activities'))

  // Build real day-by-day attendance aggregation
  const dayAgg: Record<number, { totalMorning: number; totalEvening: number; deptCount: number }> = {}
  reports.forEach(r => {
    const dayNum = dayMap[r.event_day_id] || 0
    if (dayNum === 0) return
    if (!dayAgg[dayNum]) dayAgg[dayNum] = { totalMorning: 0, totalEvening: 0, deptCount: 0 }
    dayAgg[dayNum].totalMorning += (Number(r.attendance_morning) || 0)
    dayAgg[dayNum].totalEvening += (Number(r.attendance_evening) || 0)
    dayAgg[dayNum].deptCount++
  })

  const realDaySummary = Object.entries(dayAgg)
    .map(([dayNum, agg]) => ({
      day: `Day ${dayNum}`,
      dayNum: Number(dayNum),
      totalMorning: agg.totalMorning,
      totalEvening: agg.totalEvening,
      deptCount: agg.deptCount,
    }))
    .sort((a, b) => a.dayNum - b.dayNum)

  if (realDaySummary.length > 0) {
    mainChildren.push(
      new Paragraph({ text: 'Consolidated Day-by-Day Attendance Summary (aggregated across all departments):', spacing: spacing(120, 120) })
    )

    const summaryHeaderRow = new TableRow({
      children: [
        new TableCell({ shading: { fill: NAVY }, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'Convention Day', color: 'FFFFFF', bold: true, size: 18, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'Total Morning Attendance', color: 'FFFFFF', bold: true, size: 18, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'Total Evening Attendance', color: 'FFFFFF', bold: true, size: 18, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'Depts Reporting', color: 'FFFFFF', bold: true, size: 18, font: 'Outfit' })] })] }),
      ]
    })

    const summaryRows = [summaryHeaderRow]
    realDaySummary.forEach((row, idx) => {
      const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
      summaryRows.push(
        new TableRow({
          children: [
            new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.day, size: 18, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.totalMorning.toLocaleString(), size: 18, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.totalEvening.toLocaleString(), size: 18, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: `${row.deptCount} of ${sortedDepts.length}`, size: 18, font: 'Outfit' })] })] }),
          ]
        })
      )
    })

    mainChildren.push(
      new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: summaryRows }),
      new Paragraph({ text: '', spacing: spacing(120, 120) })
    )

    const submittedDays = realDaySummary.length
    mainChildren.push(createFreshnessLine(`${submittedDays} of ${totalExpectedDays} convention days have at least one department submission.`))
  } else {
    mainChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'No daily attendance data has been submitted yet.', italics: true, color: '64748B', font: 'Outfit' })
        ]
      })
    )
  }

  mainChildren.push(new Paragraph({ text: '', spacing: spacing(240, 240) }))

  // ── SECTION 3: All Departmental Reports ──────────────────────────────
  mainChildren.push(createHeading1('3. Departmental Reports'))

  sortedDepts.forEach((dept) => {
    const deptName = dept.name || 'Department'
    const deptId = dept.id
    const deptNameLower = deptName.toLowerCase()

    mainChildren.push(createHeading2(deptName))

    // Find this department's data
    const deptReports = reports.filter(r => r.department_id === deptId)
    const deptNarrative = endOfEventNarratives.find(n => n.department_id === deptId)
    const submittedDays = deptReports.length

    // Data freshness
    mainChildren.push(createFreshnessLine(
      `${submittedDays} of ${totalExpectedDays} reporting days submitted` +
      (deptNarrative ? '. End-of-event narrative: Finalized.' : '. End-of-event narrative: Pending.')
    ))

    // ── End-of-Event Narrative Overview & Highlights ──
    if (deptNarrative) {
      if (deptNarrative.overview) {
        mainChildren.push(createNarrativeProse(deptNarrative.overview))
      }
      if (deptNarrative.highlights) {
        mainChildren.push(
          new Paragraph({
            spacing: spacing(60, 60),
            children: [
              new TextRun({ text: 'Key Highlights: ', bold: true, color: NAVY, font: 'Outfit', size: 20 }),
              new TextRun({ text: deptNarrative.highlights, size: 20, font: 'Outfit' })
            ]
          })
        )
      }
    } else if (submittedDays === 0) {
      mainChildren.push(
        new Paragraph({
          spacing: spacing(60, 120),
          children: [
            new TextRun({ text: 'No data submitted for this department.', italics: true, color: '64748B', font: 'Outfit' })
          ]
        })
      )
      return // Skip to next department
    }

    // ── Daily Qualitative Narrative Logs ──
    const dailyQualLogs = extractDepartmentQualitativeLogs(deptId, reports, narratives, eventDays || [])
    if (dailyQualLogs.length > 0) {
      mainChildren.push(createHeading3(`${deptName} — Daily Operational & Qualitative Logs`))
      dailyQualLogs.forEach(qLog => {
        mainChildren.push(
          new Paragraph({
            spacing: spacing(80, 40),
            children: [
              new TextRun({ text: `📌 ${qLog.dayLabel} Log:`, bold: true, color: NAVY, font: 'Outfit', size: 18 })
            ]
          })
        )
        if (qLog.overview) {
          mainChildren.push(
            new Paragraph({
              spacing: spacing(40, 40),
              children: [
                new TextRun({ text: 'Overview: ', bold: true, color: SLATE_DARK, font: 'Outfit' }),
                new TextRun({ text: qLog.overview, font: 'Outfit' })
              ]
            })
          )
        }
        if (qLog.achievements) {
          mainChildren.push(
            new Paragraph({
              spacing: spacing(40, 40),
              children: [
                new TextRun({ text: 'Activities & Achievements: ', bold: true, color: SLATE_DARK, font: 'Outfit' }),
                new TextRun({ text: qLog.achievements, font: 'Outfit' })
              ]
            })
          )
        }
        if (qLog.challenges) {
          mainChildren.push(
            new Paragraph({
              spacing: spacing(40, 40),
              children: [
                new TextRun({ text: 'Challenges Encountered: ', bold: true, color: GOLD, font: 'Outfit' }),
                new TextRun({ text: qLog.challenges, font: 'Outfit' })
              ]
            })
          )
        }
        if (qLog.recommendations) {
          mainChildren.push(
            new Paragraph({
              spacing: spacing(40, 40),
              children: [
                new TextRun({ text: 'Solutions & Recommendations: ', bold: true, color: TEAL, font: 'Outfit' }),
                new TextRun({ text: qLog.recommendations, font: 'Outfit' })
              ]
            })
          )
        }
        if (qLog.plansForTomorrow) {
          mainChildren.push(
            new Paragraph({
              spacing: spacing(40, 40),
              children: [
                new TextRun({ text: 'Plans / Follow-up: ', bold: true, color: SLATE_DARK, font: 'Outfit' }),
                new TextRun({ text: qLog.plansForTomorrow, font: 'Outfit' })
              ]
            })
          )
        }
      })
      mainChildren.push(new Paragraph({ text: '', spacing: spacing(60, 60) }))
    }

    if (deptReports.length === 0) return // No daily data to render

    // ── Day-by-Day Attendance Table ──
    mainChildren.push(new Paragraph({ spacing: spacing(120, 60), children: [new TextRun({ text: `${deptName} — Day-by-Day Attendance`, bold: true, size: 18, font: 'Outfit', color: NAVY })] }))

    const attHeaders = [
      new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Day', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
      new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Morning', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
      new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Evening', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
      new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Status', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
    ]

    const attRows = [new TableRow({ children: attHeaders })]

    // Sort by day_number via the dayMap
    const sortedReports = [...deptReports].sort((a, b) => {
      const dayA = dayMap[a.event_day_id] || 0
      const dayB = dayMap[b.event_day_id] || 0
      return dayA - dayB
    })

    sortedReports.forEach((r, rIdx) => {
      const dayNum = dayMap[r.event_day_id] || (rIdx + 1)
      const fill = rIdx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
      attRows.push(
        new TableRow({
          children: [
            new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: `Day ${dayNum}`, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: String(r.attendance_morning || 0), font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: String(r.attendance_evening || 0), font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: r.status || 'draft', font: 'Outfit' })] })] }),
          ]
        })
      )
    })

    mainChildren.push(
      new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: attRows }),
      new Paragraph({ text: '', spacing: spacing(80, 80) })
    )

    // ── Department-Specific Rendering ──

    const isRegistration = deptNameLower.includes('registration')
    const isUshering = deptNameLower.includes('ushering')

    if (isRegistration) {
      // ━━ Registration Two-Channel Tables ━━
      mainChildren.push(createHeading3('Registration — Two-Channel Analysis'))

      const regSummary = extractRegistrationTwoChannelSummary(deptReports)

      // Pre-event totals
      let preTotalsMap: Record<string, number> = {}
      if (preEventTotals && preEventTotals.length > 0) {
        preEventTotals.forEach((pt: any) => {
          if (pt.category && pt.total_online_registered !== undefined) {
            preTotalsMap[pt.category] = Number(pt.total_online_registered) || 0
          }
        })
      }
      // Fallback: check department's default_metrics_schema
      if (Object.keys(preTotalsMap).length === 0 && dept.default_metrics_schema?.pre_event_online_totals) {
        preTotalsMap = dept.default_metrics_schema.pre_event_online_totals
      }

      const grandPreReg = Object.values(preTotalsMap).reduce((s, v) => s + (Number(v) || 0), 0)

      // Section A: Online Manual Pickups
      mainChildren.push(new Paragraph({ spacing: spacing(80, 40), children: [new TextRun({ text: 'SECTION A — Online Manual Pickups', bold: true, size: 18, font: 'Outfit', color: TEAL })] }))

      if (regSummary.sectionA.length > 0) {
        const secAHeaderRow = new TableRow({
          children: [
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Category', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Pre-Registered', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Manuals Picked Up', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Pickup Rate', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })

        const secARows = [secAHeaderRow]
        regSummary.sectionA.forEach((item, idx) => {
          const catKey = item.category.toLowerCase().replace('-', '_').replace(' ', '_')
          const preReg = preTotalsMap[catKey] || preTotalsMap[item.category.toLowerCase()] || 0
          const rate = preReg > 0 ? Math.round((item.pickedUp / preReg) * 100) : 0
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          secARows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.category, font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: preReg.toLocaleString(), font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.pickedUp.toLocaleString(), font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: `${rate}%`, font: 'Outfit', bold: true })] })] }),
            ]
          }))
        })

        // Totals row
        const overallRate = grandPreReg > 0 ? Math.round((regSummary.totals.pickedUp / grandPreReg) * 100) : 0
        secARows.push(new TableRow({
          children: [
            new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: 'TOTAL', font: 'Outfit', bold: true, color: NAVY })] })] }),
            new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: grandPreReg.toLocaleString(), font: 'Outfit', bold: true })] })] }),
            new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: regSummary.totals.pickedUp.toLocaleString(), font: 'Outfit', bold: true })] })] }),
            new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: `${overallRate}%`, font: 'Outfit', bold: true, color: NAVY })] })] }),
          ]
        }))

        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: secARows }))
      }

      mainChildren.push(new Paragraph({ text: '', spacing: spacing(80, 40) }))

      // Section B: Walk-in Registrations
      mainChildren.push(new Paragraph({ spacing: spacing(80, 40), children: [new TextRun({ text: 'SECTION B — Offline / Walk-in Registrations', bold: true, size: 18, font: 'Outfit', color: TEAL })] }))

      if (regSummary.sectionB.length > 0) {
        const secBHeaderRow = new TableRow({
          children: [
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Category', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'New Registrations', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Manuals Distributed', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Fees Collected (₦)', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })

        const secBRows = [secBHeaderRow]
        regSummary.sectionB.forEach((item, idx) => {
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          secBRows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.category, font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.newRegistrations.toLocaleString(), font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.manualsDistributed.toLocaleString(), font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(item.amountCollected), font: 'Outfit', bold: true })] })] }),
            ]
          }))
        })

        // Totals row
        secBRows.push(new TableRow({
          children: [
            new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: 'TOTAL', font: 'Outfit', bold: true, color: NAVY })] })] }),
            new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: regSummary.totals.newRegistrations.toLocaleString(), font: 'Outfit', bold: true })] })] }),
            new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: regSummary.totals.manualsDistributed.toLocaleString(), font: 'Outfit', bold: true })] })] }),
            new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(regSummary.totals.amountCollected), font: 'Outfit', bold: true, color: NAVY })] })] }),
          ]
        }))

        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: secBRows }))
      }

      mainChildren.push(new Paragraph({ text: '', spacing: spacing(120, 120) }))

    } else if (isUshering) {
      // ━━ Ushering Schema-Versioned Five-Section Tables ━━

      // Separate v2 and legacy reports
      const v2Reports = deptReports.filter(r => {
        const mData = r.metrics_data || {}
        return (mData.schema_version === 2 || mData.custom_schema?.schema_version === 2)
      })
      const legacyReports = deptReports.filter(r => {
        const mData = r.metrics_data || {}
        return !(mData.schema_version === 2 || mData.custom_schema?.schema_version === 2)
      })

      // Render legacy reports using generic custom metrics (if any)
      if (legacyReports.length > 0) {
        mainChildren.push(createHeading3('Ushering — Legacy Data (Pre-Schema Update)'))
        mainChildren.push(createFreshnessLine(`${legacyReports.length} day(s) recorded under original schema.`))

        const legacyGroups = extractCustomMetricsSummary(legacyReports)
        if (legacyGroups.length > 0) {
          legacyGroups.forEach(group => {
            mainChildren.push(new Paragraph({ spacing: spacing(80, 40), children: [new TextRun({ text: group.groupTitle, bold: true, size: 18, font: 'Outfit', color: GOLD })] }))
            const hdrRow = new TableRow({
              children: [
                new TableCell({ shading: { fill: SLATE_DARK }, children: [new Paragraph({ children: [new TextRun({ text: 'Category / Metric', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
                new TableCell({ shading: { fill: SLATE_DARK }, children: [new Paragraph({ children: [new TextRun({ text: 'Metric Type', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
                new TableCell({ shading: { fill: SLATE_DARK }, children: [new Paragraph({ children: [new TextRun({ text: 'Total', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
              ]
            })
            const rows = [hdrRow]
            group.items.forEach((item, cIdx) => {
              const fill = cIdx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
              rows.push(new TableRow({
                children: [
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.categoryOrName, font: 'Outfit' })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.metricLabel, font: 'Outfit' })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.value.toLocaleString(), font: 'Outfit', bold: true })] })] }),
                ]
              }))
            })
            mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows }))
            mainChildren.push(new Paragraph({ text: '', spacing: spacing(60, 60) }))
          })
        }
      }

      // Render v2 reports as structured five-section tables
      if (v2Reports.length > 0) {
        mainChildren.push(createHeading3('Ushering — Five-Section Analysis'))
        mainChildren.push(createFreshnessLine(`${v2Reports.length} day(s) recorded under current schema (v2).`))

        const usheringSections = extractUsheringV2Summary(v2Reports)
        usheringSections.forEach(section => {
          mainChildren.push(new Paragraph({ spacing: spacing(100, 40), children: [new TextRun({ text: section.sectionTitle, bold: true, size: 18, font: 'Outfit', color: GOLD })] }))

          // Determine columns based on section type
          const isTeachersMeeting = section.sectionKey === 'teachers_meeting'

          let headerCells: TableCell[]
          if (isTeachersMeeting) {
            headerCells = [
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Title/Theme', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Preacher', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Male', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Female', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Total', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Offering (₦)', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
            ]
          } else {
            headerCells = [
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Event/Session', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Preacher/Guest', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Male', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Female', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Total', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Teachers (M)', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Teachers (F)', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Offering (₦)', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
            ]
          }

          const sectionRows = [new TableRow({ children: headerCells })]

          section.rows.forEach((row, rIdx) => {
            const fill = rIdx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
            if (isTeachersMeeting) {
              sectionRows.push(new TableRow({
                children: [
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.event || '—', font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.preacher || '—', font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.male.toLocaleString(), font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.female.toLocaleString(), font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.total.toLocaleString(), font: 'Outfit', size: 16, bold: true })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(row.offering), font: 'Outfit', size: 16 })] })] }),
                ]
              }))
            } else {
              sectionRows.push(new TableRow({
                children: [
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.event || '—', font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.preacher || '—', font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.male.toLocaleString(), font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.female.toLocaleString(), font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.total.toLocaleString(), font: 'Outfit', size: 16, bold: true })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.teachersMale.toLocaleString(), font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: row.teachersFemale.toLocaleString(), font: 'Outfit', size: 16 })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(row.offering), font: 'Outfit', size: 16 })] })] }),
                ]
              }))
            }
          })

          // Totals row
          if (isTeachersMeeting) {
            sectionRows.push(new TableRow({
              children: [
                new TableCell({ shading: { fill: SLATE_LIGHT }, columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: 'SECTION TOTALS', font: 'Outfit', bold: true, color: NAVY })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: section.totals.male.toLocaleString(), font: 'Outfit', bold: true })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: section.totals.female.toLocaleString(), font: 'Outfit', bold: true })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: section.totals.total.toLocaleString(), font: 'Outfit', bold: true, color: NAVY })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(section.totals.offering), font: 'Outfit', bold: true })] })] }),
              ]
            }))
          } else {
            sectionRows.push(new TableRow({
              children: [
                new TableCell({ shading: { fill: SLATE_LIGHT }, columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: 'SECTION TOTALS', font: 'Outfit', bold: true, color: NAVY })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: section.totals.male.toLocaleString(), font: 'Outfit', bold: true })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: section.totals.female.toLocaleString(), font: 'Outfit', bold: true })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: section.totals.total.toLocaleString(), font: 'Outfit', bold: true, color: NAVY })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: section.totals.teachersMale.toLocaleString(), font: 'Outfit', bold: true })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: section.totals.teachersFemale.toLocaleString(), font: 'Outfit', bold: true })] })] }),
                new TableCell({ shading: { fill: SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(section.totals.offering), font: 'Outfit', bold: true })] })] }),
              ]
            }))
          }

          mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: sectionRows }))
          mainChildren.push(new Paragraph({ text: '', spacing: spacing(80, 80) }))
        })
      }

    } else if (deptNameLower.includes('medical')) {
      // ━━ Medical Department Specialized Tables ━━
      const medSummary = extractMedicalSummary(deptReports)
      if (medSummary.demographics.length > 0) {
        mainChildren.push(createHeading3('Medical — Patient Demographics'))
        const demoHdr = new TableRow({
          children: [
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Category', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Gender', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Patient Count', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })
        const demoRows = [demoHdr]
        medSummary.demographics.forEach((d, idx) => {
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          demoRows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.category, font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.gender, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.count.toLocaleString(), font: 'Outfit', bold: true })] })] }),
            ]
          }))
        })
        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: demoRows }))
        mainChildren.push(new Paragraph({ text: '', spacing: spacing(60, 60) }))
      }

      if (medSummary.diagnoses.length > 0) {
        mainChildren.push(createHeading3('Medical — Diagnoses & Cases Treated'))
        const diagHdr = new TableRow({
          children: [
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Diagnosis / Symptom', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Cases Treated', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })
        const diagRows = [diagHdr]
        medSummary.diagnoses.forEach((d, idx) => {
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          diagRows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.diagnosis, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.count.toLocaleString(), font: 'Outfit', bold: true })] })] }),
            ]
          }))
        })
        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: diagRows }))
        mainChildren.push(new Paragraph({ text: '', spacing: spacing(80, 80) }))
      }

    } else if (deptNameLower.includes('welfare') || deptNameLower.includes('kitchen') || deptNameLower.includes('serving')) {
      // ━━ Welfare / Kitchen Specialized Table ━━
      const welfareRows = extractWelfareSummary(deptReports)
      if (welfareRows.length > 0) {
        mainChildren.push(createHeading3('Welfare (Kitchen / Serving) — Meal Allocations'))
        const welfHdr = new TableRow({
          children: [
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Meal Type', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Quantity Served', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Distribution Notes / Time', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })
        const welfRows = [welfHdr]
        welfareRows.forEach((w, idx) => {
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          welfRows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: w.mealType, font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: w.qtyServed.toLocaleString(), font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: w.notes, font: 'Outfit' })] })] }),
            ]
          }))
        })
        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: welfRows }))
        mainChildren.push(new Paragraph({ text: '', spacing: spacing(80, 80) }))
      }

    } else if (deptNameLower.includes('store') || deptNameLower.includes('stores')) {
      // ━━ Stores Inventory Specialized Tables ━━
      const storesData = extractStoresSummary(deptReports)
      if (storesData.durables.length > 0) {
        mainChildren.push(createHeading3('Stores — Durables Inventory Tracking'))
        const durHdr = new TableRow({
          children: [
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Item Name', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Department', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'In-Stock', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Issued', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Returned', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })
        const durRows = [durHdr]
        storesData.durables.forEach((d, idx) => {
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          durRows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.itemName, font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.department, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.qtyInStock.toLocaleString(), font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.qtyIssued.toLocaleString(), font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: d.qtyReturned.toLocaleString(), font: 'Outfit' })] })] }),
            ]
          }))
        })
        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: durRows }))
        mainChildren.push(new Paragraph({ text: '', spacing: spacing(60, 60) }))
      }

      if (storesData.consumables.length > 0) {
        mainChildren.push(createHeading3('Stores — Consumables Inventory Tracking'))
        const conHdr = new TableRow({
          children: [
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Item Name', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Department', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'In-Stock', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Issued', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })
        const conRows = [conHdr]
        storesData.consumables.forEach((c, idx) => {
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          conRows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: c.itemName, font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: c.department, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: c.qtyInStock.toLocaleString(), font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: c.qtyIssued.toLocaleString(), font: 'Outfit', bold: true })] })] }),
            ]
          }))
        })
        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: conRows }))
        mainChildren.push(new Paragraph({ text: '', spacing: spacing(80, 80) }))
      }

    } else if (deptNameLower.includes('safety') || deptNameLower.includes('sepu')) {
      // ━━ SEPU Safety & Security Incident Index Table ━━
      const sepuRows = extractSepuSummary(deptReports)
      if (sepuRows.length > 0) {
        mainChildren.push(createHeading3('SEPU — Daily Incident Index'))
        const sepuHdr = new TableRow({
          children: [
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Incident Description', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Action Taken', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Remarks / Follow-up', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })
        const sRows = [sepuHdr]
        sepuRows.forEach((s, idx) => {
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          sRows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: s.incidence, font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: s.actionTaken, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: s.remarks, font: 'Outfit' })] })] }),
            ]
          }))
        })
        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: sRows }))
        mainChildren.push(new Paragraph({ text: '', spacing: spacing(80, 80) }))
      }

    } else if (deptNameLower.includes('bible study') || deptNameLower.includes('holy land')) {
      // ━━ Bible Study Tribal Breakdown Table ━━
      const tribeRows = extractBibleStudySummary(deptReports)
      if (tribeRows.length > 0) {
        mainChildren.push(createHeading3('Bible Study — Tribal & Mode Attendance Breakdown'))
        const trHdr = new TableRow({
          children: [
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Tribe / Category', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Teachers (M)', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Teachers (F)', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Teenagers (M)', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Teenagers (F)', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Total', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })
        const tRows = [trHdr]
        tribeRows.forEach((tr, idx) => {
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          tRows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: tr.tribe, font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: tr.teachersMale.toLocaleString(), font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: tr.teachersFemale.toLocaleString(), font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: tr.teenagersMale.toLocaleString(), font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: tr.teenagersFemale.toLocaleString(), font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: tr.total.toLocaleString(), font: 'Outfit', bold: true })] })] }),
            ]
          }))
        })
        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: tRows }))
        mainChildren.push(new Paragraph({ text: '', spacing: spacing(80, 80) }))
      }

    } else if (deptNameLower.includes('programme') || deptNameLower.includes('program') || deptNameLower.includes('teens')) {
      // ━━ Teens Programs Session Table ━━
      const teenSessions = extractTeensProgramSummary(deptReports)
      if (teenSessions.length > 0) {
        mainChildren.push(createHeading3('Programs (Teens) — Service & Session Statistics'))
        const teenHdr = new TableRow({
          children: [
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Session Name', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Program Details', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Attendance', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
            new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Offering (₦)', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          ]
        })
        const teenRows = [teenHdr]
        teenSessions.forEach((t, idx) => {
          const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
          teenRows.push(new TableRow({
            children: [
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: t.sessionName, font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: t.details, font: 'Outfit' })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: t.attendance.toLocaleString(), font: 'Outfit', bold: true })] })] }),
              new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(t.offering), font: 'Outfit' })] })] }),
            ]
          }))
        })
        mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: teenRows }))
        mainChildren.push(new Paragraph({ text: '', spacing: spacing(80, 80) }))
      }

    } else {
      // ━━ Generic Department Custom Metrics ━━
      const customMetricsGroups = extractCustomMetricsSummary(deptReports)
      if (customMetricsGroups.length > 0) {
        mainChildren.push(new Paragraph({ spacing: spacing(100, 60), children: [new TextRun({ text: `${deptName} — Operational Metrics Summary`, bold: true, size: 16, color: GOLD, font: 'Outfit' })] }))

        const customHeaders = [
          new TableCell({ shading: { fill: SLATE_DARK }, children: [new Paragraph({ children: [new TextRun({ text: 'Category / Metric', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          new TableCell({ shading: { fill: SLATE_DARK }, children: [new Paragraph({ children: [new TextRun({ text: 'Metric Type', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
          new TableCell({ shading: { fill: SLATE_DARK }, children: [new Paragraph({ children: [new TextRun({ text: 'Cumulative Total', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
        ]

        const customRows = [new TableRow({ children: customHeaders })]

        let cIdx = 0
        customMetricsGroups.forEach(group => {
          group.items.forEach(item => {
            cIdx++
            const fill = cIdx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
            customRows.push(
              new TableRow({
                children: [
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: `${group.groupTitle} — ${item.categoryOrName}`, font: 'Outfit' })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.metricLabel, font: 'Outfit' })] })] }),
                  new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.value.toLocaleString(), bold: true, font: 'Outfit' })] })] }),
                ]
              })
            )
          })
        })

        mainChildren.push(
          new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: customRows }),
          new Paragraph({ text: '', spacing: spacing(120, 120) })
        )
      }
    }

    // Department offering
    const deptTotalOffering = deptReports.reduce((sum, r) => {
      const mData = r.metrics_data || {}
      const custom = mData.custom_schema || mData
      const rawVal = mData.offering ?? mData.offering_amount ?? mData.total_offering ?? mData.offering_collected ?? custom?.offering ?? custom?.total_offering ?? 0
      return sum + parseOfferingAmount(rawVal)
    }, 0)

    if (deptTotalOffering > 0 && !isRegistration) {
      mainChildren.push(
        new Paragraph({
          spacing: spacing(60, 120),
          children: [
            new TextRun({ text: 'Total Worship Offering: ', bold: true, color: NAVY, font: 'Outfit', size: 20 }),
            new TextRun({ text: formatCurrency(deptTotalOffering), bold: true, font: 'Outfit', size: 20 }),
          ]
        })
      )
    }

    mainChildren.push(new Paragraph({ text: '', spacing: spacing(180, 180) }))
  })

  // ── SECTION 4: Consolidated Challenges & Observations ────────────────
  mainChildren.push(createHeading1('4. Consolidated Challenges & Observations'))

  const consolidatedData = extractAllConsolidatedChallenges(reports, narratives, departments, eventDays || [])

  if (consolidatedData.challenges.length > 0) {
    // Group challenges by Department
    const challByDept: Record<string, typeof consolidatedData.challenges> = {}
    consolidatedData.challenges.forEach(c => {
      if (!challByDept[c.departmentName]) challByDept[c.departmentName] = []
      challByDept[c.departmentName].push(c)
    })

    Object.entries(challByDept).sort(([a], [b]) => a.localeCompare(b)).forEach(([deptName, challs]) => {
      mainChildren.push(new Paragraph({ spacing: spacing(120, 60), children: [new TextRun({ text: deptName, bold: true, color: SLATE_DARK, size: 18, font: 'Outfit' })] }))
      challs.forEach(c => {
        const badge = c.id ? `[${c.id}] ` : `[${c.source}] `
        mainChildren.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: spacing(40, 40),
            children: [
              new TextRun({ text: badge, bold: true, color: GOLD, font: 'Outfit' }),
              new TextRun({ text: c.text, font: 'Outfit' })
            ]
          })
        )
      })
    })
  } else {
    mainChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'No operational challenges logged by any department.', italics: true, color: '64748B', font: 'Outfit' })
        ]
      })
    )
  }

  mainChildren.push(createFreshnessLine(
    `Consolidated from ${consolidatedData.challenges.length} challenge entries across end-of-event narratives and daily logs.`
  ))

  // ── SECTION 5: Strategic Recommendations ─────────────────────────────
  mainChildren.push(createHeading1('5. Strategic Recommendations & Corrective Actions'))

  if (consolidatedData.recommendations.length > 0) {
    const recsByDept: Record<string, typeof consolidatedData.recommendations> = {}
    consolidatedData.recommendations.forEach(r => {
      if (!recsByDept[r.departmentName]) recsByDept[r.departmentName] = []
      recsByDept[r.departmentName].push(r)
    })

    Object.entries(recsByDept).sort(([a], [b]) => a.localeCompare(b)).forEach(([deptName, recs]) => {
      mainChildren.push(new Paragraph({ spacing: spacing(120, 60), children: [new TextRun({ text: deptName, bold: true, color: SLATE_DARK, size: 18, font: 'Outfit' })] }))
      recs.forEach(r => {
        const linkedText = r.linkedChallengeId ? ` (Linked to Challenge ${r.linkedChallengeId})` : ` [${r.source}]`
        mainChildren.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: spacing(40, 40),
            children: [
              new TextRun({ text: r.text, font: 'Outfit' }),
              new TextRun({ text: linkedText, italics: true, color: '64748B', size: 16, font: 'Outfit' })
            ]
          })
        )
      })
    })
  } else {
    mainChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'No strategic recommendations logged by any department.', italics: true, color: '64748B', font: 'Outfit' })
        ]
      })
    )
  }

  // ── SECTION 6: Income & Expenditure Summary ──────────────────────────
  mainChildren.push(createHeading1('6. Income & Expenditure Summary'))

  mainChildren.push(
    new Paragraph({
      spacing: spacing(60, 120),
      children: [
        new TextRun({
          text: 'The following financial summary consolidates worship offerings and registration fees collected across all departments during the convention. Registration administrative fees are reported separately from worship offerings for transparency.',
          size: 20,
          font: 'Outfit'
        })
      ]
    })
  )

  const offeringSummary = extractOfferingSummary(reports, sortedDepts)

  if (offeringSummary.length > 0) {
    const finHeaderRow = new TableRow({
      children: [
        new TableCell({ shading: { fill: NAVY }, width: { size: 3500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'Department', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'Worship Offering', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'Registration Fees', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'Total', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
      ]
    })

    const finRows = [finHeaderRow]
    let grandWorship = 0
    let grandRegFees = 0
    let grandTotal = 0

    offeringSummary.forEach((item, idx) => {
      const fill = idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT
      grandWorship += item.worshipOffering
      grandRegFees += item.registrationFees
      grandTotal += item.totalFinancial

      finRows.push(new TableRow({
        children: [
          new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.departmentName, font: 'Outfit', bold: true })] })] }),
          new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.worshipOffering > 0 ? formatCurrency(item.worshipOffering) : '—', font: 'Outfit' })] })] }),
          new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: item.registrationFees > 0 ? formatCurrency(item.registrationFees) : '—', font: 'Outfit' })] })] }),
          new TableCell({ shading: { fill }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(item.totalFinancial), font: 'Outfit', bold: true })] })] }),
        ]
      }))
    })

    // Grand totals row
    finRows.push(new TableRow({
      children: [
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'GRAND TOTAL', color: 'FFFFFF', bold: true, size: 18, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(grandWorship), color: 'FFFFFF', bold: true, size: 18, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(grandRegFees), color: 'FFFFFF', bold: true, size: 18, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(grandTotal), color: 'FFFFFF', bold: true, size: 18, font: 'Outfit' })] })] }),
      ]
    }))

    mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: finRows }))
  } else {
    mainChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'No financial data recorded for any department.', italics: true, color: '64748B', font: 'Outfit' })
        ]
      })
    )
  }

  mainChildren.push(new Paragraph({ text: '', spacing: spacing(240, 240) }))

  // ── SECTION 7: Appreciation & Signatures ─────────────────────────────
  mainChildren.push(createHeading1('7. Appreciation & Secretariat Approvals'))
  mainChildren.push(
    new Paragraph({
      spacing: spacing(120, 240),
      children: [
        new TextRun({
          text: 'We express our profound gratitude to the National Coordinators, HODs, and the Secretariat volunteers whose tireless execution kept convention reporting running seamlessly under challenging offline settings.',
          size: 20,
          font: 'Outfit'
        })
      ]
    }),
    new Paragraph({
      spacing: spacing(240, 60),
      children: [
        new TextRun({ text: 'Secretariat General Approval: ___________________________', bold: true, color: NAVY, font: 'Outfit' })
      ]
    }),
    new Paragraph({
      spacing: spacing(60, 240),
      children: [
        new TextRun({ text: 'National Competitions Representative: ____________________', bold: true, color: NAVY, font: 'Outfit' })
      ]
    })
  )

  // Append Main Content Section
  docSections.push({
    headers: {
      default: pageHeader
    },
    footers: {
      default: pageFooter
    },
    properties: {},
    children: mainChildren
  })

  const doc = new Document({
    sections: docSections
  })

  return await Packer.toBuffer(doc)
}
