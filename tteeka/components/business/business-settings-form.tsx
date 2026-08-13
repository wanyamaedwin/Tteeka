'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
  type BusinessSettings,
} from '@/lib/workspaces'
import { SettingsInfoCallout } from '@/components/business/settings-info-callout'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// BusinessSettingsForm
//
// Editable form for Business Settings (currency + timezone).
// Handles:
//   • Dirty-state detection vs saved snapshot
//   • Currency-change inline warning
//   • Submitting/loading state
//   • Patch mode (prefilled=false) for manage-only permission edge case
// ---------------------------------------------------------------------------

export type SettingsFormValues = {
  currency: string
  timezone: string
}

type BusinessSettingsFormProps = {
  saved: BusinessSettings
  /**
   * If true, prefill form from saved values (normal read+manage or manage-only after read).
   * If false, start with unselected fields (manage-only without read).
   */
  prefilled?: boolean
  onSave: (patch: Partial<BusinessSettings>) => Promise<void>
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY = ''

function buildInitial(saved: BusinessSettings, prefilled: boolean): SettingsFormValues {
  if (!prefilled) return { currency: EMPTY, timezone: EMPTY }
  return { currency: saved.currency, timezone: saved.timezone }
}

function buildPatch(values: SettingsFormValues, saved: BusinessSettings, prefilled: boolean): Partial<BusinessSettings> {
  if (!prefilled) {
    const patch: Partial<BusinessSettings> = {}
    if (values.currency) patch.currency = values.currency
    if (values.timezone) patch.timezone = values.timezone
    return patch
  }
  const patch: Partial<BusinessSettings> = {}
  if (values.currency !== saved.currency) patch.currency = values.currency
  if (values.timezone !== saved.timezone) patch.timezone = values.timezone
  return patch
}

function isDirty(values: SettingsFormValues, saved: BusinessSettings, prefilled: boolean): boolean {
  if (!prefilled) return !!(values.currency || values.timezone)
  return values.currency !== saved.currency || values.timezone !== saved.timezone
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BusinessSettingsForm({
  saved,
  prefilled = true,
  onSave,
  onCancel,
  onDirtyChange,
}: BusinessSettingsFormProps) {
  const [values, setValues] = useState<SettingsFormValues>(() => buildInitial(saved, prefilled))
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsFormValues, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Re-initialise on merchant switch
  const prevSavedRef = useRef(saved)
  useEffect(() => {
    if (prevSavedRef.current !== saved) {
      prevSavedRef.current = saved
      setValues(buildInitial(saved, prefilled))
      setErrors({})
      setSubmitError(null)
    }
  }, [saved, prefilled])

  const dirty = useMemo(() => isDirty(values, saved, prefilled), [values, saved, prefilled])
  const currencyChanged = prefilled && values.currency !== saved.currency && !!values.currency

  // Notify parent
  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange
  useEffect(() => { onDirtyChangeRef.current?.(dirty) }, [dirty])

  function set(field: keyof SettingsFormValues, val: string) {
    setValues((prev) => ({ ...prev, [field]: val }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const next: Partial<Record<keyof SettingsFormValues, string>> = {}
    if (!prefilled && !values.currency && !values.timezone) {
      next.currency = 'Select at least one setting to update.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const patch = buildPatch(values, saved, prefilled)
    if (Object.keys(patch).length === 0) { onCancel(); return }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSave(patch)
    } catch {
      setSubmitError("We couldn't save these settings.")
    } finally {
      setSubmitting(false)
    }
  }

  const canSave = prefilled ? dirty : !!(values.currency || values.timezone)

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Patch-mode banner */}
      {!prefilled && (
        <div className="rounded-xl border border-border bg-secondary/50 px-4 py-3.5 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Partial update mode.</span>{' '}
          Only settings you select will be changed. Leave a field unselected to keep its current value.
        </div>
      )}

      {/* Currency section */}
      <section aria-labelledby="settings-currency-heading" className="space-y-4">
        <div>
          <h3 id="settings-currency-heading" className="text-sm font-semibold">
            Currency
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tteeka uses this currency when new prices are set.
          </p>
        </div>

        <SelectField
          id="settings-currency"
          label="Business currency"
          value={values.currency}
          onChange={(v) => set('currency', v)}
          disabled={submitting}
          error={errors.currency}
          placeholder="Select currency"
        >
          {CURRENCY_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </SelectField>

        {/* Currency-change warning */}
        <SettingsInfoCallout visible={currencyChanged} />

        {/* Always-visible currency note */}
        <p className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Note:</span> Changing your business currency
          does not convert or rewrite existing product prices. Existing price records keep the currency
          they were created with.
        </p>
      </section>

      {/* Timezone section */}
      <section aria-labelledby="settings-timezone-heading" className="space-y-4 border-t border-border pt-6">
        <div>
          <h3 id="settings-timezone-heading" className="text-sm font-semibold">
            Timezone
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Used when Tteeka displays dates and times for your business.
          </p>
        </div>

        <SelectField
          id="settings-timezone"
          label="Business timezone"
          value={values.timezone}
          onChange={(v) => set('timezone', v)}
          disabled={submitting}
          error={errors.timezone}
          placeholder="Select timezone"
        >
          {TIMEZONE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </SelectField>
      </section>

      {/* Submission error */}
      {submitError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {submitError}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="h-11 rounded-lg border border-border px-5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50 sm:h-10"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave || submitting}
          aria-disabled={!canSave || submitting}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 sm:h-10"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Saving…</span>
            </>
          ) : (
            'Save changes'
          )}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// SelectField
// ---------------------------------------------------------------------------

function SelectField({
  id,
  label,
  value,
  onChange,
  disabled,
  error,
  placeholder,
  children,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  error?: string
  placeholder?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'h-11 w-full max-w-xs rounded-lg border bg-background px-3 text-sm outline-none transition-colors',
          error ? 'border-destructive focus:ring-destructive/40' : 'border-input focus:border-ring',
          'focus:ring-2 focus:ring-ring/30',
          disabled && 'cursor-not-allowed opacity-60',
          !value && 'text-muted-foreground',
        )}
      >
        <option value="" disabled>
          {placeholder ?? 'Select…'}
        </option>
        {children}
      </select>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
