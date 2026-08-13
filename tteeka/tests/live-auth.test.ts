import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { getCurrentUser, login, logout } from '../lib/api/auth'
import { ApiError } from '../lib/api/errors'
import { getMerchantContext, projectMerchantContext } from '../lib/api/merchant-context'

const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  delete process.env.NEXT_PUBLIC_TTEEKA_APP_MODE
  delete process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL
})

describe('INT0.1 live authentication transport', () => {
  it('uses the real Auth API contract with centralized cookie credentials', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_APP_MODE = 'live'
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1/'
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      if (String(input).endsWith('/auth/logout')) return new Response(null, { status: 204 })
      return jsonResponse({
        user: { id: 'user-1', displayName: 'Live User' },
        session: { expiresAt: '2026-08-14T00:00:00.000Z' },
      })
    }

    assert.deepEqual(await login({ phone: '0772123456', password: 'not-recorded' }), {
      id: 'user-1',
      displayName: 'Live User',
    })
    assert.deepEqual(await getCurrentUser(), { id: 'user-1', displayName: 'Live User' })
    await logout()

    assert.deepEqual(calls.map(({ url }) => url), [
      'http://localhost:3000/api/v1/auth/login',
      'http://localhost:3000/api/v1/auth/me',
      'http://localhost:3000/api/v1/auth/logout',
    ])
    assert.ok(calls.every(({ init }) => init?.credentials === 'include'))
    assert.ok(calls.every(({ init }) => init?.cache === 'no-store'))
    assert.equal(calls[0]?.init?.method, 'POST')
    assert.equal(calls[1]?.init?.method, 'GET')
    assert.equal(calls[2]?.init?.method, 'POST')
  })

  it('preserves 401 and 403 as distinct API errors without mock fallback', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_APP_MODE = 'live'
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    for (const status of [401, 403] as const) {
      globalThis.fetch = async () => jsonResponse({ statusCode: status, message: 'bounded' }, status)
      await assert.rejects(
        () => getCurrentUser(),
        (error: unknown) => error instanceof ApiError && error.status === status,
      )
    }
  })

  it('reports a live backend outage and never substitutes a mock user', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_APP_MODE = 'live'
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    globalThis.fetch = async () => { throw new TypeError('connection refused') }
    await assert.rejects(
      () => getCurrentUser(),
      (error: unknown) => error instanceof ApiError && error.isNetworkError,
    )
  })

  it('loads Merchant context from the API and projects only real permissions', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_APP_MODE = 'live'
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:3000/api/v1/merchants/merchant-1/context')
      assert.equal(init?.credentials, 'include')
      return jsonResponse({
        merchant: { id: 'merchant-1', displayName: 'Live Merchant' },
        membership: { id: 'membership-1' },
        roles: [{ id: 'role-1', name: 'Operator' }],
        permissions: ['customers.read', 'orders.read', 'unknown.permission'],
      })
    }

    const workspace = projectMerchantContext(await getMerchantContext('merchant-1'))
    assert.equal(workspace.id, 'merchant-1')
    assert.equal(workspace.name, 'Live Merchant')
    assert.equal(workspace.role, 'STAFF')
    assert.deepEqual(workspace.permissions, ['CUSTOMERS_READ', 'ORDERS_READ'])
    assert.equal(workspace.permissions.includes('INVENTORY_READ'), false)
  })
})
