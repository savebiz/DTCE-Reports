/**
 * Secretariat Strategic Board Report — DOCX Generator
 * ────────────────────────────────────────────────────
 * Generates a formal, branded Word document for presentation to the
 * Board / Management Team of RCCG DTCE Junior Church.
 *
 * Written in the voice of a senior institutional report writer.
 */

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, Header, Footer,
  PageNumber, ImageRun, PageBreak
} from 'docx'
import type { SecretariatMetrics, FeedbackEntry, DepartmentRanking } from './secretariatMetricsExtractor'

// ── Brand Palette ────────────────────────────────────────────────────────
const NAVY       = '1B3A6B'
const GOLD       = 'C49A00'
const SLATE_DARK = '334155'
const SLATE_MED  = '64748B'
const SLATE_LIGHT= 'F1F5F9'
const GRAY_BORDER= 'E2E8F0'
const WHITE      = 'FFFFFF'
const TEAL       = '0D9488'
const EMERALD    = '059669'
const RED_SOFT   = 'DC2626'

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return dateStr }
}

function formatCurrency(val: number): string {
  return `₦${val.toLocaleString()}`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const spacing = (before = 120, after = 120) => ({ before, after, line: 276 })

function heading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: spacing(level === HeadingLevel.HEADING_1 ? 360 : 240, 120),
    children: [new TextRun({ text, bold: true, font: 'Calibri', size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_2 ? 26 : 22, color: NAVY })]
  })
}

function subHeading(text: string) {
  return heading(text, HeadingLevel.HEADING_2)
}

function subSubHeading(text: string) {
  return heading(text, HeadingLevel.HEADING_3)
}

function bodyText(text: string, opts?: { bold?: boolean; italic?: boolean; color?: string }) {
  return new Paragraph({
    spacing: spacing(60, 80),
    children: [new TextRun({
      text,
      font: 'Calibri',
      size: 22,
      color: opts?.color || SLATE_DARK,
      bold: opts?.bold,
      italics: opts?.italic
    })]
  })
}

function richParagraph(runs: Array<{ text: string; bold?: boolean; italic?: boolean; color?: string }>) {
  return new Paragraph({
    spacing: spacing(60, 80),
    children: runs.map(r => new TextRun({
      text: r.text,
      font: 'Calibri',
      size: 22,
      color: r.color || SLATE_DARK,
      bold: r.bold,
      italics: r.italic
    }))
  })
}

function bulletPoint(text: string) {
  return new Paragraph({
    spacing: spacing(30, 30),
    indent: { left: 720 },
    children: [
      new TextRun({ text: '•  ', font: 'Calibri', size: 22, color: NAVY, bold: true }),
      new TextRun({ text, font: 'Calibri', size: 22, color: SLATE_DARK })
    ]
  })
}

function numberedItem(num: number, text: string) {
  return new Paragraph({
    spacing: spacing(40, 40),
    indent: { left: 720 },
    children: [
      new TextRun({ text: `${num}.  `, font: 'Calibri', size: 22, color: NAVY, bold: true }),
      new TextRun({ text, font: 'Calibri', size: 22, color: SLATE_DARK })
    ]
  })
}

const tableBorders = {
  top:              { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
  bottom:           { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
  left:             { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
  right:            { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
}

function headerCell(text: string, width?: number) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: { fill: NAVY },
    children: [new Paragraph({
      spacing: { before: 60, after: 60 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, font: 'Calibri', size: 18, color: WHITE })]
    })]
  })
}

function dataCell(text: string, opts?: { bold?: boolean; color?: string; align?: typeof AlignmentType[keyof typeof AlignmentType]; width?: number; shading?: string }) {
  return new TableCell({
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts?.shading ? { fill: opts.shading } : undefined,
    children: [new Paragraph({
      spacing: { before: 40, after: 40 },
      alignment: opts?.align || AlignmentType.LEFT,
      children: [new TextRun({
        text: text || '—',
        font: 'Calibri',
        size: 18,
        color: opts?.color || SLATE_DARK,
        bold: opts?.bold
      })]
    })]
  })
}

function vsPaperLabel(key: string): string {
  const map: Record<string, string> = {
    much_easier: 'Much Easier', easier: 'Easier', same: 'About the Same',
    harder: 'Harder', much_harder: 'Much Harder'
  }
  return map[key] || key
}

// ── Main Generator ───────────────────────────────────────────────────────

