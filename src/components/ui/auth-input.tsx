'use client'

import React, { useState, forwardRef } from 'react'

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  rightElement?: React.ReactNode
}

/**
 * AuthInput — a premium credential input with:
 *  - Chrome autofill colour override (no yellow flash)
 *  - Inline error message with animation
 *  - Password reveal toggle (when type="password")
 *  - Error border state
 */
export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, error, rightElement, type, id, className = '', ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

    return (
      <div className="space-y-1.5">
        <label
          htmlFor={id}
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {label}
        </label>

        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={inputType}
            className={`auth-input pr-10 ${error ? 'border-red-500/60 focus:border-red-500/80 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]' : ''} ${className}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            autoComplete={isPassword ? 'current-password' : 'username'}
            {...props}
          />
          {(rightElement || isPassword) && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              {isPassword && (
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              )}
              {rightElement}
            </div>
          )}
        </div>

        {error && (
          <p id={`${id}-error`} className="field-error" role="alert">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </p>
        )}
      </div>
    )
  }
)

AuthInput.displayName = 'AuthInput'
