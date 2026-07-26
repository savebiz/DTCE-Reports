import { InventoryItem } from '@/utils/supabase/mockData'

export interface CatalogValidationRow {
  rowIndex: number
  name: string
  item_code: string
  category: string
  unit: string
  initial_stock: number
  low_stock_threshold: number
  isValid: boolean
  errorReason?: string
}

export interface RestockValidationRow {
  rowIndex: number
  item_code: string
  item_name: string
  quantity_to_add: number
  note: string
  matchedItemId?: string
  matchedItemName?: string
  matchedItemCode?: string
  currentStock?: number
  calculatedNewStock?: number
  unit?: string
  isValid: boolean
  errorReason?: string
}

/**
 * Downloads pre-formatted CSV template for Bulk Catalog Creation
 */
export function downloadCatalogTemplate() {
  const headers = ['Item Name', 'Item Code', 'Category', 'Unit', 'Initial Stock', 'Low Stock Threshold']
  const rows = [
    ['A4 Printing Paper (80gsm)', 'PAP-001', 'consumable', 'reams', '50', '10'],
    ['Executive Conference Chairs', 'CHR-002', 'durable', 'pcs', '20', '5'],
    ['Public Address System Speakers', 'PA-003', 'durable', 'sets', '2', '1'],
    ['Whiteboard Markers (Black)', 'MRK-004', 'consumable', 'packs', '15', '3'],
  ]

  const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
  triggerFileDownload(csvContent, 'dtce_bulk_catalog_template.csv')
}

/**
 * Downloads pre-formatted CSV template for Bulk Restock
 */
export function downloadRestockTemplate() {
  const headers = ['Item Code', 'Item Name', 'Quantity to Add', 'Note']
  const rows = [
    ['PAP-001', 'A4 Printing Paper (80gsm)', '25', 'Purchased 25 reams from central supplier'],
    ['CHR-002', 'Executive Conference Chairs', '5', 'Restocked 5 replacement chairs'],
    ['', 'Whiteboard Markers (Black)', '10', 'Restocked 10 packs by name match'],
  ]

  const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
  triggerFileDownload(csvContent, 'dtce_bulk_restock_template.csv')
}

function triggerFileDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * RFC 4180 compliant CSV parser
 */
export async function parseCsvFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        if (!text) return resolve([])

        const lines = parseCsvLines(text)
        if (lines.length === 0) return resolve([])

        const headers = lines[0].map(h => normalizeHeader(h))
        const dataRows: any[] = []

        for (let i = 1; i < lines.length; i++) {
          const rowValues = lines[i]
          if (rowValues.length === 0 || (rowValues.length === 1 && !rowValues[0].trim())) continue

          const rowObj: Record<string, any> = {}
          headers.forEach((h, idx) => {
            rowObj[h] = rowValues[idx] !== undefined ? rowValues[idx].trim() : ''
          })
          dataRows.push(rowObj)
        }

        resolve(dataRows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsText(file)
  })
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseCsvLines(text: string): string[][] {
  const lines: string[][] = []
  let currentRow: string[] = []
  let currentToken = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentToken += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentToken)
      currentToken = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++
      }
      currentRow.push(currentToken)
      currentToken = ''
      if (currentRow.some(c => c.trim().length > 0)) {
        lines.push(currentRow)
      }
      currentRow = []
    } else {
      currentToken += char
    }
  }

  if (currentToken.length > 0 || currentRow.length > 0) {
    currentRow.push(currentToken)
    if (currentRow.some(c => c.trim().length > 0)) {
      lines.push(currentRow)
    }
  }

  return lines
}

/**
 * Validates parsed rows for Bulk Catalog Creation
 */
