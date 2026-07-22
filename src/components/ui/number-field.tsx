'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface NumberFieldProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  id?: string
  name?: string
  className?: string
  placeholder?: string
  showStepperButtons?: boolean
}

export function NumberField({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled = false,
  id,
  name,
  className = '',
  placeholder = '0',
  showStepperButtons = false,
}: NumberFieldProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [localString, setLocalString] = useState<string>(value?.toString() ?? '0')
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep localString in sync with value when not focused
  useEffect(() => {
    if (!isFocused) {
      setLocalString(value !== undefined && value !== null ? value.toString() : '0')
    }
  }, [value, isFocused])

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true)
    // Select-all on focus so typing immediately replaces current text
    e.target.select()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setLocalString(raw)

    if (raw.trim() === '') {
      // Allow temporary empty string while editing
      return
    }

    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed)) {
      let clamped = parsed
      if (min !== undefined && clamped < min) clamped = min
      if (max !== undefined && clamped > max) clamped = max
      onChange(clamped)
    }
  }

  const handleBlur = () => {
    setIsFocused(false)
    let parsed = parseInt(localString, 10)
    if (isNaN(parsed) || localString.trim() === '') {
      parsed = min !== undefined ? min : 0
    } else {
      if (min !== undefined && parsed < min) parsed = min
      if (max !== undefined && parsed > max) parsed = max
    }
    setLocalString(parsed.toString())
    onChange(parsed)
  }

  const handleStep = (delta: number) => {
    const current = typeof value === 'number' && !isNaN(value) ? value : min
    let next = current + delta
    if (min !== undefined && next < min) next = min
    if (max !== undefined && next > max) next = max
    setLocalString(next.toString())
    onChange(next)
  }

  if (showStepperButtons) {
    return (
      <div className="flex items-center space-x-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled || (min !== undefined && value <= min)}
          className="h-10 w-10 shrink-0 font-bold cursor-pointer"
          onClick={() => handleStep(-step)}
        >
          -
        </Button>
        <Input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={localString}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          className={`h-10 text-center font-mono text-base ${className}`}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled || (max !== undefined && value >= max)}
          className="h-10 w-10 shrink-0 font-bold cursor-pointer"
          onClick={() => handleStep(step)}
        >
          +
        </Button>
      </div>
    )
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={localString}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
    />
  )
}
