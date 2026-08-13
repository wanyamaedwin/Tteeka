import type { ApiErrorPayload } from './types'

const fallbackMessages: Record<number, string> = {
  400: 'Some information needs to be corrected.',
  401: 'Your session is no longer available. Please sign in again.',
  403: "You don't have permission to do that.",
  404: "We couldn't find that item.",
  409: 'This change conflicts with existing information.',
  422: "This change can't be completed.",
  429: 'Too many requests. Please try again shortly.',
}

export class ApiError extends Error {
  readonly status: number | null
  readonly code?: string
  readonly fieldErrors?: Record<string, string | string[]>
  readonly requestContext?: string
  readonly isNetworkError: boolean

  constructor(options: {
    message: string
    status?: number | null
    code?: string
    fieldErrors?: Record<string, string | string[]>
    requestContext?: string
    isNetworkError?: boolean
  }) {
    super(options.message)
    this.name = 'ApiError'
    this.status = options.status ?? null
    this.code = options.code
    this.fieldErrors = options.fieldErrors
    this.requestContext = options.requestContext
    this.isNetworkError = options.isNetworkError ?? false
  }
}

export function messageForStatus(status: number) {
  return fallbackMessages[status] ?? (status >= 500 ? 'Something went wrong. Please try again.' : 'We could not complete that request.')
}

export function apiErrorFromPayload(status: number, payload: ApiErrorPayload, requestContext?: string) {
  const message = Array.isArray(payload.message) ? payload.message[0] : payload.message
  return new ApiError({
    status,
    message: message || messageForStatus(status),
    code: payload.code,
    fieldErrors: payload.errors,
    requestContext,
  })
}
