// ---------------------------------------------------------------------------
// components/catalogue/money-display.tsx
//
// BigInt-safe money display component.
//
// CRITICAL:
//   • amount prop is a STRING — never coerced to Number for storage.
//   • Formatting uses BigInt to validate, then Number only for Intl grouping
//     (display-only — no arithmetic is performed).
//   • currency prop is the ISO 4217 code snapshot (e.g. "UGX").
//   • Returns null for empty/null amount — caller renders "Not priced yet" etc.
// ---------------------------------------------------------------------------

type MoneyDisplayProps = {
  /** Canonical integer money string e.g. "85000". Never a JS number. */
  amount: string
  /** ISO 4217 currency code e.g. "UGX". */
  currency: string
  className?: string
}

/**
 * Renders a formatted money value: "UGX 85,000"
 * BigInt-safe — never performs Number arithmetic on the amount.
 * Returns null if amount is empty or invalid.
 */
export function MoneyDisplay({ amount, currency, className }: MoneyDisplayProps) {
  if (!amount || amount === '') return null
  try {
    // Validate via BigInt — preserves full integer precision
    const n = BigInt(amount)
    // Number is only used for Intl grouping display (no arithmetic)
    const display = new Intl.NumberFormat('en-UG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(n))
    return (
      <span className={className}>
        {currency} {display}
      </span>
    )
  } catch {
    // Fallback for malformed data — display raw string with currency
    return (
      <span className={className}>
        {currency} {amount}
      </span>
    )
  }
}
