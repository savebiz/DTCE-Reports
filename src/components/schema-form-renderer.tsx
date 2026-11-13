'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NumberField } from '@/components/ui/number-field'
import { CurrencyField } from '@/components/ui/currency-field'
import { ChevronDown, ChevronRight, Plus, Sparkles, Trash2, X } from 'lucide-react'

export interface RepeatGroupPreset {
  label: string
  rows: Record<string, any>[]
}

export interface FieldSchema {
  name: string
  label: string
  type: 'number' | 'text' | 'select' | 'repeat-group' | 'computed'
  options?: string[]
  required?: boolean
  schema?: FieldSchema[]
  computeFormula?: 'row_index' | 'sum_fields' | string
  sumOf?: string[]
  presets?: RepeatGroupPreset[]
}

export interface SchemaFormRendererProps {
  fields: FieldSchema[]
  value: any
  onChange: (value: any) => void
  readOnly?: boolean
  rowIndex?: number
}

function isCurrencyField(field: FieldSchema): boolean {
  const n = field.name.toLowerCase()
  const l = field.label.toLowerCase()
  return (
    n.includes('amount') ||
    n.includes('collected') ||
    n.includes('revenue') ||
    n.includes('offering') ||
    n.includes('price') ||
    field.label.includes('₦') ||
    l.includes('amount')
  )
}

function computeCellValue(field: FieldSchema, row: any, rowIndex: number): number | string {
  if (field.computeFormula === 'row_index') {
    return rowIndex + 1
  }
  if (field.computeFormula === 'sum_fields' && Array.isArray(field.sumOf)) {
    return field.sumOf.reduce((sum, fName) => sum + (Number(row?.[fName]) || 0), 0)
  }
  return row?.[field.name] ?? 0
}

