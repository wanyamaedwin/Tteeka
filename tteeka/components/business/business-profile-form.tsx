'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { BusinessProfile } from '@/lib/workspaces'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// BusinessProfileForm
//
// Editable form for Business Profile fields.
// Handles:
//   • Dirty-state detection (field values vs saved snapshot)
//   • Light frontend validation (display name required, basic email check)
//   • Submitting/loading state
//   • Cancel restores saved snapshot
//   • Supports two modes:
//     - Full mode (prefilled=true): shows saved values; used when profile.read ✓
//     - Patch mode (prefilled=false): blank fields; used when profile.manage only
// ---------------------------------------------------------------------------

export type ProfileFormValues = {
  displayName: string
  legalName: string
  phone: string
  email: string
}

type FieldError = Partial<Record<keyof ProfileFormValues, string>>

type BusinessProfileFormProps = {
  /** Current saved profile values — used to detect dirty state and for prefill. */
  saved: BusinessProfile
  /**
   * If true, prefill form fields from `saved`.
   * If false (manage-only mode), fields start blank.
   */
  prefilled?: boolean
  /** Called with the partial patch when the user saves. */
  onSave: (patch: Partial<BusinessProfile>) => Promise<void>
  /** Called when the user clicks Cancel. */
  onCancel: () => void
  /** Whether any field currently differs from saved. Exposed for parent dirty guard. */
  onDirtyChange?: (dirty: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEmpty(s: string) { return !s.trim() }

function isEmail(s: string) {
  // Light UX check only — backend is authoritative
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

function buildInitial(saved: BusinessProfile, prefilled: boolean): ProfileFormValues {
  if (!prefilled) return { displayName: '', legalName: '', phone: '', email: '' }
  return {
    displayName: saved.displayName,
    legalName: saved.legalName ?? '',
    phone: saved.phone ?? '',
    email: saved.email ?? '',
  }
}

function buildPatch(values: ProfileFormValues, saved: BusinessProfile, prefilled: boolean): Partial<BusinessProfile> {
  if (!prefilled) {
    // Patch mode: only include non-empty fields
    const patch: Partial<BusinessProfile> = {}
    if (!isEmpty(values.displayName)) patch.displayName = values.displayName.trim()
    if (!isEmpty(values.legalName)) patch.legalName = values.legalName.trim()
    if (!isEmpty(values.phone)) patch.phone = values.phone.trim()
    if (!isEmpty(values.email)) patch.email = values.email.trim()
    return patch
  }
  // Full mode: include all changed fields
  const patch: Partial<BusinessProfile> = {}
  const dn = values.displayName.trim()
  const ln = values.legalName.trim() || null
  const ph = values.phone.trim() || null
  const em = values.email.trim() || null
  if (dn !== saved.displayName) patch.displayName = dn
  if (ln !== saved.legalName) patch.legalName = ln
  if (ph !== saved.phone) patch.phone = ph
  if (em !== saved.email) patch.email = em
  return patch
}

function isDirty(values: ProfileFormValues, saved: BusinessProfile, prefilled: boolean): boolean {
  if (!prefilled) {
    return (
      !isEmpty(values.displayName) ||
      !isEmpty(values.legalName) ||
      !isEmpty(values.phone) ||
      !isEmpty(values.email)
    )
  }
  return (
    values.displayName !== saved.displayName ||
    (values.legalName.trim() || null) !== saved.legalName ||
    (values.phone.trim() || null) !== saved.phone ||
    (values.email.trim() || null) !== saved.email
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BusinessProfileForm({
  saved,
  prefilled = true,
  onSave,
  onCancel,
  onDirtyChange,
}: BusinessProfileFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(() => buildInitial(saved, prefilled))
  const [errors, setErrors] = useState<FieldError>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Re-initialise when saved snapshot changes (merchant switch resets form)
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

  // Notify parent of dirty state change
  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange
  useEffect(() => { onDirtyChangeRef.current?.(dirty) }, [dirty])

  // Focus first field on mount
  useEffect(() => { firstFieldRef.current?.focus() }, [])

  function set(field: keyof ProfileFormValues, val: string) {
    setValues((prev) => ({ ...prev, [field]: val }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const next: FieldError = {}
    if (prefilled && isEmpty(values.displayName)) {
      next.displayName = 'Enter a display name.'
    }
    if (!prefilled && isEmpty(values.displayName) && isEmpty(values.legalName) && isEmpty(values.phone) && isEmpty(values.email)) {
      next.displayName = 'Enter at least one field to update.'
    }
    if (!isEmpty(values.email) && !isEmail(values.email)) {
      next.email = 'Enter a valid email address.'
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
      setSubmitError("We couldn't save your business details.")
    } finally {
      setSubmitting(false)
    }
  }

  const canSave = prefilled ? dirty : (
    !isEmpty(values.displayName) ||
    !isEmpty(values.legalName) ||
    !isEmpty(values.phone) ||
    !isEmpty(values.email)
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Patch-mode banner */}
      {!prefilled && (
        <div className="rounded-xl border border-border bg-secondary/50 px-4 py-3.5 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Partial update mode.</span>{' '}
          Only fields you enter will be changed. Leave a field blank to keep its current value.
        </div>
      )}

      {/* Fields — two-column on desktop */}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField
          id="profile-display-name"
          label="Display name"
          required={prefilled}
          help="The name staff see when working in this Tteeka workspace."
          error={errors.displayName}
        >
          <input
            ref={firstFieldRef}
            id="profile-display-name"
            type="text"
            autoComplete="organization"
            value={values.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            disabled={submitting}
            placeholder={prefilled ? '' : 'e.g. Dstyle Hub'}
            aria-required={prefilled}
            aria-invalid={!!errors.displayName}
            aria-describedby={errors.displayName ? 'profile-display-name-error' : 'profile-display-name-help'}
            className={inputClass(!!errors.displayName, submitting)}
          />
        </FormField>

        <FormField
          id="profile-legal-name"
          label="Legal name"
          help="The registered or formal name of the business, if applicable."
          error={errors.legalName}
        >
          <input
            id="profile-legal-name"
            type="text"
            autoComplete="organization"
            value={values.legalName}
            onChange={(e) => set('legalName', e.target.value)}
            disabled={submitting}
            placeholder={prefilled ? 'Optional' : 'e.g. Dstyle Hub Uganda Ltd'}
            aria-invalid={!!errors.legalName}
            aria-describedby={errors.legalName ? 'profile-legal-name-error' : 'profile-legal-name-help'}
            className={inputClass(!!errors.legalName, submitting)}
          />
        </FormField>

        <FormField
          id="profile-phone"
          label="Business phone"
          error={errors.phone}
        >
          <input
            id="profile-phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(e) => set('phone', e.target.value)}
            disabled={submitting}
            placeholder={prefilled ? 'Optional' : 'e.g. +256 772 123 456'}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'profile-phone-error' : undefined}
            className={inputClass(!!errors.phone, submitting)}
          />
        </FormField>

        <FormField
          id="profile-email"
          label="Business email"
          error={errors.email}
        >
          <input
            id="profile-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
            disabled={submitting}
            placeholder={prefilled ? 'Optional' : 'e.g. hello@dstylehub.ug'}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'profile-email-error' : undefined}
            className={inputClass(!!errors.email, submitting)}
          />
        </FormField>
      </div>

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
// Shared field wrapper
// ---------------------------------------------------------------------------

function FormField({
  id,
  label,
  required,
  help,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  help?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  )
}

function inputClass(hasError: boolean, disabled: boolean) {
  return cn(
    'h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition-colors',
    hasError ? 'border-destructive focus:ring-destructive/40' : 'border-input focus:border-ring',
    'focus:ring-2 focus:ring-ring/30',
    disabled && 'cursor-not-allowed opacity-60',
  )
}
