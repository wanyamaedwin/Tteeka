import { apiRequest } from './client'
import { endpoints } from './endpoints'

export interface OnboardingResult {
  user: { id: string }
  merchant: { id: string; displayName: string }
  membership: { id: string }
}

export type WorkspaceStatus =
  | { state: 'NO_WORKSPACE' }
  | { state: 'READY'; workspace: { merchantId: string; displayName: string } }

export function registerMerchant(
  input: {
    name: string
    phone: string
    password: string
    businessName: string
  },
  idempotencyKey: string,
) {
  return apiRequest<OnboardingResult>(endpoints.onboarding.register, {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
    requestContext: 'onboarding.register',
  })
}

export function getWorkspaceStatus() {
  return apiRequest<WorkspaceStatus>(endpoints.onboarding.workspaceStatus, {
    requestContext: 'onboarding.workspaceStatus',
  })
}

export function createWorkspace(
  input: { businessName: string },
  idempotencyKey: string,
) {
  return apiRequest<OnboardingResult>(endpoints.onboarding.workspace, {
    method: 'POST',
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
    requestContext: 'onboarding.workspace',
  })
}
