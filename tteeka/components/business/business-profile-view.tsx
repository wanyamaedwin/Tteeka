'use client'

import { Building2, Mail, Phone, User } from 'lucide-react'
import type { BusinessProfile } from '@/lib/workspaces'

// ---------------------------------------------------------------------------
// BusinessProfileView — Read-only display of Business Profile fields
//
// Shown when user has MERCHANT_PROFILE_READ but not MERCHANT_PROFILE_MANAGE,
// or while in read mode before entering edit mode.
// ---------------------------------------------------------------------------

type BusinessProfileViewProps = {
  profile: BusinessProfile
  /** If true, show a "View only" label — used when manage is absent */
  readOnly?: boolean
}

export function BusinessProfileView({ profile, readOnly }: BusinessProfileViewProps) {
  return (
    <div className="space-y-0 divide-y divide-border rounded-2xl border border-border bg-card">
      {readOnly && (
        <div className="flex items-center justify-end px-6 py-3">
          <span className="text-xs font-medium text-muted-foreground">View only</span>
        </div>
      )}

      <ProfileField
        icon={<User className="size-4" aria-hidden="true" />}
        label="Display name"
        value={profile.displayName}
        help="The name staff see when working in this Tteeka workspace."
      />
      <ProfileField
        icon={<Building2 className="size-4" aria-hidden="true" />}
        label="Legal name"
        value={profile.legalName}
        emptyLabel="Not provided"
        help="The registered or formal name of the business, if applicable."
      />
      <ProfileField
        icon={<Phone className="size-4" aria-hidden="true" />}
        label="Business phone"
        value={profile.phone}
        emptyLabel="Not provided"
      />
      <ProfileField
        icon={<Mail className="size-4" aria-hidden="true" />}
        label="Business email"
        value={profile.email}
        emptyLabel="Not provided"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProfileField — individual read-only row
// ---------------------------------------------------------------------------

type ProfileFieldProps = {
  icon: React.ReactNode
  label: string
  value: string | null | undefined
  emptyLabel?: string
  help?: string
}

function ProfileField({ icon, label, value, emptyLabel = '—', help }: ProfileFieldProps) {
  const display = value && value.trim() ? value : null

  return (
    <div className="flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-start sm:gap-6">
      {/* Label column */}
      <div className="flex shrink-0 items-center gap-2.5 sm:w-44">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-semibold">{label}</span>
      </div>

      {/* Value column */}
      <div className="min-w-0 flex-1">
        {display ? (
          <p className="text-sm">{display}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">{emptyLabel}</p>
        )}
        {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
      </div>
    </div>
  )
}
