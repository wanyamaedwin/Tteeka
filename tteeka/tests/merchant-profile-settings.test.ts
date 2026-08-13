import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '../lib/api/errors'
import { getMerchantContext, projectMerchantContext } from '../lib/api/merchant-context'
import {
  getMerchantProfile,
  getMerchantSettings,
  updateMerchantProfile,
  updateMerchantSettings,
} from '../lib/api/merchant-profile-settings'
import { getWorkspaceStatus } from '../lib/api/onboarding'

const originalFetch = globalThis.fetch
const profilePageSource = readFileSync(
  new URL('../app/app/business/profile/page.tsx', import.meta.url),
  'utf8',
)
const settingsPageSource = readFileSync(
  new URL('../app/app/business/settings/page.tsx', import.meta.url),
  'utf8',
)
const providerSource = readFileSync(
  new URL('../components/merchant-workspace-provider.tsx', import.meta.url),
  'utf8',
)
const profileFormSource = readFileSync(
  new URL('../components/business/business-profile-form.tsx', import.meta.url),
  'utf8',
)
const settingsFormSource = readFileSync(
  new URL('../components/business/business-settings-form.tsx', import.meta.url),
  'utf8',
)

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

describe('INT0.2A Merchant Profile and Settings live integration', () => {
  it('uses the exact Profile GET and PATCH contract with centralized transport', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return jsonResponse({
        id: 'merchant-from-context',
        displayName: 'Tteeka Shop',
        legalName: null,
        phone: '+256772123456',
        email: 'shop@example.com',
      })
    }

    await getMerchantProfile('merchant-from-context')
    await updateMerchantProfile('merchant-from-context', {
      displayName: 'Tteeka Shop',
      legalName: null,
      phone: '+256772123456',
      email: 'shop@example.com',
    })

    assert.deepEqual(calls.map(({ url }) => url), [
      'http://localhost:3000/api/v1/merchants/merchant-from-context/profile',
      'http://localhost:3000/api/v1/merchants/merchant-from-context/profile',
    ])
    assert.equal(calls[0]?.init?.method, 'GET')
    assert.equal(calls[1]?.init?.method, 'PATCH')
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
      displayName: 'Tteeka Shop',
      legalName: null,
      phone: '+256772123456',
      email: 'shop@example.com',
    })
    assert.ok(calls.every(({ init }) => init?.credentials === 'include'))
    assert.ok(calls.every(({ init }) => init?.cache === 'no-store'))
  })

  it('uses the exact Settings GET and PATCH contract with supported fields only', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return jsonResponse({ currency: 'UGX', timezone: 'Africa/Kampala' })
    }

    await getMerchantSettings('merchant-from-context')
    await updateMerchantSettings('merchant-from-context', {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    })

    assert.deepEqual(calls.map(({ url }) => url), [
      'http://localhost:3000/api/v1/merchants/merchant-from-context/settings',
      'http://localhost:3000/api/v1/merchants/merchant-from-context/settings',
    ])
    assert.equal(calls[0]?.init?.method, 'GET')
    assert.equal(calls[1]?.init?.method, 'PATCH')
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    })
  })

  it('keeps read and manage permissions independent for both resources', () => {
    const workspace = projectMerchantContext({
      merchant: { id: 'merchant-from-context', displayName: 'Shop' },
      membership: { id: 'membership-from-context' },
      roles: [{ id: 'role-from-context', name: 'Operator' }],
      permissions: [
        'merchant.profile.manage',
        'merchant.settings.manage',
      ],
    })
    assert.equal(workspace.permissions.includes('MERCHANT_PROFILE_MANAGE'), true)
    assert.equal(workspace.permissions.includes('MERCHANT_PROFILE_READ'), false)
    assert.equal(workspace.permissions.includes('MERCHANT_SETTINGS_MANAGE'), true)
    assert.equal(workspace.permissions.includes('MERCHANT_SETTINGS_READ'), false)
    assert.match(profilePageSource, /if \(mockMode \|\| !canRead\)/)
    assert.match(settingsPageSource, /if \(mockMode \|\| !canRead\)/)
  })

  it('preserves distinct 401 and 403 errors and never falls back after an outage', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_APP_MODE = 'live'
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    for (const status of [401, 403] as const) {
      globalThis.fetch = async () => jsonResponse({ message: 'bounded' }, status)
      await assert.rejects(
        () => getMerchantProfile('merchant-from-context'),
        (error: unknown) => error instanceof ApiError && error.status === status,
      )
      await assert.rejects(
        () => getMerchantSettings('merchant-from-context'),
        (error: unknown) => error instanceof ApiError && error.status === status,
      )
    }
    globalThis.fetch = async () => { throw new TypeError('connection refused') }
    await assert.rejects(
      () => getMerchantProfile('merchant-from-context'),
      (error: unknown) => error instanceof ApiError && error.isNetworkError,
    )
    await assert.rejects(
      () => updateMerchantSettings('merchant-from-context', { currency: 'UGX' }),
      (error: unknown) => error instanceof ApiError && error.isNetworkError,
    )
  })

  it('uses only the authenticated workspace Merchant ID and preserves mock mode', () => {
    assert.match(profilePageSource, /getMerchantProfile\(workspace\.id\)/)
    assert.match(profilePageSource, /updateMerchantProfile\(workspace\.id, patch\)/)
    assert.match(settingsPageSource, /getMerchantSettings\(workspace\.id\)/)
    assert.match(settingsPageSource, /updateMerchantSettings\(workspace\.id, patch\)/)
    assert.match(profilePageSource, /updateMockProfile\(patch\)/)
    assert.match(settingsPageSource, /updateMockSettings\(patch\)/)
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    assert.doesNotMatch(profilePageSource, uuid)
    assert.doesNotMatch(settingsPageSource, uuid)
  })

  it('does not mount Profile or Settings calls for the NO_WORKSPACE bootstrap', () => {
    const noWorkspaceBranch = providerSource.indexOf("status.state === 'NO_WORKSPACE'")
    const contextRequest = providerSource.indexOf('getMerchantContext(resolvedWorkspaceId)')
    assert.notEqual(noWorkspaceBranch, -1)
    assert.ok(noWorkspaceBranch < contextRequest)
    assert.match(providerSource.slice(noWorkspaceBranch, contextRequest), /return/)
    assert.doesNotMatch(providerSource, /merchant-profile-settings/)
  })

  it('uses a newly onboarded READY workspace through the normal context and B2.1 APIs', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    const urls: string[] = []
    globalThis.fetch = async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.endsWith('/onboarding/workspace-status')) {
        return jsonResponse({
          state: 'READY',
          workspace: { merchantId: 'newly-onboarded-merchant', displayName: 'New Shop' },
        })
      }
      if (url.endsWith('/merchants/newly-onboarded-merchant/context')) {
        return jsonResponse({
          merchant: { id: 'newly-onboarded-merchant', displayName: 'New Shop' },
          membership: { id: 'new-membership' },
          roles: [{ id: 'owner-role', name: 'Owner' }],
          permissions: [
            'merchant.profile.read',
            'merchant.profile.manage',
            'merchant.settings.read',
            'merchant.settings.manage',
          ],
        })
      }
      if (url.endsWith('/profile')) {
        return jsonResponse({
          id: 'newly-onboarded-merchant',
          displayName: 'New Shop',
          legalName: null,
          phone: null,
          email: null,
        })
      }
      return jsonResponse({ currency: 'UGX', timezone: 'Africa/Kampala' })
    }

    const status = await getWorkspaceStatus()
    assert.equal(status.state, 'READY')
    if (status.state !== 'READY') return
    const workspace = projectMerchantContext(
      await getMerchantContext(status.workspace.merchantId),
    )
    const [profile, settings] = await Promise.all([
      getMerchantProfile(workspace.id),
      getMerchantSettings(workspace.id),
    ])
    assert.equal(profile.displayName, 'New Shop')
    assert.deepEqual(settings, { currency: 'UGX', timezone: 'Africa/Kampala' })
    assert.ok(urls.slice(1).every((url) => url.includes('newly-onboarded-merchant')))
  })

  it('renders bounded load and save errors without backend detail leakage', () => {
    assert.match(profilePageSource, /Unable to load business profile\./)
    assert.match(settingsPageSource, /Unable to load settings\./)
    assert.match(profileFormSource, /We couldn't save your business details\./)
    assert.match(settingsFormSource, /We couldn't save these settings\./)
  })
})
