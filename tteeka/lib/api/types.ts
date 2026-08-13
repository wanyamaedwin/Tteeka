export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions extends Omit<RequestInit, 'method' | 'body'> {
  method?: HttpMethod
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  requestContext?: string
}

export interface ApiErrorPayload {
  statusCode?: number
  message?: string | string[]
  code?: string
  errors?: Record<string, string | string[]>
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

export interface AuthUser {
  id: string
  displayName: string
}

export interface AuthSessionResponse {
  user: AuthUser
  session: { expiresAt: string }
}
