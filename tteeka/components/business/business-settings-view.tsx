'use client'

import { DollarSign, Globe } from 'lucide-react'
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS, type BusinessSettings } from '@/lib/workspaces'

// ---------------------------------------------------------------------------
// BusinessSettingsView — Read-only display of Business Settings
//
// Shown when user has MERCHANT_SETTINGS_READ but not MERCHANT_SETTINGS_MANAGE,
// or while in read mode before entering edit mode.
// ---------------------------------------------------------------------------

type BusinessSettingsViewProps = {
  settings: BusinessSettings
  /** If true, show a "View only" label */
  readOnly?: boolean
}

export function BusinessSettingsView({ settings, readOnly }: BusinessSettingsViewProps) {
  const currencyLabel =
    CURRENCY_OPTIONS.find((c) => c.code === settings.currency)?.label ?? settings.currency
  const timezoneLabel =
    TIMEZONE_OPTIONS.find((t) => t.id === settings.timezone)?.label ?? settings.timezone

  return (
    <div className="space-y-0 divide-y divide-border rounded-2xl border border-border bg-card">
      {readOnly && (
        <div className="flex items-center justify-end px-6 py-3">
          <span className="text-xs font-medium text-muted-foreground">View only</span>
        </div>
      )}

      {/* Currency */}
      <div className="px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex shrink-0 items-center gap-2.5 sm:w-44">
            <span className="text-muted-foreground">
              <DollarSign className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold">Currency</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{currencyLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tteeka uses this currency when new prices are set.
            </p>
            <p className="mt-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              <span className="font-semibold text-foreground">Note:</span> Changing your business
              currency does not convert or rewrite existing product prices. Existing price records keep
              the currency they were created with.
            </p>
          </div>
        </div>
      </div>

      {/* Timezone */}
      <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex shrink-0 items-center gap-2.5 sm:w-44">
          <span className="text-muted-foreground">
            <Globe className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">Timezone</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{timezoneLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Used when Tteeka displays dates and times for your business.
          </p>
        </div>
      </div>
    </div>
  )
}
