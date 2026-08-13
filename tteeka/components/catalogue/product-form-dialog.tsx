'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProductPreview } from '@/lib/mock-catalogue'

// ---------------------------------------------------------------------------
// ProductFormDialog
//
// Shared Create / Edit form for a Product.
//
// Create mode:
//   - All fields empty.
//   - Status field NOT shown (backend always creates ACTIVE).
//   - No duplicate-name check (backend allows duplicate names).
//
// Edit mode:
//   - Pre-fills existing name, description, category, brand.
//   - Dirty-state tracking (Save disabled when no changes).
//   - id, merchantId, status, createdAt are NOT editable here.
//
// Field limits:
//   name: required, trim, max 160 chars
//   description: optional, trim, max 2000 chars, null when blank
//   category: optional, trim, max 120 chars, null when blank
//   brand: optional, trim, max 120 chars, null when blank
// ---------------------------------------------------------------------------

type ProductFormMode = 'create' | 'edit'

type ProductFormDialogProps = {
  open: boolean
  mode: ProductFormMode
  existing?: ProductPreview       // required for edit
  submitting?: boolean
  onSave: (fields: {
    name: string
    description: string | null
    category: string | null
    brand: string | null
  }) => void
  onCancel: () => void
}

export function ProductFormDialog({
  open,
  mode,
  existing,
  submitting,
  onSave,
  onCancel,
}: ProductFormDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setName(mode === 'edit' ? (existing?.name ?? '') : '')
      setDescription(mode === 'edit' ? (existing?.description ?? '') : '')
      setCategory(mode === 'edit' ? (existing?.category ?? '') : '')
      setBrand(mode === 'edit' ? (existing?.brand ?? '') : '')
      setNameError(null)
      setTimeout(() => nameRef.current?.focus(), 30)
    }
  }, [open, mode, existing?.name, existing?.description, existing?.category, existing?.brand])

  // Escape handler
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  const trimmedName = name.trim()
  const trimmedDesc = description.trim()
  const trimmedCat = category.trim()
  const trimmedBrand = brand.trim()

  // Dirty detection
  const isDirty = mode === 'create'
    ? trimmedName !== ''
    : trimmedName !== (existing?.name ?? '') ||
      trimmedDesc !== (existing?.description ?? '') ||
      trimmedCat !== (existing?.category ?? '') ||
      trimmedBrand !== (existing?.brand ?? '')

  function validate(): boolean {
    if (!trimmedName) {
      setNameError('Product name is required.')
      return false
    }
    if (trimmedName.length > 160) {
      setNameError('Product name must be 160 characters or fewer.')
      return false
    }
    setNameError(null)
    return true
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave({
      name: trimmedName,
      description: trimmedDesc || null,
      category: trimmedCat || null,
      brand: trimmedBrand || null,
    })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        className="relative flex w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-2xl"
        style={{ maxHeight: 'min(96vh, 700px)' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 id="product-form-title" className="font-semibold">
            {mode === 'create' ? 'Add product' : 'Edit product'}
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

        {/* Form body — scrollable */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          id="product-form"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {mode === 'create' && (
              <p className="text-sm text-muted-foreground">
                The product will be created as <span className="font-medium text-foreground">Active</span>. You can manage variants and pricing in future steps.
              </p>
            )}

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="product-name" className="text-sm font-semibold">
                Product name <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <input
                ref={nameRef}
                id="product-name"
                type="text"
                value={name}
                maxLength={165}
                onChange={(e) => { setName(e.target.value); setNameError(null) }}
                disabled={submitting}
                placeholder="e.g. Classic Oxford Shirt"
                aria-required="true"
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'product-name-error' : 'product-name-count'}
                className={cn(
                  'h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/30',
                  nameError
                    ? 'border-destructive focus:border-destructive'
                    : 'border-input focus:border-ring',
                  submitting && 'opacity-60 cursor-not-allowed',
                )}
              />
              {nameError ? (
                <p id="product-name-error" role="alert" className="text-xs text-destructive">{nameError}</p>
              ) : (
                <p id="product-name-count" className="text-xs text-muted-foreground">{trimmedName.length}/160 characters</p>
              )}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="product-description" className="text-sm font-semibold">
                Description <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </label>
              <textarea
                id="product-description"
                value={description}
                maxLength={2010}
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                placeholder="Describe the product…"
                aria-describedby="product-desc-count"
                className={cn(
                  'w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30',
                  submitting && 'opacity-60 cursor-not-allowed',
                )}
              />
              <p id="product-desc-count" className="text-xs text-muted-foreground">
                {trimmedDesc.length}/2000 characters
              </p>
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="product-category" className="text-sm font-semibold">
                Category <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </label>
              <input
                id="product-category"
                type="text"
                value={category}
                maxLength={125}
                onChange={(e) => setCategory(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Men's Shirts, Footwear, Accessories…"
                aria-describedby="product-cat-hint"
                className={cn(
                  'h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30',
                  submitting && 'opacity-60 cursor-not-allowed',
                )}
              />
              <p id="product-cat-hint" className="text-xs text-muted-foreground">
                Free-form category label. Not linked to a category list.
              </p>
            </div>

            {/* Brand */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="product-brand" className="text-sm font-semibold">
                Brand <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </label>
              <input
                id="product-brand"
                type="text"
                value={brand}
                maxLength={125}
                onChange={(e) => setBrand(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Dstyle, Northline, Urban Form…"
                aria-describedby="product-brand-hint"
                className={cn(
                  'h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30',
                  submitting && 'opacity-60 cursor-not-allowed',
                )}
              />
              <p id="product-brand-hint" className="text-xs text-muted-foreground">
                Free-form brand label. Not linked to a brand list.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
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
              form="product-form"
              disabled={!trimmedName || (mode === 'edit' && !isDirty) || submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 sm:h-10"
            >
              {submitting ? (
                <><Loader2 className="size-4 animate-spin" aria-hidden="true" />{mode === 'create' ? 'Adding…' : 'Saving…'}</>
              ) : (
                mode === 'create' ? 'Add product' : 'Save changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