export function SchemaFormRenderer({ fields, value, onChange, readOnly = false, rowIndex }: SchemaFormRendererProps) {
  const handleFieldChange = (name: string, fieldValue: any) => {
    onChange({
      ...value,
      [name]: fieldValue,
    })
  }

  const renderField = (field: FieldSchema, fieldValue: any, path: string) => {
    const fieldId = `${path}-${field.name}`

    switch (field.type) {
      case 'text':
        return (
          <div key={fieldId} className="space-y-2">
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            {readOnly ? (
              <div className="rounded-md bg-muted/50 p-2.5 text-sm border border-border">
                {fieldValue || <span className="text-muted-foreground italic">None</span>}
              </div>
            ) : (
              <Input
                id={fieldId}
                type="text"
                value={fieldValue || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                required={field.required}
                className="h-10"
              />
            )}
          </div>
        )

      case 'number': {
        const numVal = fieldValue === undefined || fieldValue === null ? 0 : Number(fieldValue)
        const isCurrency = isCurrencyField(field)

        return (
          <div key={fieldId} className="space-y-2">
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            {readOnly ? (
              <div className="rounded-md bg-muted/50 p-2.5 text-sm border border-border font-mono">
                {isCurrency ? `₦${numVal.toLocaleString()}` : numVal}
              </div>
            ) : isCurrency ? (
              <CurrencyField
                id={fieldId}
                value={numVal}
                onChange={(val) => handleFieldChange(field.name, val)}
                disabled={readOnly}
              />
            ) : (
              <NumberField
                id={fieldId}
                value={numVal}
                onChange={(val) => handleFieldChange(field.name, val)}
                showStepperButtons={true}
              />
            )}
          </div>
        )
      }

      case 'computed': {
        let computedVal = fieldValue
        if (field.computeFormula === 'row_index') {
          computedVal = rowIndex !== undefined ? rowIndex + 1 : (fieldValue || 1)
        } else if (field.computeFormula === 'sum_fields' && Array.isArray(field.sumOf)) {
          computedVal = field.sumOf.reduce((sum, fName) => {
            const raw = value?.[fName]
            return sum + (Number(raw) || 0)
          }, 0)
        }

        const isCompCurrency = isCurrencyField(field)

        return (
          <div key={fieldId} className="space-y-1.5">
            <Label htmlFor={fieldId} className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              {field.label}
            </Label>
            <div className="rounded-md bg-muted/50 p-2.5 text-sm font-mono font-bold text-foreground border border-border/80 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground font-sans">
                {field.computeFormula === 'sum_fields' ? 'Calculated Total' : 'Auto S/N'}
              </span>
              <span className="text-emerald-700 dark:text-emerald-400 font-extrabold text-base">
                {isCompCurrency ? `₦${Number(computedVal || 0).toLocaleString()}` : Number(computedVal || 0).toLocaleString()}
              </span>
            </div>
          </div>
        )
      }

      case 'select':
        return (
          <div key={fieldId} className="space-y-2">
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            {readOnly ? (
              <div className="rounded-md bg-muted/50 p-2.5 text-sm border border-border">
                {fieldValue || <span className="text-muted-foreground italic">Not selected</span>}
              </div>
            ) : (
              <Select
                value={fieldValue || ''}
                onValueChange={(val) => handleFieldChange(field.name, val)}
              >
                <SelectTrigger id={fieldId} className="h-10">
                  <SelectValue placeholder="Select an option..." />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )

      case 'repeat-group': {
        const groupValues = Array.isArray(fieldValue) ? fieldValue : []
        return (
          <RepeatGroupSection
            key={fieldId}
            field={field}
            groupValues={groupValues}
            readOnly={readOnly}
            path={path}
            onUpdate={(nextRows) =>
              onChange({
                ...value,
                [field.name]: nextRows,
              })
            }
          />
        )
      }

      default:
        return null
    }
  }

  const renderedElements: React.ReactNode[] = []
  let i = 0

  while (i < fields.length) {
    const curr = fields[i]
    const next = fields[i + 1]

    const isPairedGroup =
      (curr.name === 'male' && next?.name === 'female') ||
      (curr.name === 'teachers_male' && next?.name === 'teachers_female')

    if (isPairedGroup) {
      renderedElements.push(
        <div key={`paired-${curr.name}-${next.name}`} className="grid grid-cols-2 gap-3">
          {renderField(curr, value?.[curr.name], 'form')}
          {renderField(next, value?.[next.name], 'form')}
        </div>
      )
      i += 2
    } else {
      renderedElements.push(renderField(curr, value?.[curr.name], 'form'))
      i += 1
    }
  }

  return <div className="space-y-4">{renderedElements}</div>
}

/** Collapsible repeat-group section with hybrid Desktop Table + Mobile Accordion Cards + Presets */
function RepeatGroupSection({
  field,
  groupValues,
  readOnly,
  path,
  onUpdate,
}: {
  field: FieldSchema
  groupValues: any[]
  readOnly: boolean
  path: string
  onUpdate: (rows: any[]) => void
}) {
  const [sectionOpen, setSectionOpen] = useState(true)
  const [expandedMobileRows, setExpandedMobileRows] = useState<Record<number, boolean>>({ 0: true })

  const subFields = field.schema || []

  const handleAddGroupRow = () => {
    if (readOnly) return
    const nextIdx = groupValues.length
    setSectionOpen(true)
    setExpandedMobileRows((prev) => ({ ...prev, [nextIdx]: true }))
    onUpdate([...groupValues, {}])
  }

  const handleApplyPreset = (preset: RepeatGroupPreset) => {
    if (readOnly) return
    setSectionOpen(true)
    const firstKey = subFields.find((s) => s.type !== 'computed')?.name
    if (!firstKey || groupValues.length === 0) {
      onUpdate(preset.rows.map((r) => ({ ...r })))
      return
    }
    const existingKeys = new Set(groupValues.map((r) => String(r?.[firstKey] || '').toLowerCase()))
    const missing = preset.rows.filter((r) => !existingKeys.has(String(r?.[firstKey] || '').toLowerCase()))
    if (missing.length > 0) {
      onUpdate([...groupValues, ...missing.map((r) => ({ ...r }))])
    }
  }

  const handleRemoveGroupRow = (index: number) => {
    if (readOnly) return
    const updated = [...groupValues]
    updated.splice(index, 1)
    onUpdate(updated)
  }

  const handleGroupRowChange = (index: number, rowVal: any) => {
    const updated = [...groupValues]
    updated[index] = rowVal
    onUpdate(updated)
  }

  const handleCellChange = (rowIndex: number, subName: string, cellVal: any) => {
    const updated = [...groupValues]
    updated[rowIndex] = { ...(updated[rowIndex] || {}), [subName]: cellVal }
    onUpdate(updated)
  }

  const numericCols = subFields.filter((sub) => sub.type === 'number' || (sub.type === 'computed' && sub.computeFormula === 'sum_fields'))

  const getColumnSum = (sub: FieldSchema): number => {
    return groupValues.reduce((acc, r, idx) => {
      if (sub.type === 'computed') {
        return acc + Number(computeCellValue(sub, r, idx) || 0)
      }
      return acc + (Number(r?.[sub.name]) || 0)
    }, 0)
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-card/60 overflow-hidden shadow-xs">
      {/* Collapsible Accordion Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
        <button
          type="button"
          onClick={() => setSectionOpen((o) => !o)}
          className="flex items-center gap-2 text-left cursor-pointer min-w-0 flex-1"
        >
          {sectionOpen ? (
            <ChevronDown className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
          )}
          <span className="text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider truncate">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-background/80 text-foreground border border-border shrink-0">
            {groupValues.length} {groupValues.length === 1 ? 'row' : 'rows'}
          </span>
        </button>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1.5">
            {field.presets?.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyPreset(preset)}
                className="h-8 px-2.5 text-[11px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold cursor-pointer"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                {preset.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddGroupRow}
              className="h-8 px-2.5 text-[11px] border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15 font-bold cursor-pointer"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Row
            </Button>
          </div>
        )}
      </div>

      {sectionOpen && (
        <div className="p-3 sm:p-4 space-y-3">
          {groupValues.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              No rows added yet.{!readOnly ? ' Click "+ Add Row" or use a quick-fill preset above to begin.' : ''}
            </p>
          ) : (
            <>
              {/* DESKTOP: Compact Spreadsheet Table (md and up) */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border text-left">
                      <th className="px-2.5 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[10px] w-10">#</th>
                      {subFields.map((sub) => (
                        <th
                          key={sub.name}
                          className={`px-2.5 py-2 font-bold text-muted-foreground uppercase tracking-wider text-[10px] whitespace-nowrap ${
                            sub.type === 'number' || sub.type === 'computed' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {sub.label} {sub.required && <span className="text-red-500">*</span>}
                        </th>
                      ))}
                      {!readOnly && <th className="px-2 py-2 w-9" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {groupValues.map((row, idx) => (
                      <tr key={idx} className="hover:bg-muted/20 transition-colors">
                        <td className="px-2.5 py-2 font-mono text-[11px] text-muted-foreground">{idx + 1}</td>
                        {subFields.map((sub) => {
                          const cellVal = row?.[sub.name]
                          if (sub.type === 'computed') {
                            const comp = computeCellValue(sub, row, idx)
                            const isCompCurr = isCurrencyField(sub)
                            return (
                              <td key={sub.name} className="px-2.5 py-2 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                                {isCompCurr ? `₦${Number(comp || 0).toLocaleString()}` : Number(comp || 0).toLocaleString()}
                              </td>
                            )
                          }
                          if (readOnly) {
                            const isCurr = sub.type === 'number' && isCurrencyField(sub)
                            return (
                              <td key={sub.name} className={`px-2.5 py-2 ${sub.type === 'number' ? 'text-right font-mono' : ''}`}>
                                {sub.type === 'number'
                                  ? isCurr
                                    ? `₦${Number(cellVal || 0).toLocaleString()}`
                                    : Number(cellVal || 0).toLocaleString()
                                  : cellVal || '—'}
                              </td>
                            )
                          }
                          if (sub.type === 'select') {
                            return (
                              <td key={sub.name} className="px-1.5 py-1.5 min-w-[140px]">
                                <Select
                                  value={cellVal || ''}
                                  onValueChange={(val) => handleCellChange(idx, sub.name, val)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {sub.options?.map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                            )
                          }
                          if (sub.type === 'number') {
                            return (
                              <td key={sub.name} className="px-1.5 py-1.5 text-right min-w-[88px]">
                                <input
                                  type="number"
                                  min={0}
                                  value={cellVal === undefined || cellVal === null ? '' : cellVal}
                                  placeholder="0"
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    handleCellChange(idx, sub.name, e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))
                                  }
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-mono text-right text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                              </td>
                            )
                          }
                          return (
                            <td key={sub.name} className="px-1.5 py-1.5 min-w-[130px]">
                              <Input
                                type="text"
                                value={cellVal || ''}
                                onChange={(e) => handleCellChange(idx, sub.name, e.target.value)}
                                className="h-8 text-xs"
                              />
                            </td>
                          )
                        })}
                        {!readOnly && (
                          <td className="px-1.5 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveGroupRow(idx)}
                              title="Remove row"
                              className="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {numericCols.length > 0 && (
                    <tfoot>
                      <tr className="bg-amber-500/5 border-t border-amber-500/25 font-bold">
                        <td className="px-2.5 py-2 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          Sum
                        </td>
                        {subFields.map((sub) => {
                          if (sub.type === 'number' || (sub.type === 'computed' && sub.computeFormula === 'sum_fields')) {
                            const sum = getColumnSum(sub)
                            return (
                              <td key={sub.name} className="px-2.5 py-2 text-right font-mono text-foreground whitespace-nowrap">
                                {isCurrencyField(sub) ? `₦${sum.toLocaleString()}` : sum.toLocaleString()}
                              </td>
                            )
                          }
                          return <td key={sub.name} className="px-2.5 py-2" />
                        })}
                        {!readOnly && <td />}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* MOBILE: Collapsible Compact Card Rows (< md) */}
              <div className="md:hidden space-y-2.5">
                {groupValues.map((row, idx) => (
                  <CardKeyedRow
                    key={idx}
                    index={idx}
                    field={field}
                    row={row}
                    readOnly={readOnly}
                    expanded={!!expandedMobileRows[idx]}
                    onToggleExpand={() =>
                      setExpandedMobileRows((prev) => ({ ...prev, [idx]: !prev[idx] }))
                    }
                    onRemove={handleRemoveGroupRow}
                    onChange={handleGroupRowChange}
                    path={`${path}-${idx}`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Live Section Totals Summary Strip */}
          {groupValues.length > 0 && numericCols.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-2.5 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
                Live {field.label} Totals ({groupValues.length} {groupValues.length === 1 ? 'Row' : 'Rows'})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {numericCols.map((sub) => {
                  const colSum = getColumnSum(sub)
                  return (
                    <div
                      key={sub.name}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-card border border-border px-2.5 py-1 text-xs"
                    >
                      <span className="text-muted-foreground">{sub.label}:</span>
                      <span className="font-mono font-bold text-foreground">
                        {isCurrencyField(sub) ? `₦${colSum.toLocaleString()}` : colSum.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CardKeyedRow({
  field,
  row,
  index,
  readOnly,
  expanded,
  onToggleExpand,
  onRemove,
  onChange,
  path,
}: {
  field: FieldSchema
  row: any
  index: number
  readOnly: boolean
  expanded: boolean
  onToggleExpand: () => void
  onRemove: (idx: number) => void
  onChange: (idx: number, val: any) => void
  path: string
}) {
  const subFields = field.schema || []
  const primaryTextField = subFields.find((s) => s.type === 'select' || s.type === 'text')
  const primaryLabel = primaryTextField && row?.[primaryTextField.name] ? String(row[primaryTextField.name]) : `Row #${index + 1}`

  const summaryBits = subFields
    .filter((s) => s.type === 'number' || (s.type === 'computed' && s.computeFormula === 'sum_fields'))
    .slice(0, 2)
    .map((s) => {
      const val = s.type === 'computed' ? computeCellValue(s, row, index) : Number(row?.[s.name] || 0)
      return isCurrencyField(s) ? `₦${Number(val).toLocaleString()}` : `${s.label}: ${Number(val).toLocaleString()}`
    })

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-muted/30">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <span className="text-xs font-bold text-foreground truncate block">
              #{index + 1} · {primaryLabel}
            </span>
            {!expanded && summaryBits.length > 0 && (
              <span className="text-[11px] font-mono text-muted-foreground truncate block">
                {summaryBits.join(' · ')}
              </span>
            )}
          </div>
        </button>

        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(index)}
            className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {expanded && (
        <div className="p-3.5 border-t border-border/60">
          <SchemaFormRenderer
            fields={subFields}
            value={row || {}}
            onChange={(updatedRow) => onChange(index, updatedRow)}
            readOnly={readOnly}
            rowIndex={index}
          />
        </div>
      )}
    </div>
  )
}
