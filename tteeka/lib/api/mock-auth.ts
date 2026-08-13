import type { AuthUser } from '@/lib/api/types'
import { mockSessionUser } from '@/lib/mock-data'

export function getMockUser(): AuthUser {
  return mockSessionUser
}

export function setMockUser() {
  return mockSessionUser
}

export function clearMockUser() {
  return undefined
}
