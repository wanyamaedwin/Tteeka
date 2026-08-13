'use client'

// ---------------------------------------------------------------------------
// components/catalogue/money-input.tsx
//
// Safe integer money input component for F4.3 pricing forms.
//
// CRITICAL RULES:
//   • type="text" with inputMode="numeric" — NOT type="number".
//     type="number" risks scientific notation, float parsing, and Number coercion.
//   • Stored value is always a digit-only string ("85000", "0", "").
//   • Strips all non-digit characters on input change.
//   • Never converts to JavaScript Number internally.
//   • No commas in the stored value (display-only grouping in MoneyDisplay).
//   • No decimal points accepted.
//   • Accessible: label + error both associated via htmlFor / aria-describedby.
// ---------------------------------------------------------------------------

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

type MoneyInputProps = {
  id: string
  label: string
  /** Current raw digit-only value. Empty string = blank. Never a number. */
  value: string
  onChange: (digitString: string) => void
  currency?: string
  hint?: string
  error?: string | null
  required?: boolean
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Safe money input field.
 *
 * Accepts only digit characters. Strips everything else on input.
 * Stored value is a plain digit string: "85000", "0", "".
 * Never converts to JS Number. Never allows floats or commas.
 *
 * Currency prefix is displayed as a static label prefix (not in the value).
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    { id, label, value, onChange, currency, hint, error, required, placeholder, disabled, className },
    ref,
  ) {
    const errorId = error ? `${id}-error` : undefined
    const hintId = hint ? `${id}-hint` : undefined
    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = e.target.value
      // Strip all non-digit characters — preserve only 0-9
      const digits = raw.replace(/\D/g, '')
      onChange(digits)
    }

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
          {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
        </label>

        <div className="relative flex items-center">
          {currency && (
            <span
              className="absolute left-3.5 select-none font-mono text-sm font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {currency}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-required={required}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            className={cn(
              'h-11 w-full rounded-lg border bg-background font-mono text-sm outline-none transition-colors',
              'focus:border-ring focus:ring-2 focus:ring-ring/30',
              currency ? 'pl-14 pr-4' : 'px-4',
              error ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : 'border-input',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          />
        </div>

        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  },
)
