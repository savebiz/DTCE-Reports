/**
 * Stores Requisition & Materials Flow Strategic Report Summarizer
 * Processes store requests, inventory movements, and departmental material demand.
 */

export interface StoresSummaryKPIs {
  totalRequisitions: number
  deliveredCount: number
  pendingCount: number
  approvedCount: number
  declinedCount: number
  partialCount: number
  fulfillmentRate: number
  totalItemsRequested: number
  totalItemsApproved: number
  totalDepartmentsRequesting: number
}

export interface DepartmentMaterialDemandRow {
  departmentId: string
  departmentName: string
  totalRequests: number
  totalUnitsRequested: number
  totalUnitsApproved: number
  fulfillmentRate: number
  pendingCount: number
  deliveredCount: number
}

export interface ItemMaterialVelocityRow {
  itemName: string
  category: string
  unit: string
  totalRequested: number
  totalApproved: number
  approvalRatio: number
  requisitionCount: number
  shortageFlag: boolean
}

export interface StoresInventoryDurableRow {
  dayLabel: string
  itemName: string
  department: string
  qtyInStock: number
  qtyIssued: number
  qtyReturned: number
  balance: number
}

export interface StoresInventoryConsumableRow {
  dayLabel: string
  itemName: string
  department: string
  qtyInStock: number
  qtyIssued: number
}

export interface StoresAuditLogItem {
  id: string
  date: string
  departmentName: string
  requesterName: string
  status: string
  itemSummary: string
  reviewerComments: string
}

export interface StrategicStoresSummary {
  kpis: StoresSummaryKPIs
  departmentDemand: DepartmentMaterialDemandRow[]
  itemVelocity: ItemMaterialVelocityRow[]
  durablesLog: StoresInventoryDurableRow[]
  consumablesLog: StoresInventoryConsumableRow[]
  auditLogs: StoresAuditLogItem[]
  strategicBottlenecks: string[]
  recommendations: string[]
}

