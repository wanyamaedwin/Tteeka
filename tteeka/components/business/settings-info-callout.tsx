'use client'

import { Info } from 'lucide-react'

// ---------------------------------------------------------------------------
// SettingsInfoCallout
//
// An inline informational callout shown in the Settings form when the user
// changes the business currency from its saved value.
//
// Explains that existing price records keep their original currency —
// no FX conversion occurs.
// ---------------------------------------------------------------------------

type SettingsInfoCalloutProps = {
  /** When true the callout renders; when false nothing is shown. */
  visible: boolean
}

export function SettingsInfoCallout({ visible }: SettingsInfoCalloutProps) {
  if (!visible) return null

  return (
    <div
      role="note"
      className="flex gap-3 rounded-xl border border-ring/30 bg-secondary/60 px-4 py-3.5"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
      <p className="text-sm leading-6 text-foreground">
        <span className="font-semibold">Changing the business currency</span> will apply to new price
        updates only. Existing price records keep the currency they were created with. No automatic
        conversion occurs.
      </p>
    </div>
  )
}
