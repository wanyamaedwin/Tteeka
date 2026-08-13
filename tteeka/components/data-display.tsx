function formatIntegerString(amount: string) {
  const normalized = amount.trim()
  if (!/^-?\d+$/.test(normalized)) return null
  const negative = normalized.startsWith('-')
  const digits = negative ? normalized.slice(1) : normalized
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}`
}

export function MoneyDisplay({ amount, currency = 'UGX' }: { amount: string; currency?: string }) {
  const formatted = formatIntegerString(amount)
  return <span>{formatted ? `${currency} ${formatted}` : `${currency} —`}</span>
}

export function QuantityDisplay({ quantity, unit = 'units' }: { quantity: string; unit?: string }) {
  return <span>{quantity} {unit}</span>
}