export async function generateSecretariatDocx(
  metrics: SecretariatMetrics,
  logoBuffer?: Buffer
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = []
  const m = metrics

  // ══════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ══════════════════════════════════════════════════════════════════════

  children.push(new Paragraph({ spacing: { before: 1200 }, children: [] }))

  if (logoBuffer) {
    try {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: spacing(200, 200),
        children: [new ImageRun({ data: logoBuffer, transformation: { width: 130, height: 130 }, type: 'png' })]
      }))
    } catch { /* logo not critical */ }
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(400, 80),
    children: [new TextRun({ text: 'THE REDEEMED CHRISTIAN CHURCH OF GOD', font: 'Calibri', size: 24, bold: true, color: NAVY, allCaps: true })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(40, 40),
    children: [new TextRun({ text: 'DIRECTORATE OF TEACHERS & CHILDREN EDUCATION (DTCE)', font: 'Calibri', size: 22, bold: true, color: NAVY })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(40, 200),
    children: [new TextRun({ text: 'JUNIOR CHURCH', font: 'Calibri', size: 22, bold: true, color: GOLD })]
  }))

  // Horizontal rule
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(100, 100),
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD } },
    children: [new TextRun({ text: ' ', size: 2 })]
  }))

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(300, 120),
    children: [new TextRun({ text: 'SECRETARIAT DEPARTMENT', font: 'Calibri', size: 30, bold: true, color: NAVY })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(60, 60),
    children: [new TextRun({ text: 'STRATEGIC REPORT ON THE DIGITAL TRANSFORMATION', font: 'Calibri', size: 24, bold: true, color: SLATE_DARK })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(40, 40),
    children: [new TextRun({ text: 'OF CONVENTION OPERATIONS REPORTING', font: 'Calibri', size: 24, bold: true, color: SLATE_DARK })]
  }))

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(200, 40),
    children: [new TextRun({ text: m.eventName.toUpperCase(), font: 'Calibri', size: 22, bold: true, color: GOLD })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(40, 40),
    children: [new TextRun({ text: `${formatDate(m.eventStartDate)} — ${formatDate(m.eventEndDate)}`, font: 'Calibri', size: 20, color: SLATE_MED })]
  }))

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(400, 40),
    children: [new TextRun({ text: `Report Generated: ${new Date(m.reportGeneratedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, font: 'Calibri', size: 18, color: SLATE_MED, italics: true })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(40, 40),
    children: [new TextRun({ text: 'Classification: Internal — Board / Management', font: 'Calibri', size: 18, color: SLATE_MED, italics: true })]
  }))

  // Page break after cover
  children.push(new Paragraph({ children: [new PageBreak()] }))

  // ══════════════════════════════════════════════════════════════════════
  // 1. EXECUTIVE SUMMARY
  // ══════════════════════════════════════════════════════════════════════

  children.push(heading('1. EXECUTIVE SUMMARY'))

  children.push(bodyText(
    `The Secretariat Department of the DTCE Junior Church hereby presents this strategic report on the design, deployment, and operational performance of the DTCE Reporting Platform during the ${m.eventName}, held from ${formatDate(m.eventStartDate)} to ${formatDate(m.eventEndDate)}.`
  ))

  children.push(bodyText(
    `The platform — a purpose-built digital reporting and convention operations management system — was developed to address the persistent operational inefficiencies that have characterised the manual report collation process in previous convention cycles. The system served ${m.totalDepartments} departments across ${m.totalDays} convention days, processing ${m.totalActualSubmissions} daily report submissions, ${m.totalRequisitions} store requisition tickets, and ${m.totalNotifications} automated notification dispatches.`
  ))

  children.push(bodyText('Key findings from this inaugural digital deployment include:'))

  children.push(bulletPoint(
    `An overall reporting compliance rate of ${m.overallComplianceRate}%, representing ${m.totalActualSubmissions} reports submitted out of ${m.totalExpectedSubmissions} expected across all departments and convention days.`
  ))
  children.push(bulletPoint(
    `A store requisition fulfilment rate of ${m.fulfillmentRate}%, with ${m.totalRequisitions} requisition tickets processed through a fully digital approval workflow encompassing submission, review, approval, fulfilment, and delivery confirmation.`
  ))

  if (m.feedbackCount > 0) {
    children.push(bulletPoint(
      `An average user satisfaction score of ${m.avgOverallSatisfaction}/5 from ${m.feedbackCount} HOD respondents, with ${m.vsPaperBreakdown.much_easier + m.vsPaperBreakdown.easier} out of ${m.feedbackCount} (${m.feedbackCount > 0 ? Math.round(((m.vsPaperBreakdown.much_easier + m.vsPaperBreakdown.easier) / m.feedbackCount) * 100) : 0}%) reporting the digital platform as easier or much easier than the previous paper-based process.`
    ))
    children.push(bulletPoint(
      `A Net Promoter Score (NPS) of ${m.npsScore >= 0 ? '+' : ''}${m.npsScore}, placing the platform in the ${m.npsScore >= 70 ? 'world-class' : m.npsScore >= 50 ? 'excellent' : m.npsScore >= 30 ? 'strong' : 'positive'} category of user endorsement.`
    ))
  }

  children.push(bodyText(
    'This report provides a comprehensive analysis of platform performance, departmental compliance data, stakeholder feedback, challenges encountered, and strategic recommendations for future convention cycles.'
  ))

  // ══════════════════════════════════════════════════════════════════════
  // 2. BACKGROUND & MANDATE
  // ══════════════════════════════════════════════════════════════════════

  children.push(new Paragraph({ children: [new PageBreak()] }))
  children.push(heading('2. BACKGROUND & INSTITUTIONAL MANDATE'))

  children.push(bodyText(
    'For successive convention cycles, the Secretariat Department has been charged with the collation, verification, and compilation of operational reports from all participating departments of the DTCE Junior Church. This function is foundational to institutional accountability, evidence-based decision-making, and the preparation of the annual convention report presented to the Board of Trustees and the National Leadership.'
  ))

  children.push(bodyText(
    'Historically, this mandate has been discharged through an entirely manual process characterised by the following operational challenges:'
  ))

  children.push(bulletPoint('Departments submitted daily reports via paper forms, WhatsApp messages, and verbal briefings, resulting in data inconsistency, lost records, and duplication of effort.'))
  children.push(bulletPoint('Secretariat personnel were required to manually transcribe all departmental data into consolidated spreadsheets — a process that routinely delayed the final convention report by one to three weeks post-event.'))
  children.push(bulletPoint('No standardised reporting template existed across departments, with each unit employing different formats and metrics, rendering cross-departmental aggregation exceedingly difficult.'))
  children.push(bulletPoint('No mechanism existed for real-time compliance tracking, meaning missing reports were typically discovered only during the final collation exercise, long after corrective action could be taken.'))
  children.push(bulletPoint('Store requisitions were processed via paper request forms with no status tracking, approval workflow, or inventory visibility, leading to over-ordering, stockouts, and unaccounted material distribution.'))
  children.push(bulletPoint('No structured system existed for tracking challenges across departments, year-over-year issue recurrence, or post-convention feedback from departmental leadership.'))

  children.push(bodyText(
    'In recognition of these persistent and well-documented operational challenges, the Secretariat Department leadership commissioned the development of a bespoke digital platform to modernise the convention reporting workflow. The resulting system — the DTCE Reporting Platform — was designed, developed, and deployed ahead of the 2026 Annual Convention, achieving full operational readiness prior to the commencement of proceedings.'
  ))

  // ══════════════════════════════════════════════════════════════════════
  // 3. PLATFORM OVERVIEW
  // ══════════════════════════════════════════════════════════════════════

  children.push(heading('3. PLATFORM OVERVIEW'))

  children.push(bodyText(
    `The DTCE Reporting Platform is a web-based, mobile-responsive Progressive Web Application (PWA) accessible from any device with an internet connection. The platform implements a five-tier role-based access control system serving ${m.totalUsers} registered users across ${m.totalDepartments} departments.`
  ))

  // User roles table
  children.push(subSubHeading('3.1 User Roles & Access Control'))

  const roleRows = [
    new TableRow({ children: [headerCell('Role', 2400), headerCell('Access Level', 4200), headerCell('Users', 1400)] }),
    new TableRow({ children: [dataCell('Super Admin', { bold: true }), dataCell('Full platform access: all departments, reports, user management, report generation, store requisition approval'), dataCell(String(m.usersByRole.super_admin), { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [dataCell('Coordinator', { bold: true }), dataCell('Convention operations coordination with full oversight'), dataCell(String(m.usersByRole.coordinator), { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [dataCell('National Coordinator', { bold: true }), dataCell('Executive oversight dashboard with read access across all departments'), dataCell(String(m.usersByRole.national_coordinator), { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [dataCell('Head of Department', { bold: true }), dataCell('Submit daily reports, request store materials, view own department data'), dataCell(String(m.usersByRole.hod), { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [dataCell('Assistant', { bold: true }), dataCell('Delegated HOD functions — submit reports and handle assigned requisitions'), dataCell(String(m.usersByRole.assistant), { align: AlignmentType.CENTER })] }),
  ]
  children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: roleRows }))

  children.push(subSubHeading('3.2 Core Platform Capabilities'))

  const capabilities = [
    'Real-time daily report submission with department-specific dynamic forms (Medical, Ushering, Registration, Welfare, ICT, Sports, and generic schemas)',
    'Secretariat Command Centre with live compliance matrix, KPI dashboard, and cross-departmental challenge aggregation',
    'End-to-end digital store requisition workflow with 7-stage lifecycle tracking (submission → approval → fulfilment → delivery)',
    'Centralised inventory management with stock level monitoring, low-stock alerts, and transaction audit trail',
    'Three-channel notification engine (in-app bell, Web Push, email) with automated missing-report reminders',
    'One-click executive Word document report generation with branded formatting',
    'Year-over-Year carry-over issue tracking using keyword-matching algorithms',
    'Post-convention structured feedback collection with NPS scoring and satisfaction analytics',
    'Offline-capable Progressive Web App (PWA) with queued submission and auto-sync',
    'Comprehensive security with role-based route guards, forced password reset, audit logging, and report version history',
  ]
  capabilities.forEach(c => children.push(bulletPoint(c)))

  // ══════════════════════════════════════════════════════════════════════
  // 4. CONVENTION OPERATIONS PERFORMANCE
  // ══════════════════════════════════════════════════════════════════════

  children.push(new Paragraph({ children: [new PageBreak()] }))
  children.push(heading('4. CONVENTION OPERATIONS PERFORMANCE'))

  // 4.1 Reporting Compliance
  children.push(subSubHeading('4.1 Reporting Compliance Analysis'))

  children.push(richParagraph([
    { text: 'Across the ', },
    { text: `${m.totalDays}-day convention period`, bold: true },
    { text: `, ${m.totalDepartments} departments were expected to submit daily operational reports, yielding a total expectation of ` },
    { text: `${m.totalExpectedSubmissions} report submissions`, bold: true },
    { text: `. Of this number, ` },
    { text: `${m.totalActualSubmissions} reports were submitted`, bold: true, color: m.overallComplianceRate >= 80 ? EMERALD : RED_SOFT },
    { text: `, representing an overall compliance rate of ` },
    { text: `${m.overallComplianceRate}%`, bold: true, color: m.overallComplianceRate >= 80 ? EMERALD : RED_SOFT },
    { text: '.' },
  ]))

  // Daily breakdown table
  if (m.submissionsByDay.length > 0) {
    const dayRows = [
      new TableRow({ children: [headerCell('Convention Day'), headerCell('Date'), headerCell('Reports Submitted'), headerCell('Expected'), headerCell('Compliance Rate')] }),
      ...m.submissionsByDay.map(d => new TableRow({
        children: [
          dataCell(`Day ${d.dayNumber}`, { bold: true, align: AlignmentType.CENTER }),
          dataCell(formatDate(d.date), { align: AlignmentType.CENTER }),
          dataCell(String(d.submitted), { align: AlignmentType.CENTER, bold: true }),
          dataCell(String(d.expected), { align: AlignmentType.CENTER }),
          dataCell(`${d.rate}%`, { align: AlignmentType.CENTER, bold: true, color: d.rate >= 80 ? EMERALD : d.rate >= 50 ? GOLD : RED_SOFT }),
        ]
      })),
      // Total row
      new TableRow({
        children: [
          dataCell('TOTAL', { bold: true, shading: SLATE_LIGHT }),
          dataCell('', { shading: SLATE_LIGHT }),
          dataCell(String(m.totalActualSubmissions), { bold: true, align: AlignmentType.CENTER, shading: SLATE_LIGHT }),
          dataCell(String(m.totalExpectedSubmissions), { align: AlignmentType.CENTER, shading: SLATE_LIGHT }),
          dataCell(`${m.overallComplianceRate}%`, { bold: true, align: AlignmentType.CENTER, shading: SLATE_LIGHT, color: m.overallComplianceRate >= 80 ? EMERALD : RED_SOFT }),
        ]
      })
    ]
    children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: dayRows }))
  }

  // 4.2 Report Status Distribution
  children.push(subSubHeading('4.2 Report Quality Assurance Pipeline'))

  children.push(bodyText(
    'Each submitted report passes through a structured quality assurance pipeline managed by the Secretariat. The following table summarises the current disposition of all reports:'
  ))

  const statusRows = [
    new TableRow({ children: [headerCell('Status', 3000), headerCell('Count', 2000), headerCell('Proportion', 3000)] }),
    ...[
      { label: 'Draft (Started, Not Submitted)', count: m.statusBreakdown.draft },
      { label: 'Submitted (Awaiting Review)', count: m.statusBreakdown.submitted },
      { label: 'Reviewed (Under Examination)', count: m.statusBreakdown.reviewed },
      { label: 'Approved (Accepted)', count: m.statusBreakdown.approved },
    ].map(s => {
      const total = m.statusBreakdown.draft + m.statusBreakdown.submitted + m.statusBreakdown.reviewed + m.statusBreakdown.approved
      return new TableRow({
        children: [
          dataCell(s.label, { bold: true }),
          dataCell(String(s.count), { align: AlignmentType.CENTER, bold: true }),
          dataCell(total > 0 ? `${Math.round((s.count / total) * 100)}%` : '—', { align: AlignmentType.CENTER }),
        ]
      })
    })
  ]
  children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: statusRows }))

  // 4.3 Department Performance Rankings
  children.push(subSubHeading('4.3 Department Performance Rankings'))

  if (m.topPerformers.length > 0) {
    children.push(richParagraph([
      { text: `${m.topPerformers.length} department${m.topPerformers.length > 1 ? 's' : ''}`, bold: true, color: EMERALD },
      { text: ` achieved a perfect 100% compliance rate, submitting reports for all ${m.totalDays} convention days. ` },
      { text: m.nonCompliantDepartments.length > 0
        ? `${m.nonCompliantDepartments.length} department${m.nonCompliantDepartments.length > 1 ? 's' : ''} recorded incomplete submissions.`
        : 'All departments achieved full compliance.'
      }
    ]))
  }

  // Top 15 departments table
  const rankRows = [
    new TableRow({ children: [headerCell('Rank'), headerCell('Department'), headerCell('Reports Submitted'), headerCell('Approved'), headerCell('Compliance')] }),
    ...m.departmentRankings.slice(0, 20).map((d, i) => new TableRow({
      children: [
        dataCell(String(i + 1), { align: AlignmentType.CENTER, bold: true }),
        dataCell(d.name, { bold: true }),
        dataCell(`${d.submitted} / ${m.totalDays}`, { align: AlignmentType.CENTER }),
        dataCell(String(d.approved), { align: AlignmentType.CENTER }),
        dataCell(`${d.complianceRate}%`, { align: AlignmentType.CENTER, bold: true, color: d.complianceRate === 100 ? EMERALD : d.complianceRate >= 50 ? GOLD : RED_SOFT }),
      ]
    }))
  ]
  children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: rankRows }))

  if (m.departmentRankings.length > 20) {
    children.push(bodyText(`Note: ${m.departmentRankings.length - 20} additional departments omitted for brevity. Full department listing available upon request.`, { italic: true, color: SLATE_MED }))
  }

  // ══════════════════════════════════════════════════════════════════════
  // 5. STORE REQUISITIONS & MATERIALS MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════

  children.push(new Paragraph({ children: [new PageBreak()] }))
  children.push(heading('5. STORE REQUISITIONS & MATERIALS MANAGEMENT'))

  children.push(bodyText(
    `The platform introduced a fully digital store requisition workflow, replacing the previous paper-based request system. A total of ${m.totalRequisitions} requisition tickets were processed during the convention period, encompassing ${m.totalItemsRequested} individual item units requested across all departments.`
  ))

  // KPI summary table
  const reqKpiRows = [
    new TableRow({ children: [headerCell('Key Performance Indicator', 5000), headerCell('Value', 3000)] }),
    new TableRow({ children: [dataCell('Total Requisitions Submitted', { bold: true }), dataCell(String(m.totalRequisitions), { align: AlignmentType.CENTER, bold: true })] }),
    new TableRow({ children: [dataCell('Requisitions Delivered (Fulfilled)', { bold: true }), dataCell(String(m.requisitionStatus.delivered), { align: AlignmentType.CENTER, bold: true, color: EMERALD })] }),
    new TableRow({ children: [dataCell('Requisitions Approved (In Process)', { bold: true }), dataCell(String(m.requisitionStatus.approved + m.requisitionStatus.inProgress), { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [dataCell('Requisitions Declined', { bold: true }), dataCell(String(m.requisitionStatus.declined), { align: AlignmentType.CENTER, color: RED_SOFT })] }),
    new TableRow({ children: [dataCell('Fulfilment Rate', { bold: true }), dataCell(`${m.fulfillmentRate}%`, { align: AlignmentType.CENTER, bold: true, color: m.fulfillmentRate >= 70 ? EMERALD : GOLD })] }),
    new TableRow({ children: [dataCell('Total Item Units Requested', { bold: true }), dataCell(String(m.totalItemsRequested), { align: AlignmentType.CENTER })] }),
    new TableRow({ children: [dataCell('Total Item Units Approved', { bold: true }), dataCell(String(m.totalItemsApproved), { align: AlignmentType.CENTER })] }),
  ]
  children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: reqKpiRows }))

  // Top requesting departments
  if (m.topRequestingDepartments.length > 0) {
    children.push(subSubHeading('5.1 Department Demand Distribution'))

    const demandRows = [
      new TableRow({ children: [headerCell('Rank'), headerCell('Department'), headerCell('Requisitions'), headerCell('Units Requested')] }),
      ...m.topRequestingDepartments.slice(0, 15).map((d, i) => new TableRow({
        children: [
          dataCell(String(i + 1), { align: AlignmentType.CENTER }),
          dataCell(d.name, { bold: true }),
          dataCell(String(d.count), { align: AlignmentType.CENTER, bold: true }),
          dataCell(String(d.units), { align: AlignmentType.CENTER }),
        ]
      }))
    ]
    children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: demandRows }))
  }

  // Inventory summary
  if (m.totalInventoryItems > 0) {
    children.push(subSubHeading('5.2 Inventory Position Summary'))

    const invRows = [
      new TableRow({ children: [headerCell('Indicator', 5000), headerCell('Value', 3000)] }),
      new TableRow({ children: [dataCell('Total Items Catalogued', { bold: true }), dataCell(String(m.totalInventoryItems), { align: AlignmentType.CENTER, bold: true })] }),
      new TableRow({ children: [dataCell('Durable Equipment Items', { bold: true }), dataCell(String(m.durableCount), { align: AlignmentType.CENTER })] }),
      new TableRow({ children: [dataCell('Consumable Items', { bold: true }), dataCell(String(m.consumableCount), { align: AlignmentType.CENTER })] }),
      new TableRow({ children: [dataCell('Items Below Low-Stock Threshold', { bold: true }), dataCell(String(m.lowStockItems), { align: AlignmentType.CENTER, color: m.lowStockItems > 0 ? RED_SOFT : EMERALD })] }),
      new TableRow({ children: [dataCell('Total Stock Transactions Recorded', { bold: true }), dataCell(String(m.totalTransactions), { align: AlignmentType.CENTER })] }),
      new TableRow({ children: [dataCell('    — Restocks', {}), dataCell(String(m.transactionsByType.restock), { align: AlignmentType.CENTER })] }),
      new TableRow({ children: [dataCell('    — Fulfilment Deductions', {}), dataCell(String(m.transactionsByType.fulfillment), { align: AlignmentType.CENTER })] }),
      new TableRow({ children: [dataCell('    — Adjustments', {}), dataCell(String(m.transactionsByType.adjustment), { align: AlignmentType.CENTER })] }),
      new TableRow({ children: [dataCell('    — Returns Processed', {}), dataCell(String(m.transactionsByType.return), { align: AlignmentType.CENTER })] }),
    ]
    children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: invRows }))
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6. STAKEHOLDER FEEDBACK & USER SATISFACTION
  // ══════════════════════════════════════════════════════════════════════

  children.push(new Paragraph({ children: [new PageBreak()] }))
  children.push(heading('6. STAKEHOLDER FEEDBACK & USER SATISFACTION'))

  if (m.feedbackCount === 0) {
    children.push(bodyText(
      'No structured platform feedback submissions have been recorded at the time of this report generation. It is recommended that the feedback collection exercise be completed before the final version of this report is issued.'
    ))
  } else {
    children.push(bodyText(
      `Following the conclusion of the convention, a structured feedback survey was administered to all HODs and departmental personnel who utilised the platform. A total of ${m.feedbackCount} responses were received. The findings are presented below.`
    ))

    // 6.1 Satisfaction Scores
    children.push(subSubHeading('6.1 Satisfaction Scores Summary'))

    const satRows = [
      new TableRow({ children: [headerCell('Metric', 5000), headerCell('Average Score', 3000)] }),
      new TableRow({ children: [dataCell('Overall Platform Satisfaction', { bold: true }), dataCell(`${m.avgOverallSatisfaction} / 5`, { align: AlignmentType.CENTER, bold: true, color: m.avgOverallSatisfaction >= 4 ? EMERALD : GOLD })] }),
      new TableRow({ children: [dataCell('Ease of Daily Report Submission', { bold: true }), dataCell(`${m.avgDailyReportEase} / 5`, { align: AlignmentType.CENTER, bold: true, color: m.avgDailyReportEase >= 4 ? EMERALD : GOLD })] }),
      new TableRow({ children: [dataCell('Ease of Store Requisition Process', { bold: true }), dataCell(`${m.avgRequisitionEase} / 5`, { align: AlignmentType.CENTER, bold: true, color: m.avgRequisitionEase >= 4 ? EMERALD : GOLD })] }),
      new TableRow({ children: [dataCell('Mobile Device Experience', { bold: true }), dataCell(`${m.avgMobileExperience} / 5`, { align: AlignmentType.CENTER, bold: true, color: m.avgMobileExperience >= 4 ? EMERALD : GOLD })] }),
    ]
    children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: satRows }))

    // 6.2 NPS Analysis
    children.push(subSubHeading('6.2 Net Promoter Score (NPS) Analysis'))

    children.push(richParagraph([
      { text: 'The Net Promoter Score (NPS) is a globally recognised metric for measuring user loyalty and satisfaction. Respondents rate their likelihood of recommending the platform on a scale of 0–10. Scores of 9–10 are classified as ' },
      { text: 'Promoters', bold: true, color: EMERALD },
      { text: ', 7–8 as ' },
      { text: 'Passives', bold: true, color: GOLD },
      { text: ', and 0–6 as ' },
      { text: 'Detractors', bold: true, color: RED_SOFT },
      { text: '.' },
    ]))

    const npsRows = [
      new TableRow({ children: [headerCell('Category', 3000), headerCell('Count', 2000), headerCell('Proportion', 2000), headerCell('NPS Score', 2000)] }),
      new TableRow({ children: [dataCell('Promoters (9–10)', { bold: true, color: EMERALD }), dataCell(String(m.npsPromoters), { align: AlignmentType.CENTER }), dataCell(`${m.feedbackCount > 0 ? Math.round((m.npsPromoters / m.feedbackCount) * 100) : 0}%`, { align: AlignmentType.CENTER }), dataCell('', {})] }),
      new TableRow({ children: [dataCell('Passives (7–8)', { bold: true, color: GOLD }), dataCell(String(m.npsPassives), { align: AlignmentType.CENTER }), dataCell(`${m.feedbackCount > 0 ? Math.round((m.npsPassives / m.feedbackCount) * 100) : 0}%`, { align: AlignmentType.CENTER }), dataCell('', {})] }),
      new TableRow({ children: [dataCell('Detractors (0–6)', { bold: true, color: RED_SOFT }), dataCell(String(m.npsDetractors), { align: AlignmentType.CENTER }), dataCell(`${m.feedbackCount > 0 ? Math.round((m.npsDetractors / m.feedbackCount) * 100) : 0}%`, { align: AlignmentType.CENTER }), dataCell('', {})] }),
      new TableRow({ children: [dataCell('NET PROMOTER SCORE', { bold: true, shading: SLATE_LIGHT }), dataCell('', { shading: SLATE_LIGHT }), dataCell('', { shading: SLATE_LIGHT }), dataCell(`${m.npsScore >= 0 ? '+' : ''}${m.npsScore}`, { align: AlignmentType.CENTER, bold: true, shading: SLATE_LIGHT, color: m.npsScore >= 50 ? EMERALD : m.npsScore >= 0 ? GOLD : RED_SOFT })] }),
    ]
    children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: npsRows }))

    children.push(bodyText(
      m.npsScore >= 50
        ? `An NPS of +${m.npsScore} is considered excellent by industry standards and indicates that the overwhelming majority of users would actively recommend the platform to colleagues and fellow departmental leaders.`
        : m.npsScore >= 30
          ? `An NPS of +${m.npsScore} is considered strong and indicates broad user satisfaction, with an opportunity to convert Passives into Promoters through targeted improvements.`
          : `The NPS of ${m.npsScore >= 0 ? '+' : ''}${m.npsScore} indicates that while the platform received generally positive reception, there is room for improvement in user experience to increase the proportion of active Promoters.`
    ))

    // 6.3 Digital vs Manual Comparison
    children.push(subSubHeading('6.3 Digital vs Manual Process Assessment'))

    children.push(bodyText(
      'Respondents were asked to compare their experience using the digital platform against the traditional paper-based reporting process used in previous conventions:'
    ))

    const vpRows = [
      new TableRow({ children: [headerCell('Assessment', 5000), headerCell('Respondents', 1500), headerCell('Proportion', 1500)] }),
      ...(['much_easier', 'easier', 'same', 'harder', 'much_harder'] as const).map(key => new TableRow({
        children: [
          dataCell(vsPaperLabel(key), { bold: true }),
          dataCell(String(m.vsPaperBreakdown[key]), { align: AlignmentType.CENTER }),
          dataCell(`${m.feedbackCount > 0 ? Math.round((m.vsPaperBreakdown[key] / m.feedbackCount) * 100) : 0}%`, { align: AlignmentType.CENTER }),
        ]
      }))
    ]
    children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: vpRows }))

    // 6.4 Bug Reports
    if (m.bugReportCount > 0) {
      children.push(subSubHeading('6.4 Technical Issues Reported'))

      children.push(richParagraph([
        { text: `${m.bugReportCount} respondent${m.bugReportCount > 1 ? 's' : ''}`, bold: true },
        { text: ` out of ${m.feedbackCount} (${Math.round((m.bugReportCount / m.feedbackCount) * 100)}%) reported encountering technical issues during use. The specific issues reported are as follows:` },
      ]))

      m.feedbackEntries.filter(fb => fb.encounteredBugs && fb.bugsDescription).forEach(fb => {
        children.push(bulletPoint(`${fb.departmentName}: "${fb.bugsDescription}"`))
      })
    }

    // 6.5 User Testimonials
    children.push(subSubHeading(m.bugReportCount > 0 ? '6.5 User Testimonials & Improvement Suggestions' : '6.4 User Testimonials & Improvement Suggestions'))

    children.push(bodyText(
      'The following are direct quotations from HOD feedback submissions, presented verbatim to preserve the voice and sentiment of the respondents:'
    ))

    m.feedbackEntries.forEach(fb => {
      if (fb.additionalComments && fb.additionalComments.trim().length > 0) {
        children.push(new Paragraph({
          spacing: spacing(80, 40),
          indent: { left: 480 },
          border: { left: { style: BorderStyle.SINGLE, size: 8, color: GOLD } },
          children: [
            new TextRun({ text: `"${fb.additionalComments}"`, font: 'Calibri', size: 20, color: SLATE_DARK, italics: true }),
          ]
        }))
        children.push(new Paragraph({
          spacing: spacing(20, 80),
          indent: { left: 480 },
          children: [
            new TextRun({ text: `— ${fb.fullName}, ${fb.departmentName}`, font: 'Calibri', size: 18, color: SLATE_MED, bold: true }),
          ]
        }))
      }

      if (fb.topImprovement && fb.topImprovement.trim().length > 0) {
        children.push(new Paragraph({
          spacing: spacing(40, 40),
          indent: { left: 720 },
          children: [
            new TextRun({ text: '💡 Suggestion: ', font: 'Calibri', size: 18, color: TEAL, bold: true }),
            new TextRun({ text: fb.topImprovement, font: 'Calibri', size: 18, color: SLATE_DARK, italics: true }),
          ]
        }))
      }
    })
  }

  // ══════════════════════════════════════════════════════════════════════
  // 7. CHALLENGES & RESOLUTION TRACKING
  // ══════════════════════════════════════════════════════════════════════

  children.push(new Paragraph({ children: [new PageBreak()] }))
  children.push(heading('7. CHALLENGES & RESOLUTION TRACKING'))

  children.push(richParagraph([
    { text: `A total of ` },
    { text: `${m.totalChallenges} operational challenges`, bold: true },
    { text: ` were reported across all departments during the convention period. Of these, ` },
    { text: `${m.resolvedChallenges} (${m.resolutionRate}%)`, bold: true, color: EMERALD },
    { text: ` were marked as resolved or treated by the Secretariat, while ` },
    { text: `${m.openChallenges}`, bold: true, color: m.openChallenges > 0 ? RED_SOFT : EMERALD },
    { text: ` remain open for follow-up action.` },
  ]))

  if (m.challengesByDepartment.length > 0) {
    children.push(subSubHeading('7.1 Challenges by Department'))

    const chalRows = [
      new TableRow({ children: [headerCell('Department', 5000), headerCell('Challenges Reported', 3000)] }),
      ...m.challengesByDepartment.slice(0, 15).map(d => new TableRow({
        children: [
          dataCell(d.name, { bold: true }),
          dataCell(String(d.count), { align: AlignmentType.CENTER, bold: true }),
        ]
      }))
    ]
    children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: chalRows }))
  }

  // End-of-event narratives
  if (m.endOfEventNarratives.length > 0) {
    children.push(subSubHeading('7.2 Department End-of-Convention Summaries'))

    children.push(bodyText(
      'The following department-level summaries were submitted by HODs at the conclusion of the convention, capturing key achievements, challenges, and recommendations:'
    ))

    m.endOfEventNarratives.forEach(narr => {
      children.push(new Paragraph({
        spacing: spacing(160, 40),
        children: [new TextRun({ text: narr.departmentName.toUpperCase(), font: 'Calibri', size: 20, bold: true, color: NAVY, underline: {} })]
      }))

      if (narr.overview) children.push(bodyText(`Overview: ${narr.overview}`))
      if (narr.highlights) children.push(bodyText(`Highlights: ${narr.highlights}`))

      if (narr.challenges.length > 0) {
        children.push(bodyText('Challenges:', { bold: true }))
        narr.challenges.forEach(c => { if (c.trim()) children.push(bulletPoint(c)) })
      }

      if (narr.recommendations.length > 0) {
        children.push(bodyText('Recommendations:', { bold: true }))
        narr.recommendations.forEach(r => { if (r.trim()) children.push(bulletPoint(r)) })
      }
    })
  }

  // ══════════════════════════════════════════════════════════════════════
  // 8. OFFERING & FINANCIAL SUMMARY
  // ══════════════════════════════════════════════════════════════════════

  if (m.totalOffering > 0) {
    children.push(heading('8. OFFERING COLLECTION SUMMARY'))

    children.push(richParagraph([
      { text: 'A cumulative offering of ' },
      { text: formatCurrency(m.totalOffering), bold: true, color: EMERALD },
      { text: ` was collected across all departments during the ${m.totalDays}-day convention period. The daily distribution is as follows:` },
    ]))

    if (m.offeringByDay.length > 0) {
      const offRows = [
        new TableRow({ children: [headerCell('Convention Day', 4000), headerCell('Offering Collected', 4000)] }),
        ...m.offeringByDay.map(d => new TableRow({
          children: [
            dataCell(`Day ${d.dayNumber}`, { bold: true, align: AlignmentType.CENTER }),
            dataCell(formatCurrency(d.amount), { align: AlignmentType.CENTER, bold: true }),
          ]
        })),
        new TableRow({
          children: [
            dataCell('GRAND TOTAL', { bold: true, shading: SLATE_LIGHT }),
            dataCell(formatCurrency(m.totalOffering), { align: AlignmentType.CENTER, bold: true, shading: SLATE_LIGHT, color: EMERALD }),
          ]
        })
      ]
      children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: offRows }))
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 9. IMPACT ASSESSMENT — BEFORE vs AFTER
  // ══════════════════════════════════════════════════════════════════════

  const impactSection = m.totalOffering > 0 ? '9' : '8'

  children.push(new Paragraph({ children: [new PageBreak()] }))
  children.push(heading(`${impactSection}. IMPACT ASSESSMENT — BEFORE vs AFTER`))

  children.push(bodyText(
    'The following table presents a comparative assessment of convention operations under the legacy manual system versus the new digital platform:'
  ))

  const impactData = [
    ['Report Collection Time', '3–5 days post-convention', 'Real-time (within minutes)', '~99% faster'],
    ['Final Report Compilation', '1–3 weeks manual effort', '< 30 seconds (one-click export)', '~99.9% faster'],
    ['Compliance Visibility', 'Post-hoc discovery only', 'Live colour-coded matrix', '100% real-time'],
    ['Missing Report Detection', 'Manual phone calls to HODs', 'Automated push notifications', 'Fully automated'],
    ['Requisition Tracking', 'Paper forms, no tracking', '7-stage digital workflow', 'End-to-end transparency'],
    ['Materials Accountability', 'No systematic tracking', 'Full inventory with audit trail', 'Complete traceability'],
    ['Challenge Tracking', 'None', 'Cross-dept console + resolution log', 'New capability'],
    ['Year-over-Year Tracking', 'None', 'Keyword-matching carry-over detection', 'New capability'],
    ['HOD Feedback', 'Verbal/informal', 'Structured survey with NPS', 'New capability'],
    ['Data Accessibility', 'Physical files in office', 'Cloud-based, any device, 24/7', 'Global access'],
    ['Offline Capability', 'N/A (paper only)', 'PWA with offline queue + auto-sync', 'Digital + offline'],
  ]

  const impactRows = [
    new TableRow({ children: [headerCell('Dimension', 2000), headerCell('Before (Manual)', 2200), headerCell('After (Digital Platform)', 2600), headerCell('Improvement', 1800)] }),
    ...impactData.map(row => new TableRow({
      children: [
        dataCell(row[0], { bold: true }),
        dataCell(row[1]),
        dataCell(row[2], { color: EMERALD }),
        dataCell(row[3], { bold: true, color: TEAL }),
      ]
    }))
  ]
  children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: impactRows }))

  // ══════════════════════════════════════════════════════════════════════
  // 10. STRATEGIC RECOMMENDATIONS
  // ══════════════════════════════════════════════════════════════════════

  const recSection = m.totalOffering > 0 ? '10' : '9'

  children.push(heading(`${recSection}. STRATEGIC RECOMMENDATIONS`))

  children.push(bodyText(
    'Based on the operational data gathered during this inaugural deployment and the feedback received from departmental stakeholders, the Secretariat Department respectfully submits the following recommendations to the Board for consideration:'
  ))

  const recommendations = [
    'Mandate 100% Digital Reporting — Formally adopt the DTCE Reporting Platform as the sole channel for convention report submission, eliminating all paper-based and informal reporting channels. This will ensure data consistency and enable real-time compliance enforcement.',
    'Enforce Daily Cutoff Deadlines — Establish and communicate mandatory daily submission cutoff times (recommended: 6:00 PM), with automated escalation notifications dispatched to departmental leadership and the Secretariat for any non-compliant departments.',
    'Conduct Pre-Convention Digital Literacy Training — Organise a mandatory 30-minute onboarding session for all HODs and Assistants at least one week before the convention, covering platform navigation, report submission, and requisition procedures.',
    'Pre-Load Inventory Catalogue — Ensure the complete convention inventory is catalogued in the platform before the event commences, enabling real-time stock tracking, automated low-stock alerts, and precise post-convention reconciliation.',
    'Integrate Financial Reporting Module — Extend the platform to support structured financial data capture, including income and expenditure tracking, offering reconciliation, and budgetary reporting directly linked to departmental activities.',
    'Implement Data Visualisation Dashboards — Add interactive charts and trend graphs to the Secretariat Command Centre, enabling real-time visual analysis of attendance patterns, submission trends, and resource consumption during the convention.',
    'Establish Departmental Performance Recognition — Institute a formal recognition mechanism for departments achieving 100% compliance, incentivising timely and complete reporting across all convention days.',
    'Archive and Benchmark — Preserve the 2026 convention dataset as the institutional baseline for Year-over-Year comparison in subsequent conventions, enabling evidence-based tracking of improvements, recurring issues, and resource allocation efficiency.',
  ]

  recommendations.forEach((r, i) => children.push(numberedItem(i + 1, r)))

  // ══════════════════════════════════════════════════════════════════════
  // 11. CONCLUSION
  // ══════════════════════════════════════════════════════════════════════

  const conSection = m.totalOffering > 0 ? '11' : '10'

  children.push(new Paragraph({ children: [new PageBreak()] }))
  children.push(heading(`${conSection}. CONCLUSION`))

  children.push(bodyText(
    'The Secretariat Department is pleased to report that the inaugural deployment of the DTCE Reporting Platform during the 2026 Annual Convention has demonstrated the transformative potential of digital operations management within the convention context.'
  ))

  children.push(bodyText(
    'The platform has successfully eliminated the historical delays associated with manual report collation, provided unprecedented real-time visibility into departmental compliance, and established a comprehensive digital audit trail that supports institutional accountability and strategic decision-making.'
  ))

  if (m.feedbackCount > 0) {
    children.push(richParagraph([
      { text: 'The overwhelmingly positive feedback from departmental stakeholders — evidenced by an average satisfaction score of ' },
      { text: `${m.avgOverallSatisfaction}/5`, bold: true, color: EMERALD },
      { text: ' and a Net Promoter Score of ' },
      { text: `${m.npsScore >= 0 ? '+' : ''}${m.npsScore}`, bold: true, color: EMERALD },
      { text: ' — validates the strategic decision to invest in this digital transformation initiative and confirms the platform\'s utility and acceptance among the departmental leadership.' },
    ]))
  }

  children.push(bodyText(
    'The Secretariat Department recommends the continued development, enhancement, and deployment of this platform for all future convention cycles, with the strategic improvements outlined in the Recommendations section implemented to maximise operational impact and institutional value.'
  ))

  children.push(new Paragraph({ spacing: spacing(300, 60), children: [] }))

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(120, 40),
    children: [new TextRun({ text: 'To God be all the glory.', font: 'Calibri', size: 22, bold: true, italics: true, color: GOLD })]
  }))

  children.push(new Paragraph({ spacing: spacing(200, 60), children: [] }))

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(40, 20),
    children: [new TextRun({ text: 'Respectfully submitted,', font: 'Calibri', size: 20, color: SLATE_MED, italics: true })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(20, 20),
    children: [new TextRun({ text: 'The Secretariat Department', font: 'Calibri', size: 22, bold: true, color: NAVY })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(20, 20),
    children: [new TextRun({ text: 'DTCE Junior Church', font: 'Calibri', size: 20, color: SLATE_MED })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: spacing(20, 20),
    children: [new TextRun({ text: 'The Redeemed Christian Church of God', font: 'Calibri', size: 20, color: SLATE_MED })]
  }))

  // ══════════════════════════════════════════════════════════════════════
  // DOCUMENT ASSEMBLY
  // ══════════════════════════════════════════════════════════════════════

  const headerChildren: Paragraph[] = []
  if (logoBuffer) {
    try {
      headerChildren.push(new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new ImageRun({ data: logoBuffer, transformation: { width: 40, height: 40 }, type: 'png' }),
          new TextRun({ text: '   DTCE Secretariat — Strategic Board Report', font: 'Calibri', size: 14, color: SLATE_MED }),
        ]
      }))
    } catch {
      headerChildren.push(new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: 'DTCE Secretariat — Strategic Board Report', font: 'Calibri', size: 14, color: SLATE_MED })]
      }))
    }
  } else {
    headerChildren.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: 'DTCE Secretariat — Strategic Board Report', font: 'Calibri', size: 14, color: SLATE_MED })]
    }))
  }

  const doc = new Document({
    creator: 'DTCE Reporting Platform',
    title: `${m.eventName} — Secretariat Strategic Board Report`,
    description: 'Strategic report on the digital transformation of convention operations reporting',
    sections: [{
      properties: {
        page: { margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } }
      },
      headers: { default: new Header({ children: headerChildren }) },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'CONFIDENTIAL — ', font: 'Calibri', size: 14, color: SLATE_MED, bold: true }),
              new TextRun({ text: 'Page ', font: 'Calibri', size: 14, color: SLATE_MED }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 14, color: SLATE_MED }),
              new TextRun({ text: ' of ', font: 'Calibri', size: 14, color: SLATE_MED }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 14, color: SLATE_MED }),
            ]
          })]
        })
      },
      children
    }]
  })

  return Buffer.from(await Packer.toBuffer(doc))
}
