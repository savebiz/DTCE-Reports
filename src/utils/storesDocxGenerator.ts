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
import { compileStrategicStoresReport } from '@/utils/storesReportSummarizer'

// Colors
const NAVY = '1B3A6B'
const GOLD = 'C49A00'
const SLATE_DARK = '334155'
const SLATE_LIGHT = 'F1F5F9'
const GRAY_BORDER = 'E2E8F0'
const TEAL = '0D9488'
const AMBER = 'D97706'

export async function generateStoresMaterialsDocx({
  event,
  requests,
  reports,
  departments,
  eventDays,
  exportLabel,
  logoBuffer
}: {
  event: any
  requests: any[]
  reports: any[]
  departments: any[]
  eventDays?: any[]
  exportLabel?: string
  logoBuffer?: Buffer
}): Promise<Buffer> {

  const summary = compileStrategicStoresReport(requests, reports, departments, eventDays)
  const spacing = (before = 120, after = 120) => ({ before, after, line: 240 })

  const createHeading1 = (text: string) => new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    keepNext: true,
    children: [new TextRun({ text, color: NAVY, bold: true, font: 'Outfit', size: 26 })]
  })

  const createHeading2 = (text: string) => new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    keepNext: true,
    children: [new TextRun({ text, color: TEAL, bold: true, font: 'Outfit', size: 22 })]
  })

  const createHeading3 = (text: string) => new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    keepNext: true,
    children: [new TextRun({ text, color: GOLD, bold: true, font: 'Outfit', size: 18 })]
  })

  const tableBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
    left: { style: BorderStyle.NONE, size: 0, color: 'AUTO' },
    right: { style: BorderStyle.NONE, size: 0, color: 'AUTO' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: GRAY_BORDER },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'AUTO' },
  }

  const headerChildren: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: `DTCE STORES REQUISITION & MATERIALS FLOW AUDIT — ${event?.name || 'CONVENTION'}`,
          size: 14,
          font: 'Outfit',
          color: '94A3B8',
          bold: true
        })
      ]
    })
  ]

  const footerChildren: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'Secretariat Super Admin Portal  |  Stores Strategic Audit Report  |  Page ', size: 14, font: 'Outfit', color: '94A3B8' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 14, font: 'Outfit', color: '94A3B8', bold: true })
      ]
    })
  ]

  const mainChildren: (Paragraph | Table)[] = []

  // ━━ 1. Letterhead / Logo Header ━━
  if (logoBuffer && logoBuffer.length > 0) {
    try {
      mainChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: spacing(0, 100),
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 90, height: 90 },
            type: "png"
          })
        ]
      }))
    } catch {
      // Graceful fallback if logo rendering fails
    }
  }

  mainChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: spacing(0, 40),
    children: [new TextRun({ text: 'DEEPER LIFE BIBLE CHURCH', bold: true, size: 28, font: 'Outfit', color: NAVY })]
  }))

  mainChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: spacing(0, 100),
    children: [new TextRun({ text: 'DISTRICT & TERRITORIAL CHURCH EXCELLENCE (DTCE)', bold: true, size: 20, font: 'Outfit', color: GOLD })]
  }))

  mainChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: spacing(0, 180),
    children: [new TextRun({ text: 'STORES REQUISITION & MATERIALS FLOW AUDIT REPORT', bold: true, size: 26, font: 'Outfit', color: NAVY })]
  }))

  // Meta Box
  const metaRows = [
    new TableRow({
      children: [
        new TableCell({
          shading: { fill: SLATE_LIGHT },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'Event: ', bold: true, font: 'Outfit', size: 16 }),
                new TextRun({ text: `${event?.name || 'Convention'}`, font: 'Outfit', size: 16 }),
                new TextRun({ text: '   |   Export Label: ', bold: true, font: 'Outfit', size: 16 }),
                new TextRun({ text: `${exportLabel || 'Official Audit'}`, font: 'Outfit', size: 16, color: TEAL }),
                new TextRun({ text: '   |   Generated: ', bold: true, font: 'Outfit', size: 16 }),
                new TextRun({ text: `${new Date().toLocaleString()}`, font: 'Outfit', size: 16 })
              ]
            })
          ]
        })
      ]
    })
  ]
  mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: metaRows }))
  mainChildren.push(new Paragraph({ text: '', spacing: spacing(120, 120) }))

  // ━━ 2. Executive Strategic Summary ━━
  mainChildren.push(createHeading1('1. Executive Strategic Summary'))
  mainChildren.push(new Paragraph({
    spacing: spacing(60, 120),
    children: [
      new TextRun({
        text: `This report provides an independent, highly strategic audit of material requisitions, stores distribution velocity, inventory movement, and departmental consumption for ${event?.name || 'the convention'}. Out of ${summary.kpis.totalRequisitions} total submitted store requisitions across ${summary.kpis.totalDepartmentsRequesting} departments, ${summary.kpis.deliveredCount + summary.kpis.approvedCount} were approved/fulfilled, yielding an overall fulfillment rate of ${summary.kpis.fulfillmentRate}%.`,
        font: 'Outfit',
        size: 18,
        color: SLATE_DARK
      })
    ]
  }))

  // KPI Summary Table
  const kpiHdr = new TableRow({
    children: [
      new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Metric Indicator', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
      new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Recorded Value', color: 'FFFFFF', bold: true, size: 16, font: 'Outfit' })] })] }),
    ]
  })
  const kpiDataRows = [
    ['Total Requisitions Submitted', summary.kpis.totalRequisitions.toLocaleString()],
    ['Delivered & Ready for Collection', summary.kpis.deliveredCount.toLocaleString()],
    ['Approved & In Progress', summary.kpis.approvedCount.toLocaleString()],
    ['Partially Fulfilled', summary.kpis.partialCount.toLocaleString()],
    ['Pending Coordinator Review', summary.kpis.pendingCount.toLocaleString()],
    ['Declined Requisitions', summary.kpis.declinedCount.toLocaleString()],
    ['Overall Fulfillment Rate', `${summary.kpis.fulfillmentRate}%`],
    ['Total Material Units Requested', summary.kpis.totalItemsRequested.toLocaleString()],
    ['Total Material Units Approved/Delivered', summary.kpis.totalItemsApproved.toLocaleString()],
    ['Participating Requisitioning Depts', summary.kpis.totalDepartmentsRequesting.toLocaleString()]
  ].map(([label, val], idx) => new TableRow({
    children: [
      new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: label, font: 'Outfit', bold: true, size: 16 })] })] }),
      new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: val, font: 'Outfit', bold: true, color: TEAL, size: 16 })] })] }),
    ]
  }))

  mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: [kpiHdr, ...kpiDataRows] }))
  mainChildren.push(new Paragraph({ text: '', spacing: spacing(140, 140) }))

  // ━━ 3. Departmental Material Demand Ranking ━━
  mainChildren.push(createHeading1('2. Departmental Material Demand Ranking'))
  mainChildren.push(new Paragraph({
    spacing: spacing(40, 100),
    children: [new TextRun({ text: 'Breakdown of item requisitions and total quantity units demanded by each department.', font: 'Outfit', size: 16, color: SLATE_DARK })]
  }))

  if (summary.departmentDemand.length > 0) {
    const deptHdr = new TableRow({
      children: [
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Department Name', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Requests', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Requested Units', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Approved Units', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Fulfillment (%)', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
      ]
    })
    const deptRows = summary.departmentDemand.map((d, idx) => new TableRow({
      children: [
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.departmentName, font: 'Outfit', bold: true, size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.totalRequests.toLocaleString(), font: 'Outfit', size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.totalUnitsRequested.toLocaleString(), font: 'Outfit', bold: true, size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.totalUnitsApproved.toLocaleString(), font: 'Outfit', bold: true, color: TEAL, size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: `${d.fulfillmentRate}%`, font: 'Outfit', bold: true, size: 16 })] })] }),
      ]
    }))
    mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: [deptHdr, ...deptRows] }))
  }
  mainChildren.push(new Paragraph({ text: '', spacing: spacing(140, 140) }))

  // ━━ 4. Material Velocity & Item-Level Consumption Index ━━
  mainChildren.push(createHeading1('3. Material Velocity & Item-Level Consumption Index'))
  mainChildren.push(new Paragraph({
    spacing: spacing(40, 100),
    children: [new TextRun({ text: 'Item-by-item analysis comparing requested quantities versus approved supply.', font: 'Outfit', size: 16, color: SLATE_DARK })]
  }))

  if (summary.itemVelocity.length > 0) {
    const itemHdr = new TableRow({
      children: [
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Material / Item Name', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Category', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Requested', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Approved', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Ratio (%)', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
      ]
    })
    const itemRows = summary.itemVelocity.map((item, idx) => new TableRow({
      children: [
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: item.itemName, font: 'Outfit', bold: true, size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: item.category, font: 'Outfit', size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: `${item.totalRequested.toLocaleString()} ${item.unit}`, font: 'Outfit', size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: `${item.totalApproved.toLocaleString()} ${item.unit}`, font: 'Outfit', bold: true, color: TEAL, size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: `${item.approvalRatio}%`, font: 'Outfit', bold: true, color: item.shortageFlag ? AMBER : NAVY, size: 16 })] })] }),
      ]
    }))
    mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: [itemHdr, ...itemRows] }))
  }
  mainChildren.push(new Paragraph({ text: '', spacing: spacing(140, 140) }))

  // ━━ 5. Stores Inventory Movement Tracking ━━
  mainChildren.push(createHeading1('4. Stores Inventory Movement & Equipment Logs'))
  
  if (summary.durablesLog.length > 0) {
    mainChildren.push(createHeading3('A. Durables Inventory Tracking (Issued vs. Returned)'))
    const durHdr = new TableRow({
      children: [
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Day', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Item Name', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Department', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Issued', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Returned', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: TEAL }, children: [new Paragraph({ children: [new TextRun({ text: 'Balance', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
      ]
    })
    const durRows = summary.durablesLog.map((d, idx) => new TableRow({
      children: [
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.dayLabel, font: 'Outfit', bold: true, size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.itemName, font: 'Outfit', bold: true, size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.department, font: 'Outfit', size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.qtyIssued.toLocaleString(), font: 'Outfit', size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.qtyReturned.toLocaleString(), font: 'Outfit', size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: d.balance.toLocaleString(), font: 'Outfit', bold: true, color: NAVY, size: 16 })] })] }),
      ]
    }))
    mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: [durHdr, ...durRows] }))
    mainChildren.push(new Paragraph({ text: '', spacing: spacing(100, 100) }))
  }

  if (summary.consumablesLog.length > 0) {
    mainChildren.push(createHeading3('B. Consumables Distribution Logs'))
    const conHdr = new TableRow({
      children: [
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Day', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Item Name', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Department / Unit', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
        new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Qty Issued', color: 'FFFFFF', bold: true, size: 14, font: 'Outfit' })] })] }),
      ]
    })
    const conRows = summary.consumablesLog.map((c, idx) => new TableRow({
      children: [
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: c.dayLabel, font: 'Outfit', bold: true, size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: c.itemName, font: 'Outfit', bold: true, size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: c.department, font: 'Outfit', size: 16 })] })] }),
        new TableCell({ shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: c.qtyIssued.toLocaleString(), font: 'Outfit', bold: true, color: TEAL, size: 16 })] })] }),
      ]
    }))
    mainChildren.push(new Table({ width: { size: 9000, type: WidthType.DXA }, borders: tableBorders, rows: [conHdr, ...conRows] }))
  }
  mainChildren.push(new Paragraph({ text: '', spacing: spacing(140, 140) }))

  // ━━ 6. Strategic Observations & Material Flow Recommendations ━━
  mainChildren.push(createHeading1('5. Strategic Observations & Material Flow Recommendations'))

  if (summary.strategicBottlenecks.length > 0) {
    mainChildren.push(createHeading2('Operational Bottlenecks & Supply Constraints'))
    summary.strategicBottlenecks.forEach(bot => {
      mainChildren.push(new Paragraph({
        spacing: spacing(40, 80),
        children: [
          new TextRun({ text: '⚠️ ', size: 16 }),
          new TextRun({ text: bot, font: 'Outfit', size: 16, color: SLATE_DARK })
        ]
      }))
    })
  }

  mainChildren.push(createHeading2('Executive Material Flow Recommendations'))
  summary.recommendations.forEach((rec, idx) => {
    mainChildren.push(new Paragraph({
      spacing: spacing(40, 80),
      children: [
        new TextRun({ text: `${idx + 1}. `, bold: true, color: TEAL, font: 'Outfit', size: 16 }),
        new TextRun({ text: rec, font: 'Outfit', size: 16, color: SLATE_DARK })
      ]
    }))
  })

  // Assemble document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 }
          }
        },
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: new Footer({ children: footerChildren }) },
        children: mainChildren
      }
    ]
  })

  return await Packer.toBuffer(doc)
}
