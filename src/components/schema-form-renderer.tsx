'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface FieldSchema {
  name: string
  label: string
  type: 'number' | 'text' | 'select' | 'repeat-group'
  options?: string[]
  required?: boolean
  schema?: FieldSchema[]
}

export interface SchemaFormRendererProps {
  fields: FieldSchema[]
  value: any
  onChange: (value: any) => void
  readOnly?: boolean
}

export function SchemaFormRenderer({ fields, value, onChange, readOnly = false }: SchemaFormRendererProps) {
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
        return (
          <div key={fieldId} className="space-y-2">
            <Label htmlFor={fieldId} className="text-sm font-medium">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            {readOnly ? (
              <div className="rounded-md bg-slate-50 p-2.5 text-sm dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono">
                {numVal}
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 font-bold"
                  onClick={() => handleFieldChange(field.name, Math.max(0, numVal - 1))}
                >
                  -
                </Button>
                <Input
                  id={fieldId}
                  type="number"
                  value={numVal}
                  onChange={(e) => handleFieldChange(field.name, Math.max(0, parseInt(e.target.value) || 0))}
                  required={field.required}
                  className="h-10 text-center font-mono text-lg"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 font-bold"
                  onClick={() => handleFieldChange(field.name, numVal + 1)}
                >
                  +
                </Button>
              </div>
            )}
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
          <div key={fieldId} className="space-y-4 border-l-2 border-border pl-4 py-2 my-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </h4>
              {!readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={handleAddGroupRow} className="border-border text-foreground">
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

  return (
    <div className="space-y-6">
      {fields.map((field) => renderField(field, value?.[field.name], 'form'))}
    </div>
  )
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
    <div className="relative rounded-lg border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/80 dark:bg-slate-900/40">
      <div className="absolute right-3 top-3 flex items-center space-x-2">
        <span className="text-xs font-semibold text-slate-400 font-mono">#{index + 1}</span>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
            onClick={() => onRemove(index)}
          >
            ✕
          </Button>
        )}
      </div>

      <div className="grid gap-4 pt-2">
        <SchemaFormRenderer
          fields={field.schema || []}
          value={row}
          onChange={(val) => onChange(index, val)}
          readOnly={readOnly}
        />
      </div>
    </div>
  )
}
