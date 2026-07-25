import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'
import { isMock } from '@/utils/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

/**
 * GET /api/inventory/export
 * High-performance server-side document export endpoint for CSV, Excel (.xlsx), and PDF.
 *
 * Query Params:
 * - reportType: 'stock_summary' | 'department_consumption' | 'fulfillment_history' | 'low_stock'
 * - format: 'csv' | 'xlsx' | 'pdf'
 * - startDate: ISO string (optional)
 * - endDate: ISO string (optional)
 * - itemIds: comma-separated UUIDs (optional)
 * - deptIds: comma-separated UUIDs (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('reportType') || 'stock_summary'
    const format = (searchParams.get('format') || 'csv').toLowerCase()
    const startDate = searchParams.get('startDate') || ''
    const endDate = searchParams.get('endDate') || ''
    const itemIdsParam = searchParams.get('itemIds') || ''
    const deptIdsParam = searchParams.get('deptIds') || ''

    const itemIds = itemIdsParam ? itemIdsParam.split(',').filter(Boolean) : []
    const deptIds = deptIdsParam ? deptIdsParam.split(',').filter(Boolean) : []

    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      supabaseUrl,
      anonKey,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      }
    )

    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Fetch Aggregated Report Data Server-Side (Respecting all active filters)
    let reportData: any[] = []

    if (isMock) {
      const { store: mockStore } = require('@/utils/supabase/mockClient')
      const items = mockStore.inventoryItems || []
      const transactions = mockStore.inventoryTransactions || []
      const reqs = mockStore.storeRequests || []
      const depts = mockStore.departments || mockStore.mockDepartments || []

      if (reportType === 'stock_summary') {
        let filtered = items
        if (itemIds.length > 0) filtered = filtered.filter((i: any) => itemIds.includes(i.id))
        reportData = filtered.map((i: any) => {
          const itemTrans = transactions.filter((t: any) => t.inventory_item_id === i.id)
          const restocked = itemTrans.filter((t: any) => t.transaction_type === 'restock').reduce((acc: number, t: any) => acc + (t.quantity_change || 0), 0)
          const fulfilled = Math.abs(itemTrans.filter((t: any) => t.transaction_type === 'fulfillment_deduction').reduce((acc: number, t: any) => acc + (t.quantity_change || 0), 0))
          return {
            id: i.id,
            name: i.name,
            category: i.category,
            unit: i.unit,
            current_stock: i.current_stock,
            low_stock_threshold: i.low_stock_threshold,
            is_low_stock: i.current_stock <= i.low_stock_threshold,
            total_restocked: restocked,
            total_fulfilled: fulfilled
          }
        })
      } else if (reportType === 'low_stock') {
        reportData = items
          .filter((i: any) => i.current_stock <= i.low_stock_threshold)
          .filter((i: any) => itemIds.length === 0 || itemIds.includes(i.id))
          .map((i: any) => ({
            id: i.id,
            name: i.name,
            category: i.category,
            unit: i.unit,
            current_stock: i.current_stock,
            low_stock_threshold: i.low_stock_threshold,
            shortfall: Math.max(0, i.low_stock_threshold - i.current_stock)
          }))
      } else if (reportType === 'department_consumption') {
        const map = new Map<string, any>()
        const fulfillmentTrans = transactions.filter((t: any) => t.transaction_type === 'fulfillment_deduction')
        for (const t of fulfillmentTrans) {
          if (startDate && new Date(t.created_at) < new Date(startDate)) continue
          if (endDate && new Date(t.created_at) > new Date(endDate)) continue
          if (itemIds.length > 0 && !itemIds.includes(t.inventory_item_id)) continue

          const req = reqs.find((r: any) => r.id === t.related_requisition_id)
          const deptId = req?.department_id || 'dept-1'
          if (deptIds.length > 0 && !deptIds.includes(deptId)) continue

          const deptObj = depts.find((d: any) => d.id === deptId)
          const itemObj = items.find((i: any) => i.id === t.inventory_item_id)
          const key = `${deptId}_${t.inventory_item_id}`
          if (!map.has(key)) {
            map.set(key, {
              department_id: deptId,
              department_name: deptObj?.name || 'Department',
              item_id: t.inventory_item_id,
              item_name: itemObj?.name || 'Item',
              unit: itemObj?.unit || 'pcs',
              total_fulfilled_qty: 0,
              fulfillment_count: 0
            })
          }
          const existing = map.get(key)
          existing.total_fulfilled_qty += Math.abs(t.quantity_change || 0)
          existing.fulfillment_count += 1
        }
        reportData = Array.from(map.values()).sort((a, b) => b.total_fulfilled_qty - a.total_fulfilled_qty)
      } else if (reportType === 'fulfillment_history') {
        let history = transactions.map((t: any) => {
          const req = reqs.find((r: any) => r.id === t.related_requisition_id)
          const deptId = req?.department_id || null
          const deptObj = depts.find((d: any) => d.id === deptId)
          const itemObj = items.find((i: any) => i.id === t.inventory_item_id)
          return {
            id: t.id,
            timestamp: t.created_at,
            transaction_type: t.transaction_type,
            quantity_change: t.quantity_change,
            resulting_stock_level: t.resulting_stock_level,
            note: t.note,
            item_id: t.inventory_item_id,
            item_name: itemObj?.name || 'Inventory Item',
            unit: itemObj?.unit || 'pcs',
            department_id: deptId,
            department_name: deptObj?.name || (t.transaction_type === 'restock' ? 'Central Stores' : 'General Department')
          }
        })
        if (startDate) history = history.filter((h: any) => new Date(h.timestamp) >= new Date(startDate))
        if (endDate) history = history.filter((h: any) => new Date(h.timestamp) <= new Date(endDate))
        if (itemIds.length > 0) history = history.filter((h: any) => itemIds.includes(h.item_id))
        if (deptIds.length > 0) history = history.filter((h: any) => h.department_id && deptIds.includes(h.department_id))
        reportData = history
      }
    } else {
      // Live Supabase Execution
      const supabaseAdmin = getAdminClient()
      if (reportType === 'stock_summary') {
        const { data } = await supabaseAdmin.rpc('get_inventory_stock_summary')
        reportData = data || []
        if (itemIds.length > 0) reportData = reportData.filter((i: any) => itemIds.includes(i.id))
      } else if (reportType === 'low_stock') {
        const { data } = await supabaseAdmin.rpc('get_inventory_stock_summary', { p_only_low_stock: true })
        reportData = data || []
        if (itemIds.length > 0) reportData = reportData.filter((i: any) => itemIds.includes(i.id))
      } else if (reportType === 'department_consumption') {
        const { data } = await supabaseAdmin.rpc('get_inventory_department_consumption', {
          p_start_date: startDate || null,
          p_end_date: endDate || null,
          p_dept_ids: deptIds.length > 0 ? deptIds : null,
          p_item_ids: itemIds.length > 0 ? itemIds : null
        })
        reportData = data || []
      } else if (reportType === 'fulfillment_history') {
        let query = supabaseAdmin
          .from('inventory_transactions')
          .select(`
            id, transaction_type, quantity_change, resulting_stock_level, note, created_at,
            item:inventory_items(id, name, unit),
            requisition:store_requests(department:departments(id, name))
          `)
          .order('created_at', { ascending: false })
        if (startDate) query = query.gte('created_at', startDate)
        if (endDate) query = query.lte('created_at', endDate)
        const { data: rawTrans } = await query
        reportData = (rawTrans || []).map((t: any) => ({
          id: t.id,
          timestamp: t.created_at,
          transaction_type: t.transaction_type,
          quantity_change: t.quantity_change,
          resulting_stock_level: t.resulting_stock_level,
          note: t.note,
          item_id: t.item?.id || '',
          item_name: t.item?.name || 'Item',
          unit: t.item?.unit || 'pcs',
          department_id: t.requisition?.department?.id || null,
          department_name: t.requisition?.department?.name || (t.transaction_type === 'restock' ? 'Central Stores' : 'General Department')
        }))
        if (itemIds.length > 0) reportData = reportData.filter((h: any) => itemIds.includes(h.item_id))
        if (deptIds.length > 0) reportData = reportData.filter((h: any) => h.department_id && deptIds.includes(h.department_id))
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    const reportTitleMap: Record<string, string> = {
      stock_summary: 'Stock_Level_Summary',
      department_consumption: 'Department_Consumption_Report',
      fulfillment_history: 'Fulfillment_Audit_History',
      low_stock: 'Low_Stock_Deficits_Report'
    }
    const reportTitle = reportTitleMap[reportType] || 'Inventory_Report'

    // --- FORMAT 1: CSV EXPORT ---
    if (format === 'csv') {
      let headers: string[] = []
      let rows: string[][] = []

      if (reportType === 'stock_summary') {
        headers = ['ID', 'Item Name', 'Category', 'Unit', 'Current Stock', 'Low Stock Threshold', 'Status', 'Total Restocked', 'Total Fulfilled']
        rows = reportData.map(d => [
          d.id, `"${d.name}"`, d.category, d.unit, String(d.current_stock), String(d.low_stock_threshold),
          d.is_low_stock ? 'LOW STOCK' : 'OPTIMAL', String(d.total_restocked || 0), String(d.total_fulfilled || 0)
        ])
      } else if (reportType === 'department_consumption') {
        headers = ['Department ID', 'Department Name', 'Item ID', 'Item Name', 'Unit', 'Total Fulfilled Quantity', 'Fulfillment Count']
        rows = reportData.map(d => [
          d.department_id, `"${d.department_name}"`, d.item_id, `"${d.item_name}"`, d.unit,
          String(d.total_fulfilled_qty), String(d.fulfillment_count)
        ])
      } else if (reportType === 'fulfillment_history') {
        headers = ['Transaction ID', 'Timestamp', 'Department', 'Item Name', 'Transaction Type', 'Quantity Change', 'Resulting Stock Level', 'Audit Note']
        rows = reportData.map(d => [
          d.id, new Date(d.timestamp).toLocaleString(), `"${d.department_name}"`, `"${d.item_name}"`,
          d.transaction_type, String(d.quantity_change), String(d.resulting_stock_level), `"${d.note || ''}"`
        ])
      } else if (reportType === 'low_stock') {
        headers = ['Item ID', 'Item Name', 'Category', 'Unit', 'Current Stock', 'Low Stock Threshold', 'Shortfall Deficit']
        rows = reportData.map(d => [
          d.id, `"${d.name}"`, d.category, d.unit, String(d.current_stock), String(d.low_stock_threshold),
          String(d.shortfall || Math.max(0, d.low_stock_threshold - d.current_stock))
        ])
      }

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="DTCE_${reportTitle}_${dateStr}.csv"`
        }
      })
    }

    // --- FORMAT 2: EXCEL (.xlsx / SpreadsheetML) EXPORT ---
    if (format === 'xlsx') {
      let headers: string[] = []
      let dataRowsXML = ''

      if (reportType === 'stock_summary') {
        headers = ['Item Name', 'Category', 'Unit', 'Current Stock', 'Low Stock Threshold', 'Status', 'Total Restocked', 'Total Fulfilled']
        dataRowsXML = reportData.map(d => `
          <Row>
            <Cell><Data ss:Type="String">${escapeXml(d.name)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.category)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.unit)}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.current_stock}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.low_stock_threshold}</Data></Cell>
            <Cell><Data ss:Type="String">${d.is_low_stock ? 'LOW STOCK' : 'OPTIMAL'}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.total_restocked || 0}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.total_fulfilled || 0}</Data></Cell>
          </Row>
        `).join('')
      } else if (reportType === 'department_consumption') {
        headers = ['Department Name', 'Item Name', 'Unit', 'Total Units Disbursed', 'Fulfillment Order Count']
        dataRowsXML = reportData.map(d => `
          <Row>
            <Cell><Data ss:Type="String">${escapeXml(d.department_name)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.item_name)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.unit)}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.total_fulfilled_qty}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.fulfillment_count}</Data></Cell>
          </Row>
        `).join('')
      } else if (reportType === 'fulfillment_history') {
        headers = ['Timestamp', 'Department', 'Item Name', 'Transaction Type', 'Quantity Change', 'Resulting Stock', 'Audit Note']
        dataRowsXML = reportData.map(d => `
          <Row>
            <Cell><Data ss:Type="String">${escapeXml(new Date(d.timestamp).toLocaleString())}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.department_name)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.item_name)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.transaction_type)}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.quantity_change}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.resulting_stock_level}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.note || '')}</Data></Cell>
          </Row>
        `).join('')
      } else if (reportType === 'low_stock') {
        headers = ['Item Name', 'Category', 'Unit', 'Current Stock', 'Low Stock Threshold', 'Shortfall Deficit']
        dataRowsXML = reportData.map(d => `
          <Row>
            <Cell><Data ss:Type="String">${escapeXml(d.name)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.category)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(d.unit)}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.current_stock}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.low_stock_threshold}</Data></Cell>
            <Cell><Data ss:Type="Number">${d.shortfall ?? Math.max(0, d.low_stock_threshold - d.current_stock)}</Data></Cell>
          </Row>
        `).join('')
      }

      const headerCellsXML = headers.map(h => `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')

      const excelXML = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="HeaderStyle">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Font ss:Size="14" ss:Bold="1" ss:Color="#0F172A"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${reportTitle}">
  <Table>
   <Row ss:Height="24">
    <Cell ss:StyleID="TitleStyle"><Data ss:Type="String">DTCE Reports — ${reportTitle.replace(/_/g, ' ')}</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">Generated: ${new Date().toLocaleString()} | Active Filtered Dataset: ${reportData.length} records</Data></Cell>
   </Row>
   <Row/>
   <Row ss:Height="20">
    ${headerCellsXML}
   </Row>
   ${dataRowsXML}
  </Table>
 </Worksheet>
</Workbook>`

      return new NextResponse(excelXML, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="DTCE_${reportTitle}_${dateStr}.xlsx"`
        }
      })
    }

    // --- FORMAT 3: BRANDED PDF / PRINTABLE HTML EXPORT ---
    if (format === 'pdf') {
      let headers: string[] = []
      let tableRowsHTML = ''

      if (reportType === 'stock_summary') {
        headers = ['Item Name', 'Category', 'Unit', 'Current Stock', 'Threshold', 'Restocked', 'Fulfilled', 'Status']
        tableRowsHTML = reportData.map(d => `
          <tr>
            <td><strong>${escapeXml(d.name)}</strong></td>
            <td><span class="badge badge-purple">${escapeXml(d.category)}</span></td>
            <td class="font-mono">${escapeXml(d.unit)}</td>
            <td class="text-right font-mono font-bold">${d.current_stock}</td>
            <td class="text-right font-mono text-muted">${d.low_stock_threshold}</td>
            <td class="text-right font-mono text-green">+${d.total_restocked || 0}</td>
            <td class="text-right font-mono text-amber">-${d.total_fulfilled || 0}</td>
            <td class="text-center">
              ${d.is_low_stock || d.current_stock <= d.low_stock_threshold
                ? '<span class="badge badge-red">⚠️ LOW STOCK</span>'
                : '<span class="badge badge-green">✓ OPTIMAL</span>'}
            </td>
          </tr>
        `).join('')
      } else if (reportType === 'department_consumption') {
        headers = ['Department Name', 'Material Name', 'Unit', 'Total Units Disbursed', 'Fulfillment Orders']
        tableRowsHTML = reportData.map(d => `
          <tr>
            <td><strong>${escapeXml(d.department_name)}</strong></td>
            <td class="text-amber"><strong>${escapeXml(d.item_name)}</strong></td>
            <td class="font-mono">${escapeXml(d.unit)}</td>
            <td class="text-right font-mono font-bold">${d.total_fulfilled_qty}</td>
            <td class="text-right font-mono text-muted">${d.fulfillment_count} orders</td>
          </tr>
        `).join('')
      } else if (reportType === 'fulfillment_history') {
        headers = ['Timestamp', 'Department', 'Material Item', 'Type', 'Quantity Change', 'Resulting Stock', 'Audit Note']
        tableRowsHTML = reportData.map(d => `
          <tr>
            <td class="font-mono text-muted">${new Date(d.timestamp).toLocaleString()}</td>
            <td><strong>${escapeXml(d.department_name)}</strong></td>
            <td class="text-amber"><strong>${escapeXml(d.item_name)}</strong></td>
            <td><span class="badge ${d.transaction_type === 'restock' ? 'badge-green' : 'badge-amber'}">${escapeXml(d.transaction_type)}</span></td>
            <td class="text-right font-mono font-bold ${d.quantity_change > 0 ? 'text-green' : 'text-amber'}">${d.quantity_change > 0 ? '+' : ''}${d.quantity_change} ${d.unit}</td>
            <td class="text-right font-mono font-bold">${d.resulting_stock_level} ${d.unit}</td>
            <td class="text-muted">${escapeXml(d.note || '—')}</td>
          </tr>
        `).join('')
      } else if (reportType === 'low_stock') {
        headers = ['Item Name', 'Category', 'Unit', 'Current Stock', 'Low Stock Threshold', 'Deficit Shortfall']
        tableRowsHTML = reportData.map(d => `
          <tr class="row-alert">
            <td><strong>${escapeXml(d.name)}</strong></td>
            <td><span class="badge badge-purple">${escapeXml(d.category)}</span></td>
            <td class="font-mono">${escapeXml(d.unit)}</td>
            <td class="text-right font-mono font-bold text-red">${d.current_stock}</td>
            <td class="text-right font-mono text-muted">${d.low_stock_threshold}</td>
            <td class="text-right font-mono font-bold text-red">-${d.shortfall ?? Math.max(0, d.low_stock_threshold - d.current_stock)} ${d.unit}</td>
          </tr>
        `).join('')
      }

      const headersHTML = headers.map(h => `<th>${escapeXml(h)}</th>`).join('')

      const pdfHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DTCE Official Report - ${reportTitle}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; background: #ffffff; }
    .header { display: flex; align-items: center; justify-content: space-between; border-b: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
    .header-logo { display: flex; items-center; gap: 12px; }
    .brand-icon { width: 36px; height: 36px; background: #0f172a; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #f59e0b; font-weight: 900; font-size: 18px; }
    .header-titles h1 { margin: 0; font-size: 16px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase; }
    .header-titles p { margin: 2px 0 0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
    .meta-item { display: flex; flex-direction: column; }
    .meta-item span.label { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-item span.val { font-weight: 700; color: #0f172a; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
    th { background: #0f172a; color: #ffffff; text-align: left; padding: 8px 10px; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
    tr:nth-child(even) { background-color: #f8fafc; }
    .row-alert { background-color: #fef2f2 !important; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .font-bold { font-weight: 700; }
    .text-green { color: #16a34a; }
    .text-amber { color: #d97706; }
    .text-red { color: #dc2626; }
    .text-muted { color: #64748b; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 9999px; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-red { background: #fee2e2; color: #b91c1c; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .badge-purple { background: #f3e8ff; color: #6b21a8; }
    .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: space-between; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>

<body>
  <div className="no-print" style="background: #0f172a; color: #ffffff; padding: 12px 16px; margin: -20px -20px 20px; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-weight: 700; font-size: 12px;">📄 Ready for Printing / Saving as PDF</span>
    <button onclick="window.print()" style="background: #f59e0b; color: #000000; border: none; padding: 6px 16px; border-radius: 6px; font-weight: 800; font-size: 12px; cursor: pointer;">
      🖨️ Print / Save to PDF
    </button>
  </div>

  <div class="header">
    <div class="header-logo">
      <div class="brand-icon">DT</div>
      <div class="header-titles">
        <h1>Directorate of Technical & Church Engineering</h1>
        <p>Official Inventory & Material Allocation Report</p>
      </div>
    </div>
    <div style="text-align: right;">
      <span class="badge badge-amber" style="font-size: 11px; padding: 4px 10px;">CONFIDENTIAL</span>
    </div>
  </div>

  <div class="meta-card">
    <div class="meta-item">
      <span class="label">Report Title</span>
      <span class="val">${reportTitle.replace(/_/g, ' ')}</span>
    </div>
    <div class="meta-item">
      <span class="label">Generated On</span>
      <span class="val">${new Date().toLocaleString()}</span>
    </div>
    <div class="meta-item">
      <span class="label">Filter Context</span>
      <span class="val">${itemIds.length > 0 ? `${itemIds.length} Items Selected` : 'All Items'} | ${deptIds.length > 0 ? `${deptIds.length} Depts Selected` : 'All Depts'}</span>
    </div>
    <div class="meta-item">
      <span class="label">Total Records</span>
      <span class="val">${reportData.length} records</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        ${headersHTML}
      </tr>
    </thead>
    <tbody>
      ${tableRowsHTML}
    </tbody>
  </table>

  <div class="footer">
    <span>DTCE Reports Platform — Official Secretariat & Store Logistics Document</span>
    <span>Generated by ${escapeXml(user.email || 'Authenticated User')}</span>
  </div>
</body>
</html>`

      return new NextResponse(pdfHTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="DTCE_${reportTitle}_${dateStr}.html"`
        }
      })
    }

    return NextResponse.json({ error: 'Invalid format requested. Supported formats: csv, xlsx, pdf' }, { status: 400 })
  } catch (err: any) {
    console.error('API export error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