export function validateCatalogRows(
  rows: any[],
  existingItems: InventoryItem[]
): { rows: CatalogValidationRow[]; validCount: number; invalidCount: number } {
  const result: CatalogValidationRow[] = []
  const seenCodes = new Set<string>()
  const seenNames = new Set<string>()

  // Populate existing codes & names
  existingItems.forEach(i => {
    if (i.item_code) seenCodes.add(i.item_code.toUpperCase())
    seenNames.add(i.name.toLowerCase())
  })

  let validCount = 0
  let invalidCount = 0

  rows.forEach((r, idx) => {
    const name = r.item_name || r.name || r.item || ''
    const item_code = (r.item_code || r.code || '').toUpperCase()
    const category = (r.category || '').toLowerCase()
    const unit = r.unit || 'pcs'
    const initial_stock = Number(r.initial_stock || r.stock || r.opening_stock || 0)
    const low_stock_threshold = Number(r.low_stock_threshold || r.threshold || 5)

    let isValid = true
    const errors: string[] = []

    if (!name.trim()) {
      isValid = false
      errors.push('Missing item name')
    } else if (seenNames.has(name.trim().toLowerCase())) {
      isValid = false
      errors.push(`Item name "${name.trim()}" already exists in catalog`)
    }

    if (!['durable', 'consumable'].includes(category)) {
      isValid = false
      errors.push(`Invalid category "${category || 'empty'}". Must be "durable" or "consumable"`)
    }

    if (!unit.trim()) {
      isValid = false
      errors.push('Missing unit of measurement')
    }

    if (isNaN(initial_stock) || initial_stock < 0) {
      isValid = false
      errors.push('Initial stock must be a non-negative number')
    }

    if (isNaN(low_stock_threshold) || low_stock_threshold < 0) {
      isValid = false
      errors.push('Low stock threshold must be a non-negative number')
    }

    if (item_code) {
      if (seenCodes.has(item_code)) {
        isValid = false
        errors.push(`Item code "${item_code}" is a duplicate (already exists in catalog or batch)`)
      } else {
        seenCodes.add(item_code)
      }
    }

    if (name.trim() && isValid) {
      seenNames.add(name.trim().toLowerCase())
    }

    if (isValid) {
      validCount++
    } else {
      invalidCount++
    }

    result.push({
      rowIndex: idx + 1,
      name: name.trim(),
      item_code: item_code.trim(),
      category: category.trim(),
      unit: unit.trim(),
      initial_stock: isNaN(initial_stock) ? 0 : initial_stock,
      low_stock_threshold: isNaN(low_stock_threshold) ? 5 : low_stock_threshold,
      isValid,
      errorReason: errors.join('; ')
    })
  })

  return { rows: result, validCount, invalidCount }
}

/**
 * Validates parsed rows for Bulk Restock
 */
export function validateRestockRows(
  rows: any[],
  existingItems: InventoryItem[]
): { rows: RestockValidationRow[]; validCount: number; invalidCount: number } {
  const result: RestockValidationRow[] = []

  let validCount = 0
  let invalidCount = 0

  rows.forEach((r, idx) => {
    const item_code = (r.item_code || r.code || '').toUpperCase().trim()
    const item_name = (r.item_name || r.name || r.item || '').trim()
    const quantity_to_add = Number(r.quantity_to_add || r.quantity || r.qty || 0)
    const note = (r.note || r.supplier || r.reference || '').trim()

    let isValid = true
    const errors: string[] = []

    if (isNaN(quantity_to_add) || quantity_to_add <= 0) {
      isValid = false
      errors.push('Quantity to add must be greater than 0')
    }

    // Match item by item_code first, then exact name match
    let matchedItem: InventoryItem | undefined

    if (item_code) {
      matchedItem = existingItems.find(i => (i.item_code || '').toUpperCase() === item_code)
    }

    if (!matchedItem && item_name) {
      matchedItem = existingItems.find(i => i.name.toLowerCase() === item_name.toLowerCase())
    }

    if (!matchedItem) {
      isValid = false
      errors.push(`No catalog match found for code "${item_code}" or name "${item_name}"`)
    }

    if (isValid) {
      validCount++
    } else {
      invalidCount++
    }

    const currentStock = matchedItem ? matchedItem.current_stock : 0
    const calculatedNewStock = matchedItem ? currentStock + (isNaN(quantity_to_add) ? 0 : quantity_to_add) : 0

    result.push({
      rowIndex: idx + 1,
      item_code,
      item_name,
      quantity_to_add: isNaN(quantity_to_add) ? 0 : quantity_to_add,
      note,
      matchedItemId: matchedItem?.id,
      matchedItemName: matchedItem?.name,
      matchedItemCode: matchedItem?.item_code,
      currentStock,
      calculatedNewStock,
      unit: matchedItem?.unit || 'units',
      isValid,
      errorReason: errors.join('; ')
    })
  })

  return { rows: result, validCount, invalidCount }
}
