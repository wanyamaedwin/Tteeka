'use client'

import { useState } from 'react'
import { FileClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InventoryLedgerEntryPublicPreview } from '@/lib/mock-inventory'
import { formatQuantity } from '@/lib/mock-inventory'
import { LedgerEntryDetailDialog } from './ledger-entry-detail-dialog'

// ---------------------------------------------------------------------------
// LedgerList
//
// Renders the append-only ledger history newest-first.
// ---------------------------------------------------------------------------

type LedgerListProps = {
  entries: InventoryLedgerEntryPublicPreview[]
}

export function LedgerList({ entries }: LedgerListProps) {
  const [selectedEntry, setSelectedEntry] = useState<InventoryLedgerEntryPublicPreview | null>(null)

  if (entries.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-8 text-center sm:min-h-[50vh]">
        <div className="flex size-12 items-center justify-center rounded-full bg-secondary">
          <FileClock className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 font-semibold">No inventory movements yet</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          This variant has not had any recorded inventory movements.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {entries.map((entry) => {
            const isOut = entry.movementType === 'ADJUSTMENT_OUT'

            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setSelectedEntry(entry)}
                  className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-secondary sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-sm">
                      {entry.movementType === 'RECEIPT' && 'Stock received'}
                      {entry.movementType === 'ADJUSTMENT_IN' && 'Stock added'}
                      {entry.movementType === 'ADJUSTMENT_OUT' && 'Stock removed'}
                    </span>
                    {entry.note ? (
                      <span className="text-sm text-muted-foreground line-clamp-1">
                        {entry.note}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">
                        No note
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {new Intl.DateTimeFormat('en-UG', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Africa/Kampala',
                      }).format(new Date(entry.createdAt))}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-6 sm:w-1/2 sm:justify-end">
                    <div className="flex flex-col text-sm sm:text-right">
                      <span className="text-muted-foreground sm:hidden">Balance</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatQuantity(entry.balanceBefore)} → <span className="font-medium text-foreground">{formatQuantity(entry.balanceAfter)}</span>
                      </span>
                    </div>

                    <div className="flex flex-col text-right">
                      <span className="text-sm text-muted-foreground sm:hidden">Qty</span>
                      <span className={cn(
                        "font-semibold tabular-nums text-base sm:text-lg",
                        isOut ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                      )}>
                        {isOut ? '-' : '+'}{formatQuantity(entry.quantity)}
                      </span>
                    </div>
                  </div>

                  {/* Desktop Date */}
                  <div className="hidden sm:flex sm:w-[140px] sm:flex-col sm:items-end sm:text-right">
                    <span className="text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat('en-UG', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'Africa/Kampala',
                      }).format(new Date(entry.createdAt))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('en-UG', {
                        hour: 'numeric',
                        minute: 'numeric',
                        timeZone: 'Africa/Kampala',
                      }).format(new Date(entry.createdAt))}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <LedgerEntryDetailDialog
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  )
}
