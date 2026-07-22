'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'

export interface CurrencyFieldProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  id?: string
  name?: string
  className?: string
  placeholder?: string
  currencySymbol?: string
}

export function CurrencyField({
  value,
  onChange,
  disabled = false,
  id,
  name,
  className = '',
  placeholder = '0',
  currencySymbol = '₦',
}: CurrencyFieldProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [localString, setLocalString] = useState<string>(
    value ? value.toLocaleString() : '0'
  )
  const inputRef = useRef<HTMLInputElement>(null)

  // Format value depending on focus state
  useEffect(() => {
    if (!isFocused) {
      setLocalString(value ? value.toLocaleString() : '0')
    }
  }, [value, isFocused])

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true)
    // While editing, show plain digits without commas
    setLocalString(value ? value.toString() : '')
    // Select-all on focus so user can immediately replace text without backspacing
    setTimeout(() => {
      e.target.select()
    }, 0)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip everything except digits
    const rawDigits = e.target.value.replace(/[^0-9]/g, '')
    setLocalString(rawDigits)

    if (rawDigits === '') {
      onChange(0)
      return
    }

    const parsed = parseInt(rawDigits, 10)
    if (!isNaN(parsed)) {
      onChange(parsed)
    }
  }

  const handleBlur = () => {
    setIsFocused(false)
    const rawDigits = localString.replace(/[^0-9]/g, '')
    const parsed = parseInt(rawDigits, 10)
    const finalValue = isNaN(parsed) ? 0 : parsed

    setLocalString(finalValue ? finalValue.toLocaleString() : '0')
    onChange(finalValue)
  }

  return (
    <div className="relative flex items-center w-full">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-sans text-sm font-semibold pointer-events-none select-none z-10">
        {currencySymbol}
      </span>
      <Input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        value={localString}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={`pl-8 font-mono text-lg text-foreground ${className}`}
      />
    </div>
  )
}
