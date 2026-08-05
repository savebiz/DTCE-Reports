'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NumberField } from '@/components/ui/number-field'
import { CurrencyField } from '@/components/ui/currency-field'

export interface FieldSchema {
  name: string
  label: string
  type: 'number' | 'text' | 'select' | 'repeat-group' | 'computed'
  options?: string[]
  required?: boolean
  schema?: FieldSchema[]
  computeFormula?: 'row_index' | 'sum_fields' | string
  sumOf?: string[]
}

export interface SchemaFormRendererProps {
  fields: FieldSchema[]
  value: any
  onChange: (value: any) => void
  readOnly?: boolean
  rowIndex?: number
}

export function SchemaFormRenderer({ fields, value, onChange, readOnly = false, rowIndex }: SchemaFormRendererProps) {
  const handleFieldChange = (name: string, fieldValue: any) => {
    onChange({
      ...value,
      [name]: fieldValue,
    })
  }

  // Recursive field renderer
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
              <div className="rounded-md bg-slate-50 p-2.5 text-sm dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {fieldValue || <span className="text-slate-400 italic">None</span>}
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

      case 'number':
        const numVal = fieldValue === undefined || fieldValue === null ? 0 : Number(fieldValue)
        const isCurrency = field.name.toLowerCase().includes('amount') ||
                           field.name.toLowerCase().includes('collected') ||
                           field.name.toLowerCase().includes('revenue') ||
                           field.name.toLowerCase().includes('offering') ||
                           field.name.toLowerCase().includes('price') ||
                           field.label.includes('₦') ||
                           field.label.toLowerCase().includes('amount')

        return (
          <div key={fieldId} className="space-y-2">
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            {readOnly ? (
              <div className="rounded-md bg-slate-50 p-2.5 text-sm dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono">
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

      case 'computed':
        let computedVal = fieldValue
        if (field.computeFormula === 'row_index') {
          computedVal = (rowIndex !== undefined ? rowIndex + 1 : (fieldValue || 1))
        } else if (field.computeFormula === 'sum_fields' && Array.isArray(field.sumOf)) {
          computedVal = field.sumOf.reduce((sum, fName) => {
            const raw = value?.[fName]
            return sum + (Number(raw) || 0)
          }, 0)
        }

        const isCompCurrency = field.name.toLowerCase().includes('offering') || field.label.includes('₦')

        return (
          <div key={fieldId} className="space-y-1.5">
            <Label htmlFor={fieldId} className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              {field.label}
            </Label>
            <div className="rounded-md bg-slate-900/60 p-2.5 text-sm font-mono font-bold text-foreground border border-border/80 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground font-sans">
                {field.computeFormula === 'sum_fields' ? 'Calculated Total' : 'Auto S/N'}
              </span>
              <span className="text-emerald-400 font-extrabold text-base">
                {isCompCurrency ? `₦${Number(computedVal || 0).toLocaleString()}` : Number(computedVal || 0).toLocaleString()}
              </span>
            </div>
          </div>
        )

      case 'select':
        return (
          <div key={fieldId} className="space-y-2">
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            {readOnly ? (
              <div className="rounded-md bg-slate-50 p-2.5 text-sm dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {fieldValue || <span className="text-slate-400 italic">Not selected</span>}
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

      case 'repeat-group':
        const groupValues = Array.isArray(fieldValue) ? fieldValue : []

        const handleAddGroupRow = () => {
          if (readOnly) return
          const newRow = {}
          onChange({
            ...value,
            [field.name]: [...groupValues, newRow],
          })
        }

        const handleRemoveGroupRow = (index: number) => {
          if (readOnly) return
          const updated = [...groupValues]
          updated.splice(index, 1)
          onChange({
            ...value,
            [field.name]: updated,
          })
        }

        const handleGroupRowChange = (index: number, rowVal: any) => {
          const updated = [...groupValues]
          updated[index] = rowVal
          onChange({
            ...value,
            [field.name]: updated,
          })
        }

        return (
          <div key={fieldId} className="space-y-4 border-l-2 border-amber-500/40 pl-4 py-2 my-6 bg-muted/10 rounded-r-xl p-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-amber-500 uppercase tracking-wider">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </h4>
              {!readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={handleAddGroupRow} className="border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-bold">
                  + Add Row
                </Button>
              )}
            </div>

            {groupValues.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2">
                No items added yet. Click "+ Add Row" to begin.
              </p>
            )}

            <div className="space-y-6">
              {groupValues.map((row, idx) => (
                <CardKeyedRow
                  key={idx}
                  index={idx}
                  field={field}
                  row={row}
                  readOnly={readOnly}
                  onRemove={handleRemoveGroupRow}
                  onChange={handleGroupRowChange}
                  path={`${path}-${idx}`}
                />
              ))}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // Render fields cleanly with grid pairing for paired fields (e.g. male/female, teachers_male/teachers_female)
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

// Separate helper component for rendering a single repeat-group row inside a card for better visual grouping
function CardKeyedRow({
  field,
  row,
  index,
  readOnly,
  onRemove,
  onChange,
  path,
}: {
  field: FieldSchema
  row: any
  index: number
  readOnly: boolean
  onRemove: (idx: number) => void
  onChange: (idx: number, val: any) => void
  path: string
}) {
  return (
    <div className="relative rounded-xl border border-border/80 bg-card p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <span className="text-xs font-bold text-amber-500 font-mono">Row #{index + 1}</span>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/20 font-bold"
            onClick={() => onRemove(index)}
          >
            ✕ Remove
          </Button>
        )}
      </div>

      <div className="grid gap-3 pt-1">
        <SchemaFormRenderer
          fields={field.schema || []}
          value={row}
          onChange={(val) => onChange(index, val)}
          readOnly={readOnly}
          rowIndex={index}
        />
      </div>
    </div>
  )
}
