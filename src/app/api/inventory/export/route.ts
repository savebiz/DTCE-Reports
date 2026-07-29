import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/utils/supabase/admin'
import { isMock } from '@/utils/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

function escapeXml(unsafe: string): string {
  if (!unsafe) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * GET /api/inventory/export
 * High-performance server-side document export endpoint for CSV, Excel (.xlsx), and PDF.
 * Supports multi-section comprehensive exports covering Stock Summary, Dept Consumption, and Fulfillment History.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const reportType = searchParams.get('reportType') || 'comprehensive_oversight'
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

    // Helper functions for fetching datasets
    const getStockSummary = async () => {
      if (isMock) {
        const { store: mockStore } = require('@/utils/supabase/mockClient')
        const items = mockStore.inventoryItems || []
        const transactions = mockStore.inventoryTransactions || []
        let filtered = items
        if (itemIds.length > 0) filtered = filtered.filter((i: any) => itemIds.includes(i.id))
        return filtered.map((i: any) => {
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
      } else {
        const supabaseAdmin = getAdminClient()
        const { data } = await supabaseAdmin.rpc('get_inventory_stock_summary')
        let res = data || []
        if (itemIds.length > 0) res = res.filter((i: any) => itemIds.includes(i.id))
        return res
      }
    }

    const getDeptConsumption = async () => {
      if (isMock) {
        const { store: mockStore } = require('@/utils/supabase/mockClient')
        const items = mockStore.inventoryItems || []
        const transactions = mockStore.inventoryTransactions || []
        const reqs = mockStore.storeRequests || []
        const depts = mockStore.departments || mockStore.mockDepartments || []

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
        return Array.from(map.values()).sort((a, b) => b.total_fulfilled_qty - a.total_fulfilled_qty)
      } else {
        const supabaseAdmin = getAdminClient()
        const { data } = await supabaseAdmin.rpc('get_inventory_department_consumption', {
          p_start_date: startDate || null,
          p_end_date: endDate || null,
          p_dept_ids: deptIds.length > 0 ? deptIds : null,
          p_item_ids: itemIds.length > 0 ? itemIds : null
        })
        return data || []
      }
    }

    const getFulfillmentHistory = async () => {
      if (isMock) {
        const { store: mockStore } = require('@/utils/supabase/mockClient')
        const items = mockStore.inventoryItems || []
        const transactions = mockStore.inventoryTransactions || []
        const reqs = mockStore.storeRequests || []
        const depts = mockStore.departments || mockStore.mockDepartments || []

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
        return history
      } else {
        const supabaseAdmin = getAdminClient()
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
        let history = (rawTrans || []).map((t: any) => ({
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
        if (itemIds.length > 0) history = history.filter((h: any) => itemIds.includes(h.item_id))
        if (deptIds.length > 0) history = history.filter((h: any) => h.department_id && deptIds.includes(h.department_id))
        return history
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    const isComprehensive = reportType === 'comprehensive_oversight' || reportType === 'all'

    const [stockData, deptData, historyData] = await Promise.all([
      getStockSummary(),
      getDeptConsumption(),
      getFulfillmentHistory()
    ])

    // --- FORMAT 1: CSV EXPORT ---
    if (format === 'csv') {
      let csvContent = ''

      if (isComprehensive) {
        csvContent += `=== DTCE NATIONAL INVENTORY OVERSIGHT COMPREHENSIVE REPORT ===\n`
        csvContent += `Generated: ${new Date().toLocaleString()}\n\n`

        csvContent += `--- SECTION 1: STOCK LEVEL SUMMARY & DEFICIT FLAGS ---\n`
        csvContent += `Item Name,Category,Unit,Current Stock,Low Stock Threshold,Status,Total Restocked,Total Fulfilled\n`
        stockData.forEach(d => {
          csvContent += `"${d.name}",${d.category},${d.unit},${d.current_stock},${d.low_stock_threshold},${d.is_low_stock ? 'LOW STOCK' : 'OPTIMAL'},${d.total_restocked || 0},${d.total_fulfilled || 0}\n`
        })

        csvContent += `\n--- SECTION 2: DEPARTMENT CONSUMPTION & DISTRIBUTION EQUITY REPORT ---\n`
        csvContent += `Department Name,Material Item,Unit,Total Fulfilled Qty,Fulfillment Order Count\n`
        deptData.forEach(d => {
          csvContent += `"${d.department_name}","${d.item_name}",${d.unit},${d.total_fulfilled_qty},${d.fulfillment_count}\n`
        })

        csvContent += `\n--- SECTION 3: FULFILLMENT LEDGER AUDIT HISTORY ---\n`
        csvContent += `Timestamp,Department,Material Item,Transaction Type,Quantity Change,Resulting Stock,Audit Note\n`
        historyData.forEach(d => {
          csvContent += `"${new Date(d.timestamp).toLocaleString()}","${d.department_name}","${d.item_name}",${d.transaction_type},${d.quantity_change},${d.resulting_stock_level},"${d.note || ''}"\n`
        })
      } else {
        let headers: string[] = []
        let rows: string[][] = []

        if (reportType === 'stock_summary') {
          headers = ['Item Name', 'Category', 'Unit', 'Current Stock', 'Low Stock Threshold', 'Status', 'Total Restocked', 'Total Fulfilled']
          rows = stockData.map(d => [
            `"${d.name}"`, d.category, d.unit, String(d.current_stock), String(d.low_stock_threshold),
            d.is_low_stock ? 'LOW STOCK' : 'OPTIMAL', String(d.total_restocked || 0), String(d.total_fulfilled || 0)
          ])
        } else if (reportType === 'department_consumption') {
          headers = ['Department Name', 'Item Name', 'Unit', 'Total Fulfilled Quantity', 'Fulfillment Count']
          rows = deptData.map(d => [
            `"${d.department_name}"`, `"${d.item_name}"`, d.unit, String(d.total_fulfilled_qty), String(d.fulfillment_count)
          ])
        } else if (reportType === 'fulfillment_history') {
          headers = ['Timestamp', 'Department', 'Item Name', 'Transaction Type', 'Quantity Change', 'Resulting Stock Level', 'Audit Note']
          rows = historyData.map(d => [
            new Date(d.timestamp).toLocaleString(), `"${d.department_name}"`, `"${d.item_name}"`,
            d.transaction_type, String(d.quantity_change), String(d.resulting_stock_level), `"${d.note || ''}"`
          ])
        }

        csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      }

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="DTCE_Inventory_Oversight_${dateStr}.csv"`
        }
      })
    }

    // --- FORMAT 2: EXCEL (.xlsx / SpreadsheetML) EXPORT WITH MULTI-TAB WORKSHEETS ---
    if (format === 'xlsx') {
      const stockRowsXML = stockData.map(d => `
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

      const deptRowsXML = deptData.map(d => `
        <Row>
          <Cell><Data ss:Type="String">${escapeXml(d.department_name)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(d.item_name)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXml(d.unit)}</Data></Cell>
          <Cell><Data ss:Type="Number">${d.total_fulfilled_qty}</Data></Cell>
          <Cell><Data ss:Type="Number">${d.fulfillment_count}</Data></Cell>
        </Row>
      `).join('')

      const historyRowsXML = historyData.map(d => `
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

 <Worksheet ss:Name="Stock Level Summary">
  <Table>
   <Row ss:Height="24">
    <Cell ss:StyleID="TitleStyle"><Data ss:Type="String">Section 1: Stock Level Summary &amp; Deficits</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Item Name</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Category</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Unit</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Current Stock</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Threshold</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Restocked</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Fulfilled</Data></Cell>
   </Row>
   ${stockRowsXML}
  </Table>
 </Worksheet>

 <Worksheet ss:Name="Dept Consumption Equity">
  <Table>
   <Row ss:Height="24">
    <Cell ss:StyleID="TitleStyle"><Data ss:Type="String">Section 2: Department Consumption &amp; Equity</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Department Name</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Item Name</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Unit</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Fulfilled Qty</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Fulfillment Count</Data></Cell>
   </Row>
   ${deptRowsXML}
  </Table>
 </Worksheet>

 <Worksheet ss:Name="Fulfillment Audit History">
  <Table>
   <Row ss:Height="24">
    <Cell ss:StyleID="TitleStyle"><Data ss:Type="String">Section 3: Fulfillment Ledger Audit History</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Timestamp</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Department</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Item Name</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Transaction Type</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Quantity Change</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Resulting Stock</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Audit Note</Data></Cell>
   </Row>
   ${historyRowsXML}
  </Table>
 </Worksheet>
</Workbook>`

      return new NextResponse(excelXML, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="DTCE_Inventory_Oversight_${dateStr}.xlsx"`
        }
      })
    }

    // --- FORMAT 3: COMPREHENSIVE BRANDED PDF / PRINTABLE HTML EXPORT ---
    if (format === 'pdf') {
      const stockTableRows = stockData.map(d => `
        <tr class="${d.is_low_stock ? 'row-alert' : ''}">
          <td><strong>${escapeXml(d.name)}</strong></td>
          <td><span class="badge badge-purple">${escapeXml(d.category)}</span></td>
          <td class="font-mono">${escapeXml(d.unit)}</td>
          <td class="text-right font-mono font-bold ${d.is_low_stock ? 'text-red' : ''}">${d.current_stock}</td>
          <td class="text-right font-mono text-muted">${d.low_stock_threshold}</td>
          <td class="text-right font-mono text-green">+${d.total_restocked || 0}</td>
          <td class="text-right font-mono text-amber">-${d.total_fulfilled || 0}</td>
          <td class="text-center">
            ${d.is_low_stock ? '<span class="badge badge-red">⚠️ LOW STOCK</span>' : '<span class="badge badge-green">✓ OPTIMAL</span>'}
          </td>
        </tr>
      `).join('')

      const deptTableRows = deptData.map(d => `
        <tr>
          <td><strong>${escapeXml(d.department_name)}</strong></td>
          <td class="text-amber"><strong>${escapeXml(d.item_name)}</strong></td>
          <td class="font-mono">${escapeXml(d.unit)}</td>
          <td class="text-right font-mono font-bold">${d.total_fulfilled_qty}</td>
          <td class="text-right font-mono text-muted">${d.fulfillment_count} orders</td>
        </tr>
      `).join('')

      const historyTableRows = historyData.map(d => `
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

      const pdfHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DTCE Official Comprehensive Inventory Oversight Report</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; font-size: 11px; line-height: 1.4; background: #ffffff; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
    .header-logo { display: flex; align-items: center; gap: 12px; }
    .brand-icon { width: 36px; height: 36px; background: #0f172a; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #f59e0b; font-weight: 900; font-size: 18px; }
    .header-titles h1 { margin: 0; font-size: 16px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase; }
    .header-titles p { margin: 2px 0 0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
    .meta-item { display: flex; flex-direction: column; }
    .meta-item span.label { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-item span.val { font-weight: 700; color: #0f172a; margin-top: 2px; }
    .section-title { font-size: 13px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 10px; background: #f1f5f9; border-left: 4px solid #f59e0b; margin: 24px 0 8px; border-radius: 0 4px 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
    th { background: #0f172a; color: #ffffff; text-align: left; padding: 7px 9px; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 7px 9px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
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
    .badge { display: inline-block; padding: 2px 6px; border-radius: 9999px; font-size: 8.5px; font-weight: 800; text-transform: uppercase; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-red { background: #fee2e2; color: #b91c1c; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .badge-purple { background: #f3e8ff; color: #6b21a8; }
    .footer { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>

<body>
  <div class="no-print" style="background: #0f172a; color: #ffffff; padding: 12px 16px; margin: -20px -20px 20px; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-weight: 700; font-size: 12px;">📄 Comprehensive Inventory Oversight Document — Ready for Print / PDF Save</span>
    <button onclick="window.print()" style="background: #f59e0b; color: #000000; border: none; padding: 6px 16px; border-radius: 6px; font-weight: 800; font-size: 12px; cursor: pointer;">
      🖨️ Print / Save Full PDF Report
    </button>
  </div>

  <div class="header">
    <div class="header-logo">
      <div class="brand-icon">DT</div>
      <div class="header-titles">
        <h1>Directorate of Technical & Church Engineering</h1>
        <p>National Coordinator Executive Desk — Inventory & Material Distribution Report</p>
      </div>
    </div>
    <div style="text-align: right;">
      <span class="badge badge-amber" style="font-size: 10px; padding: 4px 10px;">NATIONAL EXECUTIVE OVERSIGHT</span>
    </div>
  </div>

  <div class="meta-card">
    <div class="meta-item">
      <span class="label">Document Scope</span>
      <span class="val">Comprehensive Multi-Section Inventory Report</span>
    </div>
    <div class="meta-item">
      <span class="label">Generated On</span>
      <span class="val">${new Date().toLocaleString()}</span>
    </div>
    <div class="meta-item">
      <span class="label">Active Filters</span>
      <span class="val">${itemIds.length > 0 ? `${itemIds.length} Items Selected` : 'All Items'} | ${deptIds.length > 0 ? `${deptIds.length} Depts Selected` : 'All Depts'}</span>
    </div>
    <div class="meta-item">
      <span class="label">Executive Sign-Off</span>
      <span class="val">National Coordinator Office</span>
    </div>
  </div>

  <!-- SECTION 1 -->
  <div class="section-title">1. Stock Level Summary &amp; Threshold Deficit Flags</div>
  <table>
    <thead>
      <tr>
        <th>Item Name</th>
        <th>Category</th>
        <th>Unit</th>
        <th class="text-right">Current Stock</th>
        <th class="text-right">Threshold</th>
        <th class="text-right">Restocked</th>
        <th class="text-right">Fulfilled</th>
        <th class="text-center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${stockTableRows || '<tr><td colSpan="8" class="text-center text-muted">No stock data available.</td></tr>'}
    </tbody>
  </table>

  <!-- SECTION 2 -->
  <div class="section-title">2. Department Consumption &amp; Distribution Equity Report</div>
  <table>
    <thead>
      <tr>
        <th>Department Name</th>
        <th>Material Item Received</th>
        <th>Unit</th>
        <th class="text-right">Total Disbursed Qty</th>
        <th class="text-right">Fulfillment Orders</th>
      </tr>
    </thead>
    <tbody>
      ${deptTableRows || '<tr><td colSpan="5" class="text-center text-muted">No department consumption data available.</td></tr>'}
    </tbody>
  </table>

  <!-- SECTION 3 -->
  <div class="section-title">3. Secondary Operational Drill-Downs: Fulfillment Audit History</div>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Department</th>
        <th>Material Item</th>
        <th>Type</th>
        <th class="text-right">Quantity Change</th>
        <th class="text-right">Resulting Stock</th>
        <th>Audit Note</th>
      </tr>
    </thead>
    <tbody>
      ${historyTableRows || '<tr><td colSpan="7" class="text-center text-muted">No fulfillment history logs available.</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    <span>DTCE Reports Platform — Official Secretariat & National Coordinator Logistics Document</span>
    <span>Generated by ${escapeXml(user.email || 'Authenticated User')}</span>
  </div>
</body>
</html>`

      return new NextResponse(pdfHTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="DTCE_Inventory_Oversight_${dateStr}.html"`
        }
      })
    }

    return NextResponse.json({ error: 'Invalid format requested. Supported formats: csv, xlsx, pdf' }, { status: 400 })
  } catch (err: any) {
    console.error('API export error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
