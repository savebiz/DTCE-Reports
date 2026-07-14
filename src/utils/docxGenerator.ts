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

// Colors
const NAVY = '1B3A6B'
const GOLD = 'C49A00'
const SLATE_DARK = '334155'
const SLATE_LIGHT = 'F1F5F9'
const GRAY_BORDER = 'E2E8F0'

export async function generateDTCEConventionDocx({
  event,
  departments,
  reports,
  narratives,
  logoBuffer
}: {
  event: any
  departments: any[]
  reports: any[]
  narratives: any[]
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

  // Header and Footer setups
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

  // Cover Page elements
  const coverChildren: any[] = []

  // Insert Logo if provided
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
          text: `Dates: ${event?.start_date || 'July 13'} to ${event?.end_date || 'July 17, 2026'}`,
          size: 14,
          italics: true,
          color: '475569',
          font: 'Outfit'
        })
      ]
    })
  )

  // Document Sections Array
  const docSections: any[] = []

  // 1. Cover Page Section
  docSections.push({
    properties: {
      titlePage: true
    },
    children: coverChildren
  })

  // Assembled Content Children for Section 2
  const mainChildren: any[] = []

  // 2. Executive Summary
  mainChildren.push(createHeading1('1. Executive Summary'))
  mainChildren.push(
    new Paragraph({
      spacing: spacing(120, 180),
      children: [
        new TextRun({
          text: `This consolidated report presents the administrative, attendance, and operational metrics of the Junior Church Global Secretariat during the ${event?.name || 'Annual Convention'}. It compiles metrics from all 40 departments tasked with delegate management, welfare, medical care, and logistics. Through diligent data collation and real-time offline-first form synchronization, the Secretariat maintained comprehensive reporting standards to ensure the spiritual and physical well-being of all attendees.`,
          size: 22,
          font: 'Outfit'
        })
      ]
    })
  )

  // 3. General Report of Activities (Day-by-Day Summary Tables)
  mainChildren.push(createHeading1('2. General Report of Activities'))
  
  // Build a summary table of attendance per day
  const tableRows = [
    new TableRow({
      children: [
        new TableCell({
          shading: { fill: NAVY },
          width: { size: 3000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Convention Day', color: 'FFFFFF', bold: true, size: 18 })] })]
        }),
        new TableCell({
          shading: { fill: NAVY },
          width: { size: 3000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Avg Morning Attend', color: 'FFFFFF', bold: true, size: 18 })] })]
        }),
        new TableCell({
          shading: { fill: NAVY },
          width: { size: 3000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'Avg Evening Attend', color: 'FFFFFF', bold: true, size: 18 })] })]
        })
      ]
    })
  ]

  // Mock days attendance
  const daySummary = [
    { day: 'Day 1', morning: 85, evening: 120 },
    { day: 'Day 2', morning: 110, evening: 155 },
    { day: 'Day 3', morning: 130, evening: 180 },
    { day: 'Day 4', morning: 140, evening: 210 },
    { day: 'Day 5', morning: 150, evening: 220 }
  ]

  daySummary.forEach((row, idx) => {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT },
            children: [new Paragraph({ children: [new TextRun({ text: row.day, size: 18 })] })]
          }),
          new TableCell({
            shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT },
            children: [new Paragraph({ children: [new TextRun({ text: String(row.morning), size: 18 })] })]
          }),
          new TableCell({
            shading: { fill: idx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT },
            children: [new Paragraph({ children: [new TextRun({ text: String(row.evening), size: 18 })] })]
          })
        ]
      })
    )
  })

  const generalSummaryTable = new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
      left: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
      right: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER }
    },
    rows: tableRows
  })

  mainChildren.push(
    new Paragraph({ text: 'Consolidated Day-by-Day Attendance Summary:', spacing: spacing(120, 120) }),
    generalSummaryTable,
    new Paragraph({ text: '', spacing: spacing(240, 240) })
  )

  // 4. Departmental Narrative Reports & Tables
  mainChildren.push(createHeading1('3. Selected Departmental Reports'))

  const endOfEventNarratives = narratives.filter(n => n.is_end_of_event === true)

  if (endOfEventNarratives.length === 0) {
    mainChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'No end-of-event departmental narratives have been finalized or approved yet.',
            italics: true,
            color: '64748B'
          })
        ]
      })
    )
  } else {
    endOfEventNarratives.forEach((narrative) => {
      const dept = departments.find(d => d.id === narrative.department_id)
      const deptName = dept?.name || 'Department'

      mainChildren.push(createHeading2(deptName))
      
      // Overview
      mainChildren.push(
        new Paragraph({
          spacing: spacing(60, 60),
          children: [
            new TextRun({ text: 'Overview: ', bold: true, color: NAVY }),
            new TextRun({ text: narrative.overview || 'No overview provided.' })
          ]
        })
      )

      // Highlights
      mainChildren.push(
        new Paragraph({
          spacing: spacing(60, 180),
          children: [
            new TextRun({ text: 'Highlights: ', bold: true, color: NAVY }),
            new TextRun({ text: narrative.highlights || 'No highlights provided.' })
          ]
        })
      )

      // Departmental Metrics Table (if reports exist)
      const deptReports = reports.filter(r => r.department_id === narrative.department_id)
      if (deptReports.length > 0) {
        mainChildren.push(new Paragraph({ spacing: spacing(120, 60), children: [new TextRun({ text: `${deptName} Day-by-Day Attendance:`, bold: true, size: 16 })] }))
        
        const metricHeaders = [
          new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Day', color: 'FFFFFF', bold: true, size: 16 })] })] }),
          new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Morning', color: 'FFFFFF', bold: true, size: 16 })] })] }),
          new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Evening', color: 'FFFFFF', bold: true, size: 16 })] })] }),
          new TableCell({ shading: { fill: NAVY }, children: [new Paragraph({ children: [new TextRun({ text: 'Status', color: 'FFFFFF', bold: true, size: 16 })] })] })
        ]

        const metricRows = [
          new TableRow({ children: metricHeaders })
        ]

        deptReports.sort((a,b) => a.created_at.localeCompare(b.created_at)).forEach((r, rIdx) => {
          metricRows.push(
            new TableRow({
              children: [
                new TableCell({ shading: { fill: rIdx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: `Day ${rIdx + 1}` })] })] }),
                new TableCell({ shading: { fill: rIdx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: String(r.attendance_morning) })] })] }),
                new TableCell({ shading: { fill: rIdx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: String(r.attendance_evening) })] })] }),
                new TableCell({ shading: { fill: rIdx % 2 === 0 ? 'FFFFFF' : SLATE_LIGHT }, children: [new Paragraph({ children: [new TextRun({ text: r.status })] })] })
              ]
            })
          )
        })

        const deptTable = new Table({
          width: { size: 9000, type: WidthType.DXA },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
            left: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
            right: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: GRAY_BORDER }
          },
          rows: metricRows
        })

        mainChildren.push(deptTable, new Paragraph({ text: '', spacing: spacing(180, 180) }))
      }
    })
  }

  // 5. Consolidated Challenges & Observations Section
  mainChildren.push(createHeading1('4. Consolidated Challenges & Observations'))
  
  let challengeCount = 0
  endOfEventNarratives.forEach((narrative) => {
    const dept = departments.find(d => d.id === narrative.department_id)
    const chs = narrative.challenges_json || []
    
    if (chs.length > 0) {
      mainChildren.push(new Paragraph({ spacing: spacing(120, 60), children: [new TextRun({ text: dept?.name || 'Department', bold: true, color: SLATE_DARK, size: 18 })] }))
      chs.forEach((ch: any) => {
        challengeCount++
        mainChildren.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: spacing(40, 40),
            children: [
              new TextRun({ text: `[${ch.id}] `, bold: true, color: GOLD }),
              new TextRun({ text: ch.text })
            ]
          })
        )
      })
    }
  })

  if (challengeCount === 0) {
    mainChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'No challenges logged by any department.',
            italics: true,
            color: '64748B'
          })
        ]
      })
    )
  }

  // 6. Strategic Recommendations
  mainChildren.push(createHeading1('5. Strategic Recommendations & Corrective Actions'))

  let recommendationCount = 0
  endOfEventNarratives.forEach((narrative) => {
    const dept = departments.find(d => d.id === narrative.department_id)
    const recs = narrative.recommendations_json || []
    
    if (recs.length > 0) {
      mainChildren.push(new Paragraph({ spacing: spacing(120, 60), children: [new TextRun({ text: dept?.name || 'Department', bold: true, color: SLATE_DARK, size: 18 })] }))
      recs.forEach((rec: any) => {
        recommendationCount++
        const linkedText = rec.linked_challenge_id ? ` (Linked to Challenge ${rec.linked_challenge_id})` : ''
        mainChildren.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: spacing(40, 40),
            children: [
              new TextRun({ text: rec.text }),
              new TextRun({ text: linkedText, italics: true, color: '64748B', size: 16 })
            ]
          })
        )
      })
    }
  })

  if (recommendationCount === 0) {
    mainChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'No recommendations logged by any department.',
            italics: true,
            color: '64748B'
          })
        ]
      })
    )
  }

  // 7. Appreciation & Signatures
  mainChildren.push(createHeading1('6. Appreciation & Secretariat Approvals'))
  mainChildren.push(
    new Paragraph({
      spacing: spacing(120, 240),
      children: [
        new TextRun({
          text: 'We express our profound gratitude to the National Coordinators, HODs, and the Secretariat volunteers whose tireless execution kept convention reporting running seamlessly under challenging offline settings.',
          size: 20
        })
      ]
    }),
    new Paragraph({
      spacing: spacing(240, 60),
      children: [
        new TextRun({ text: 'Secretariat General Approval: ___________________________', bold: true, color: NAVY })
      ]
    }),
    new Paragraph({
      spacing: spacing(60, 240),
      children: [
        new TextRun({ text: 'National Competitions Representative: ____________________', bold: true, color: NAVY })
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
