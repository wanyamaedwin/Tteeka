import { apiRequest } from './client'
import { endpoints } from './endpoints'
import type { AuthSessionResponse } from './types'

export type LoginInput = { phone: string; password: string }

export function login(input: LoginInput) {
  return apiRequest<AuthSessionResponse>(endpoints.auth.login, { method: 'POST', body: input, requestContext: 'auth.login' })
    .then((response) => response.user)
}

export function getCurrentUser() {
  return apiRequest<AuthSessionResponse>(endpoints.auth.me, { requestContext: 'auth.me' })
    .then((response) => response.user)
}

export function logout() {
  return apiRequest<void>(endpoints.auth.logout, { method: 'POST', requestContext: 'auth.logout' })
}

export function logoutAll() {
  return apiRequest<void>(endpoints.auth.logoutAll, { method: 'POST', requestContext: 'auth.logoutAll' })
}
