'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { Customer, DeliveryLocation } from '@/lib/api/customers'
import { customersService } from '@/lib/customers-service'
import { ApiError } from '@/lib/api/errors'

type Props = {
  open: boolean
  merchantId: string
  initialCustomerId?: string
  initialLocationId?: string | null
  submitting: boolean
  saveError?: string
  onClose: () => void
  onSave: (value: {
    customerId: string
    deliveryLocationId: string | null
  }) => void
}

export function OrderCustomerDialog({
  open,
  merchantId,
  initialCustomerId,
  initialLocationId,
  submitting,
  saveError,
  onClose,
  onSave,
}: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [locations, setLocations] = useState<DeliveryLocation[]>([])
  const [customerId, setCustomerId] = useState(initialCustomerId ?? '')
  const [locationId, setLocationId] = useState(initialLocationId ?? '')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setCustomerId(initialCustomerId ?? '')
    setLocationId(initialLocationId ?? '')
    setError('')
    setLoading(true)
    customersService()
      .list(merchantId, { status: 'ACTIVE', pageSize: 100 })
      .then((response) => setCustomers(response.customers))
      .catch(() => setError('Unable to load active customers.'))
      .finally(() => setLoading(false))
  }, [open, merchantId, initialCustomerId, initialLocationId])

  useEffect(() => {
    if (!open || !customerId) {
      setLocations([])
      return
    }
    setLoading(true)
    customersService()
      .listLocations(merchantId, customerId, {
        status: 'ACTIVE',
        pageSize: 100,
      })
      .then((response) => setLocations(response.deliveryLocations))
      .catch((cause: unknown) =>
        setError(
          cause instanceof ApiError
            ? "This customer's locations are unavailable."
            : 'Unable to load delivery locations.',
        ),
      )
      .finally(() => setLoading(false))
  }, [open, merchantId, customerId])

  const shown = useMemo(
    () =>
      customers.filter((customer) =>
        `${customer.name ?? ''} ${customer.phone}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [customers, query],
  )

  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-customer-title"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
    >
      <div className="absolute inset-0 bg-foreground/30" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl border border-border bg-card p-6 shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 p-2"
        >
          <X className="size-4" />
        </button>
        <h2 id="order-customer-title" className="text-lg font-semibold">
          {initialCustomerId ? 'Edit order customer' : 'New Order'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose an active Customer and an optional saved Delivery Location.
        </p>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">
            Search active customers
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or phone"
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
            />
          </label>
          <label className="block text-sm font-semibold">
            Customer
            <select
              aria-label="Customer"
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value)
                setLocationId('')
              }}
              disabled={loading}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
            >
              <option value="">Select Customer</option>
              {shown.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name ?? 'Unnamed customer'} - {customer.phone}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Delivery Location
            <select
              aria-label="Delivery Location"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              disabled={!customerId || loading}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
            >
              <option value="">No delivery location yet</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.area} - {location.landmark}
                </option>
              ))}
            </select>
          </label>
          {(error || saveError) && (
            <p role="alert" className="text-sm text-destructive">
              {saveError || error}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onSave({
                customerId,
                deliveryLocationId: locationId || null,
              })
            }
            disabled={!customerId || submitting}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting
              ? 'Saving...'
              : initialCustomerId
                ? 'Save changes'
                : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}
