'use client'

import * as React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface ModernSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface ModernSelectProps {
  value?: string | number
  defaultValue?: string
  onValueChange?: (value: string) => void
  onChange?: (e: { target: { value: string } }) => void
  options?: ModernSelectOption[]
  placeholder?: string
  disabled?: boolean
  required?: boolean
  id?: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  'aria-label'?: string
}

function extractOptionsFromChildren(children: React.ReactNode): ModernSelectOption[] {
  const result: ModernSelectOption[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const el = child as React.ReactElement<any>
    if (el.type === React.Fragment) {
      result.push(...extractOptionsFromChildren(el.props.children))
      return
    }
    if (el.type === 'option') {
      const val = el.props.value !== undefined ? String(el.props.value) : String(el.props.children ?? '')
      const label =
        typeof el.props.children === 'string' || typeof el.props.children === 'number'
          ? String(el.props.children)
          : Array.isArray(el.props.children)
          ? el.props.children.map((c: any) => (typeof c === 'string' || typeof c === 'number' ? String(c) : '')).join('')
          : val
      result.push({
        value: val,
        label: label || val,
        disabled: Boolean(el.props.disabled),
      })
    } else if (el.type === 'optgroup' && el.props.children) {
      result.push(...extractOptionsFromChildren(el.props.children))
    }
  })
  return result
}

/**
 * ModernSelect — Cross-platform custom popover select powered by @base-ui/react.
 * Prevents raw mobile OS radio-button modals while staying drop-in compatible with `<select>` props.
 */
export function ModernSelect({
  value,
  defaultValue,
  onValueChange,
  onChange,
  options,
  placeholder = 'Select an option',
  disabled,
  id,
  className,
  style,
  children,
  'aria-label': ariaLabel,
}: ModernSelectProps) {
  const parsedOptions = React.useMemo(
    () => (options && options.length > 0 ? options : extractOptionsFromChildren(children)),
    [options, children]
  )

  const stringValue = value !== undefined && value !== null ? String(value) : undefined
  const activeOption = parsedOptions.find((o) => o.value === stringValue)

  const handleValueChange = (next: string | null) => {
    if (next === null) return
    onValueChange?.(next)
    onChange?.({ target: { value: next } })
  }

  return (
    <Select value={stringValue} defaultValue={defaultValue} onValueChange={handleValueChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        style={style}
        className={cn(
          'h-9 w-full rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground shadow-2xs hover:bg-accent/50 transition-colors',
          className
        )}
      >
        <SelectValue placeholder={placeholder}>
          {activeOption ? activeOption.label : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="max-h-72 p-1">
        {parsedOptions.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            disabled={opt.disabled}
            className="rounded-lg py-2 pr-8 pl-3 text-xs font-medium cursor-pointer"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