export function compileStrategicStoresReport(
  requests: any[],
  reports: any[],
  departments: any[],
  eventDays?: any[]
): StrategicStoresSummary {
  const reqList = Array.isArray(requests) ? requests : []
  const repList = Array.isArray(reports) ? reports : []
  const deptList = Array.isArray(departments) ? departments : []

  const deptMap: Record<string, string> = {}
  deptList.forEach(d => { deptMap[d.id] = d.name })

  const dayMap: Record<string, number> = {}
  if (Array.isArray(eventDays)) {
    eventDays.forEach((ed: any) => { dayMap[ed.id] = ed.day_number })
  }

  // 1. KPI Computation
  let deliveredCount = 0
  let pendingCount = 0
  let approvedCount = 0
  let declinedCount = 0
  let partialCount = 0
  let totalItemsRequested = 0
  let totalItemsApproved = 0

  const requestingDeptsSet = new Set<string>()
  const deptDemandMap: Record<string, {
    deptName: string
    requests: number
    requested: number
    approved: number
    pending: number
    delivered: number
  }> = {}

  const itemVelocityMap: Record<string, {
    category: string
    unit: string
    requested: number
    approved: number
    reqCount: number
  }> = {}

  const auditLogs: StoresAuditLogItem[] = []

  reqList.forEach((req: any) => {
    const status = req.status || 'pending_coordinator'
    const deptId = req.department_id || req.department?.id || ''
    const deptName = req.department?.name || deptMap[deptId] || (deptId ? 'Department' : 'General Stores')

    if (deptId) requestingDeptsSet.add(deptId)

    if (!deptDemandMap[deptName]) {
      deptDemandMap[deptName] = { deptName, requests: 0, requested: 0, approved: 0, pending: 0, delivered: 0 }
    }
    deptDemandMap[deptName].requests++

    if (status === 'delivered' || status === 'ready_for_collection') {
      deliveredCount++
      deptDemandMap[deptName].delivered++
    } else if (status === 'pending_coordinator') {
      pendingCount++
      deptDemandMap[deptName].pending++
    } else if (status === 'declined') {
      declinedCount++
    } else if (status === 'partially_fulfilled') {
      partialCount++
      approvedCount++
    } else {
      approvedCount++
    }

    // Process items_json safely
    let items: any[] = []
    if (Array.isArray(req.items_json)) {
      items = req.items_json
    } else if (typeof req.items_json === 'string') {
      try {
        const parsed = JSON.parse(req.items_json)
        if (Array.isArray(parsed)) items = parsed
      } catch {
        items = []
      }
    }

    const itemNamesList: string[] = []

    items.forEach((item: any) => {
      const name = (item.name || item.item_name || 'Material Item').trim()
      const category = item.category || 'General Supply'
      const unit = item.unit || 'units'
      const reqQty = Number(item.requested_quantity ?? item.quantity ?? 0)
      const appQty = Number(item.approved_quantity ?? (status === 'declined' ? 0 : reqQty))

      totalItemsRequested += reqQty
      totalItemsApproved += appQty

      deptDemandMap[deptName].requested += reqQty
      deptDemandMap[deptName].approved += appQty

      itemNamesList.push(`${name} (${appQty}/${reqQty} ${unit})`)

      if (!itemVelocityMap[name]) {
        itemVelocityMap[name] = { category, unit, requested: 0, approved: 0, reqCount: 0 }
      }
      itemVelocityMap[name].requested += reqQty
      itemVelocityMap[name].approved += appQty
      itemVelocityMap[name].reqCount++
    })

    if (req.reviewer_comments || req.reviewed_at) {
      auditLogs.push({
        id: req.id,
        date: req.reviewed_at ? new Date(req.reviewed_at).toLocaleString() : new Date(req.created_at || Date.now()).toLocaleString(),
        departmentName: deptName,
        requesterName: req.requester?.full_name || 'HOD Delegate',
        status: status.replace('_', ' ').toUpperCase(),
        itemSummary: itemNamesList.join(', ') || 'No item details',
        reviewerComments: req.reviewer_comments || 'Approved as requested.'
      })
    }
  })

  const totalRequisitions = reqList.length
  const fulfillmentRate = totalRequisitions > 0
    ? Math.round(((deliveredCount + approvedCount + partialCount) / totalRequisitions) * 100)
    : 0

  const kpis: StoresSummaryKPIs = {
    totalRequisitions,
    deliveredCount,
    pendingCount,
    approvedCount,
    declinedCount,
    partialCount,
    fulfillmentRate,
    totalItemsRequested,
    totalItemsApproved,
    totalDepartmentsRequesting: requestingDeptsSet.size
  }

  // 2. Department Demand Rows
  const departmentDemand: DepartmentMaterialDemandRow[] = Object.entries(deptDemandMap).map(([departmentName, data]) => {
    const deptFulfillment = data.requests > 0
      ? Math.round(((data.delivered + (data.requests - data.pending - data.delivered)) / data.requests) * 100)
      : 0
    return {
      departmentId: departmentName,
      departmentName,
      totalRequests: data.requests,
      totalUnitsRequested: data.requested,
      totalUnitsApproved: data.approved,
      fulfillmentRate: deptFulfillment,
      pendingCount: data.pending,
      deliveredCount: data.delivered
    }
  }).sort((a, b) => b.totalUnitsRequested - a.totalUnitsRequested)

  // 3. Item Velocity Rows
  const itemVelocity: ItemMaterialVelocityRow[] = Object.entries(itemVelocityMap).map(([itemName, data]) => {
    const ratio = data.requested > 0 ? Math.round((data.approved / data.requested) * 100) : 100
    return {
      itemName,
      category: data.category,
      unit: data.unit,
      totalRequested: data.requested,
      totalApproved: data.approved,
      approvalRatio: ratio,
      requisitionCount: data.reqCount,
      shortageFlag: ratio < 80
    }
  }).sort((a, b) => b.totalRequested - a.totalRequested)

  // 4. Extract Inventory Logs from Daily Reports for Stores Department
  const durablesLog: StoresInventoryDurableRow[] = []
  const consumablesLog: StoresInventoryConsumableRow[] = []

  const storesReports = repList.filter(r => {
    const d = deptList.find(dept => dept.id === r.department_id)
    return d && d.name.toLowerCase().includes('store')
  })

  storesReports.forEach((r, idx) => {
    const dayNum = dayMap[r.event_day_id] || (idx + 1)
    const dayLabel = `Day ${dayNum}`
    const mData = r.metrics_data || {}
    const custom = mData.custom_schema || mData

    const durables = Array.isArray(custom.durables) ? custom.durables : []
    durables.forEach((item: any) => {
      const name = item.item_name || item.name || 'Durable Item'
      const dept = item.department || 'All Units'
      const stock = Number(item.qty_instock) || 0
      const issued = Number(item.qty_issued) || 0
      const returned = Number(item.qty_returned) || 0
      const balance = stock - issued + returned
      durablesLog.push({ dayLabel, itemName: name, department: dept, qtyInStock: stock, qtyIssued: issued, qtyReturned: returned, balance })
    })

    const consumables = Array.isArray(custom.consumables) ? custom.consumables : Array.isArray(custom.items_issued) ? custom.items_issued : []
    consumables.forEach((item: any) => {
      const name = item.item_name || item.name || 'Consumable Item'
      const dept = item.department || 'All Units'
      const stock = Number(item.qty_instock) || 0
      const issued = Number(item.qty_issued) || Number(item.count) || 0
      consumablesLog.push({ dayLabel, itemName: name, department: dept, qtyInStock: stock, qtyIssued: issued })
    })
  })

  // 5. Strategic Observations & Bottlenecks
  const strategicBottlenecks: string[] = []
  const recommendations: string[] = []

  const shortageItems = itemVelocity.filter(i => i.shortageFlag)
  if (shortageItems.length > 0) {
    strategicBottlenecks.push(
      `Supply Constrained Materials: ${shortageItems.map(i => `${i.itemName} (${i.approvalRatio}% approved)`).join(', ')}.`
    )
  }

  if (declinedCount > 0) {
    strategicBottlenecks.push(
      `${declinedCount} requisition ticket(s) were declined due to policy constraints or inventory insufficiency.`
    )
  }

  if (pendingCount > 0) {
    strategicBottlenecks.push(
      `${pendingCount} requisition ticket(s) remain pending coordinator review.`
    )
  }

  const topDept = departmentDemand[0]
  if (topDept) {
    recommendations.push(
      `High Material Consumption Priority: ${topDept.departmentName} generated the largest demand with ${topDept.totalUnitsRequested.toLocaleString()} item units across ${topDept.totalRequests} requisitions.`
    )
  }

  if (totalItemsApproved < totalItemsRequested) {
    const gap = totalItemsRequested - totalItemsApproved
    recommendations.push(
      `Buffer Stock Optimization: An overall gap of ${gap.toLocaleString()} requested material units was unfulfilled; expand safety stock allocations prior to the next convention.`
    )
  } else {
    recommendations.push(
      `Stores Distribution Efficiency: 100% of requested material quantities were approved and distributed.`
    )
  }

  recommendations.push(
    `Centralized Digital Check-Out: Maintain strict real-time logging for durables to ensure prompt post-event retrieval of all non-consumable equipment.`
  )

  return {
    kpis,
    departmentDemand,
    itemVelocity,
    durablesLog,
    consumablesLog,
    auditLogs,
    strategicBottlenecks,
    recommendations
  }
}
