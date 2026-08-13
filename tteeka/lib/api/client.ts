import { getApiBaseUrl } from '@/lib/config'
import { ApiError, apiErrorFromPayload } from './errors'
import { toQueryString } from './pagination'
import type { ApiErrorPayload, RequestOptions } from './types'

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError({ status: response.status, message: 'The server returned an invalid response.' })
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, headers, requestContext, ...rest } = options
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) throw new ApiError({ message: 'Tteeka API is not configured.', requestContext })

  const url = `${baseUrl}${path}${toQueryString(query ?? {})}`
  const requestHeaders = new Headers(headers)
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetch(url, {
      ...rest,
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      cache: 'no-store',
    })
  } catch {
    throw new ApiError({
      message: "We couldn't reach Tteeka. Check your connection and try again.",
      requestContext,
      isNetworkError: true,
    })
  }

  const payload = await parseResponse(response)
  if (!response.ok) {
    throw apiErrorFromPayload(response.status, (payload ?? {}) as ApiErrorPayload, requestContext)
  }
  return payload as T
}
