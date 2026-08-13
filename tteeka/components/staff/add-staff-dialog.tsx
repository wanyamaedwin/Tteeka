'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, UserPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  findGlobalUserByPhone,
  generateMembershipId,
  type StaffMemberPreview,
} from '@/lib/mock-staff'
import { isMockMode } from '@/lib/config'

// ---------------------------------------------------------------------------
// AddStaffDialog
//
// Add an existing Tteeka User to this Merchant by phone number.
//
// Mock-mode behavior:
//   • Look up phone in MOCK_GLOBAL_USERS
//   • ACTIVE user with no existing Membership → create Membership (ACTIVE, roles=[])
//   • DISABLED user OR unknown phone → generic "Unable to add staff member." error
//   • User already has Membership in this Merchant → 409-style conflict message
// ---------------------------------------------------------------------------

type AddStaffDialogProps = {
  open: boolean
  /** Existing membership phone numbers for conflict detection */
  existingPhones: string[]
  onAdd: (member: StaffMemberPreview) => void
  onClose: () => void
}

type FormState = 'idle' | 'submitting' | 'error-generic' | 'error-conflict'

export function AddStaffDialog({ open, existingPhones, onAdd, onClose }: AddStaffDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [phone, setPhone] = useState('')
  const [formState, setFormState] = useState<FormState>('idle')

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setPhone('')
      setFormState('idle')
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  // Focus trap + Escape
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = phone.trim()
    if (!trimmed) return

    setFormState('submitting')

    if (!isMockMode()) {
      // Live mode: no-op — API integration deferred
      setFormState('error-generic')
      return
    }

    // Simulate network latency
    await new Promise((r) => setTimeout(r, 350))

    // ── Conflict check: already has a membership ──────────────────────────
    const normalizedInput = trimmed.replace(/[\s\-().]/g, '')
    const existingMatch = existingPhones.some(
      (p) => p.replace(/[\s\-().]/g, '') === normalizedInput,
    )
    if (existingMatch) {
      setFormState('error-conflict')
      return
    }

    // ── Global user lookup ────────────────────────────────────────────────
    const globalUser = findGlobalUserByPhone(trimmed)

    if (!globalUser || globalUser.globalStatus !== 'ACTIVE') {
      // Generic message — do not reveal whether user exists or is disabled
      setFormState('error-generic')
      return
    }

    // ── Success ───────────────────────────────────────────────────────────
    const newMember: StaffMemberPreview = {
      membershipId: generateMembershipId(),
      userId: globalUser.userId,
      name: globalUser.name,
      phone: globalUser.phone,
      email: globalUser.email,
      membershipStatus: 'ACTIVE',
      roleIds: [],
    }
    onAdd(newMember)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-staff-title"
    >
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onClose} />

      {/* Panel — bottom sheet on mobile, centered dialog on desktop */}
      <div
        ref={panelRef}
        className="relative w-full rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
              <UserPlus className="size-4" aria-hidden="true" />
            </span>
            <h2 id="add-staff-title" className="font-semibold">Add staff</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Explanation */}
          <div className="mb-5 rounded-xl border border-border bg-secondary/40 px-4 py-3.5 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">The person must already have a Tteeka account.</p>
            <p className="mt-1 leading-5">
              Enter their phone number to add them to this business. A new membership will be created
              immediately with no roles assigned.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Phone field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="add-staff-phone" className="text-sm font-semibold">
                Phone number
              </label>
              <input
                ref={inputRef}
                id="add-staff-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setFormState('idle') }}
                disabled={formState === 'submitting'}
                placeholder="e.g. +256 772 123 456 or 0772123456"
                aria-invalid={formState === 'error-generic' || formState === 'error-conflict'}
                aria-describedby={
                  formState === 'error-generic' ? 'add-staff-error-generic'
                  : formState === 'error-conflict' ? 'add-staff-error-conflict'
                  : 'add-staff-phone-help'
                }
                className={cn(
                  'h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition-colors',
                  (formState === 'error-generic' || formState === 'error-conflict')
                    ? 'border-destructive focus:ring-destructive/30'
                    : 'border-input focus:border-ring',
                  'focus:ring-2 focus:ring-ring/30',
                  formState === 'submitting' && 'opacity-60 cursor-not-allowed',
                )}
              />
              {/* Help / error */}
              {formState === 'idle' && (
                <p id="add-staff-phone-help" className="text-xs text-muted-foreground">
                  Enter the phone number already registered to the person's Tteeka account.
                </p>
              )}
              {formState === 'error-generic' && (
                <p id="add-staff-error-generic" role="alert" className="text-xs text-destructive">
                  Unable to add staff member. Check the phone number and try again.
                </p>
              )}
              {formState === 'error-conflict' && (
                <p id="add-staff-error-conflict" role="alert" className="text-xs text-destructive">
                  This person is already part of this business.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={formState === 'submitting'}
                className="h-11 rounded-lg border border-border px-5 text-sm font-semibold hover:bg-secondary disabled:opacity-50 sm:h-10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!phone.trim() || formState === 'submitting'}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 sm:h-10"
              >
                {formState === 'submitting' ? (
                  <><Loader2 className="size-4 animate-spin" aria-hidden="true" />Adding…</>
                ) : (
                  'Add staff member'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
