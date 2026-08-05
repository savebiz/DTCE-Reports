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
      if (['offering', 'workforce', 'daily_narrative', 'attendance_morning', 'attendance_evening', 'proxy_entry'].includes(key)) return

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
