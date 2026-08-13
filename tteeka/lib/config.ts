export type AppMode = 'mock' | 'live'

export function getAppMode(): AppMode {
  return process.env.NEXT_PUBLIC_TTEEKA_APP_MODE === 'live' ? 'live' : 'mock'
}

export function isMockMode() {
  return getAppMode() === 'mock'
}

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL?.replace(/\/$/, '') ?? ''
}
