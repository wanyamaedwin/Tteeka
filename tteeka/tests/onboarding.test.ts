import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '../lib/api/errors'
import {
  createWorkspace,
  getWorkspaceStatus,
  registerMerchant,
} from '../lib/api/onboarding'

const originalFetch = globalThis.fetch
const registrationSource = readFileSync(
  new URL('../app/register/page.tsx', import.meta.url),
  'utf8',
)
const workspaceSource = readFileSync(
  new URL('../app/onboarding/workspace/page.tsx', import.meta.url),
  'utf8',
)
const providerSource = readFileSync(
  new URL('../components/merchant-workspace-provider.tsx', import.meta.url),
  'utf8',
)

afterEach(() => {
  globalThis.fetch = originalFetch
  delete process.env.NEXT_PUBLIC_TTEEKA_APP_MODE
  delete process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL
})

describe('INT0.1C onboarding transport and UI boundaries', () => {
  it('sends registration and workspace commands to live APIs with the caller stable key', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_APP_MODE = 'live'
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return new Response(
        JSON.stringify({
          user: { id: 'u1' },
          merchant: { id: 'm1', displayName: 'Shop' },
          membership: { id: 'mm1' },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )
    }
    const registration = {
      name: 'Owner',
      phone: '0772123456',
      password: 'not-persisted',
      businessName: 'Shop',
    }
    await registerMerchant(registration, 'stable-registration-key')
    await registerMerchant(registration, 'stable-registration-key')
    await createWorkspace({ businessName: 'Shop' }, 'stable-workspace-key')
    assert.deepEqual(
      calls.map(({ url }) => url),
      [
        'http://localhost:3000/api/v1/onboarding/register',
        'http://localhost:3000/api/v1/onboarding/register',
        'http://localhost:3000/api/v1/onboarding/workspace',
      ],
    )
    assert.deepEqual(
      calls.map(({ init }) =>
        new Headers(init?.headers).get('Idempotency-Key'),
      ),
      [
        'stable-registration-key',
        'stable-registration-key',
        'stable-workspace-key',
      ],
    )
    assert.ok(
      calls.every(
        ({ init }) =>
          init?.credentials === 'include' && init.cache === 'no-store',
      ),
    )
  })

  it('preserves NO_WORKSPACE as an explicit authenticated bootstrap state', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ state: 'NO_WORKSPACE' }), { status: 200 })
    assert.deepEqual(await getWorkspaceStatus(), { state: 'NO_WORKSPACE' })
    assert.match(providerSource, /status\.state === 'NO_WORKSPACE'/)
    assert.match(providerSource, /router\.replace\('\/onboarding\/workspace'\)/)
  })

  it('keeps 401, 403 and no-workspace states distinct', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    for (const status of [401, 403] as const) {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ message: 'bounded' }), { status })
      await assert.rejects(
        () => getWorkspaceStatus(),
        (error: unknown) =>
          error instanceof ApiError && error.status === status,
      )
    }
    assert.match(workspaceSource, /next\.status === 401/)
    assert.match(workspaceSource, /error\.status === 403/)
  })

  it('reports live onboarding outages without mock fallback', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_APP_MODE = 'live'
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    globalThis.fetch = async () => {
      throw new TypeError('connection refused')
    }
    await assert.rejects(
      () =>
        registerMerchant(
          {
            name: 'Owner',
            phone: '0772123456',
            password: 'secret-value',
            businessName: 'Shop',
          },
          'stable-key',
        ),
      (error: unknown) => error instanceof ApiError && error.isNetworkError,
    )
    await assert.rejects(
      () => createWorkspace({ businessName: 'Shop' }, 'stable-key'),
      (error: unknown) => error instanceof ApiError && error.isNetworkError,
    )
  })

  it('renders accessible registration validation and never sends confirmation', () => {
    for (const label of [
      'Your name',
      'Phone number',
      'Business name',
      'Password',
      'Confirm password',
    ])
      assert.match(registrationSource, new RegExp(label))
    assert.match(registrationSource, /form\.password !== form\.confirmPassword/)
    assert.match(registrationSource, /aria-describedby/)
    assert.match(registrationSource, /role="alert"/)
    const requestStart = registrationSource.indexOf('await registerMerchant(')
    assert.notEqual(requestStart, -1)
    const registrationRequest = registrationSource.slice(
      requestStart,
      requestStart + 500,
    )
    for (const field of ['name:', 'phone:', 'password:', 'businessName:']) {
      assert.match(registrationRequest, new RegExp(field))
    }
    assert.doesNotMatch(registrationRequest, /confirmPassword/)
  })

  it('keeps idempotency keys stable for one logical form submission and mock mode deterministic', () => {
    assert.match(registrationSource, /useRef\(crypto\.randomUUID\(\)\)/)
    assert.match(workspaceSource, /useRef\(crypto\.randomUUID\(\)\)/)
    assert.match(registrationSource, /if \(isMockMode\(\)\)/)
    assert.match(workspaceSource, /if \(isMockMode\(\)\)/)
  })
})
