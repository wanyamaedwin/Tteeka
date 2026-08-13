'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RolePreview } from '@/lib/mock-staff'

// ---------------------------------------------------------------------------
// CreateRoleDialog / EditRoleDialog
//
// Both use the same form shell — mode prop determines which.
//
// Create: name + description only. No Permission selection (backend starts with 0).
// Edit: pre-fills existing name/description.
// Duplicate Role name: simulates 409 conflict.
// ---------------------------------------------------------------------------

type RoleFormMode = 'create' | 'edit'

type RoleFormDialogProps = {
  open: boolean
  mode: RoleFormMode
  existingRole?: RolePreview      // required for edit mode
  existingNames: string[]         // for duplicate detection
  submitting?: boolean
  submitError?: string | null
  onSave: (name: string, description: string) => void
  onCancel: () => void
}

export function RoleFormDialog({
  open,
  mode,
  existingRole,
  existingNames,
  submitting,
  submitError,
  onSave,
  onCancel,
}: RoleFormDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(mode === 'edit' ? (existingRole?.name ?? '') : '')
  const [description, setDescription] = useState(mode === 'edit' ? (existingRole?.description ?? '') : '')
  const [nameError, setNameError] = useState<string | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setName(mode === 'edit' ? (existingRole?.name ?? '') : '')
      setDescription(mode === 'edit' ? (existingRole?.description ?? '') : '')
      setNameError(null)
      setTimeout(() => nameRef.current?.focus(), 30)
    }
  }, [open, mode, existingRole?.name, existingRole?.description])

  // Escape
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  const trimmedName = name.trim()
  const trimmedDesc = description.trim()

  // Dirty detection for edit mode
  const isDirty = mode === 'create'
    ? trimmedName !== ''
    : trimmedName !== existingRole?.name || trimmedDesc !== (existingRole?.description ?? '')

  function validate(): boolean {
    if (!trimmedName) { setNameError('Role name is required.'); return false }
    if (trimmedName.length > 80) { setNameError('Role name must be 80 characters or fewer.'); return false }
    // Duplicate check — case-sensitive exact match, excluding the role being edited
    const others = existingNames.filter((n) => n !== existingRole?.name)
    if (others.includes(trimmedName)) {
      setNameError('A role with this name already exists.')
      return false
    }
    setNameError(null)
    return true
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave(trimmedName, trimmedDesc)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-form-title"
    >
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onCancel} />
      <div
        ref={panelRef}
        className="relative w-full rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="role-form-title" className="font-semibold">
            {mode === 'create' ? 'Create role' : 'Edit role'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
          {mode === 'create' && (
            <p className="text-sm text-muted-foreground">
              The new role will start active with no permissions assigned. You can add permissions after creating it.
            </p>
          )}

          {submitError && (
            <p role="alert" className="text-sm text-destructive">{submitError}</p>
          )}

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="role-name-input" className="text-sm font-semibold">
              Role name <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              ref={nameRef}
              id="role-name-input"
              type="text"
              value={name}
              maxLength={82}
              onChange={(e) => { setName(e.target.value); setNameError(null) }}
              disabled={submitting}
              placeholder="e.g. Cashier, Warehouse Manager…"
              aria-required="true"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'role-name-error' : 'role-name-count'}
              className={cn(
                'h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/30',
                nameError
                  ? 'border-destructive focus:border-destructive'
                  : 'border-input focus:border-ring',
                submitting && 'opacity-60 cursor-not-allowed',
              )}
            />
            {nameError ? (
              <p id="role-name-error" role="alert" className="text-xs text-destructive">{nameError}</p>
            ) : (
              <p id="role-name-count" className="text-xs text-muted-foreground">
                {trimmedName.length}/80 characters
              </p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="role-desc-input" className="text-sm font-semibold">
              Description <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </label>
            <textarea
              id="role-desc-input"
              value={description}
              maxLength={325}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              placeholder="Briefly describe what this role is used for…"
              aria-describedby="role-desc-count"
              className={cn(
                'w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30',
                submitting && 'opacity-60 cursor-not-allowed',
              )}
            />
            <p id="role-desc-count" className="text-xs text-muted-foreground">
              {trimmedDesc.length}/320 characters
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="h-11 rounded-lg border border-border px-5 text-sm font-semibold hover:bg-secondary disabled:opacity-50 sm:h-10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!trimmedName || (mode === 'edit' && !isDirty) || submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 sm:h-10"
            >
              {submitting ? (
                <><Loader2 className="size-4 animate-spin" aria-hidden="true" />{mode === 'create' ? 'Creating…' : 'Saving…'}</>
              ) : (
                mode === 'create' ? 'Create role' : 'Save changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
