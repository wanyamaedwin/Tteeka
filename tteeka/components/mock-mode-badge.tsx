import { mockPreviewMeta } from '@/lib/mock-data'
import { isMockMode } from '@/lib/config'

export function MockModeBadge() {
  if (!isMockMode()) return null
  return <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-primary">{mockPreviewMeta.label}</span>
}
