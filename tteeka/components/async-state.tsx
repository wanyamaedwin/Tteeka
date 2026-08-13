import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LoadingSkeleton({ label = 'Loading' }: { label?: string }) {
  return <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed bg-muted/30 text-sm text-muted-foreground" role="status">{label}…</div>
}

export function EmptyState({ title = 'Nothing here yet', description = 'There is no data to show.' }: { title?: string; description?: string }) {
  return <div className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-6 text-center"><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{description}</p></div>
}

export function ErrorState({ title = 'Something went wrong', description = 'We could not load this information.', onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 text-center"><AlertCircle className="size-5 text-destructive" aria-hidden="true" /><div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{description}</p></div>{onRetry ? <Button type="button" variant="outline" size="sm" onClick={onRetry}><RefreshCw data-icon="inline-start" />Retry</Button> : null}</div>
}

export function FormError({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null
}
