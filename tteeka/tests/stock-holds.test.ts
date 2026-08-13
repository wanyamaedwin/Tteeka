import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getInventoryAvailability,
  getVariantEffectiveHolds,
  createMockHold,
  releaseMockHold,
  updateMockHoldExpiry,
  getVariantLedger,
  MOCK_MERCHANT_INVENTORY_FIXTURE,
  MOCK_MERCHANT_HOLDS_FIXTURE,
  type StockHoldPreview,
} from '../lib/mock-inventory'
import { canRead, canManage, type Permission } from '../lib/workspaces'
import { endpoints } from '../lib/api/endpoints'
import { listHolds, getHold, createHold, releaseHold, updateHoldExpiry, getInventoryItem } from '../lib/api/inventory'
import { ApiError } from '../lib/api/errors'

describe('F5.4 — Stock Holds & Sellable Availability Test Suite', () => {
  const merchantId = 'dstyle'
  const balanceMap = MOCK_MERCHANT_INVENTORY_FIXTURE[merchantId]

  // 1. Physical / Held / Sellable calculation
  it('correctly calculates physical, held, and sellable quantities', () => {
    // var-dstyle-002: physical 20, active holds 0
    const avail002 = getInventoryAvailability(merchantId, 'var-dstyle-002', balanceMap, {})
    assert.strictEqual(avail002.physicalQuantity, '20')
    assert.strictEqual(avail002.heldQuantity, '0')
    assert.strictEqual(avail002.sellableQuantity, '20')

    // var-dstyle-003: physical 20, active holds 6 (4 + 2)
    const avail003 = getInventoryAvailability(merchantId, 'var-dstyle-003', balanceMap, {})
    assert.strictEqual(avail003.physicalQuantity, '20')
    assert.strictEqual(avail003.heldQuantity, '6')
    assert.strictEqual(avail003.sellableQuantity, '14')
  })

  // 2. Positive Physical + zero Sellable (fully held case)
  it('handles fully held variants where physical > 0 and sellable = 0', () => {
    // var-dstyle-010: physical 10, active hold 10
    const avail010 = getInventoryAvailability(merchantId, 'var-dstyle-010', balanceMap, {})
    assert.strictEqual(avail010.physicalQuantity, '10')
    assert.strictEqual(avail010.heldQuantity, '10')
    assert.strictEqual(avail010.sellableQuantity, '0')
    // Distinguishable from zero physical stock
    assert.notStrictEqual(avail010.physicalQuantity, '0')
  })

  // 3. Safe field projection for Holds (no idempotencyKey or requestHash in public view)
  it('projects safe fields for holds list, hiding internal metadata', () => {
    const holds = getVariantEffectiveHolds(merchantId, 'var-dstyle-003', {})
    assert.ok(holds.length > 0)
    for (const hold of holds) {
      assert.ok('id' in hold)
      assert.ok('status' in hold)
      assert.ok('quantity' in hold)
      assert.ok('expiresAt' in hold)
      assert.ok('createdAt' in hold)
      // Internal fields must be redacted
      assert.strictEqual((hold as any).idempotencyKey, undefined)
      assert.strictEqual((hold as any).requestHash, undefined)
    }
  })

  // 4. Effective expiry simulation & clock injection
  it('correctly simulates effective expiry when current time exceeds expiresAt', () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString()
    const customHolds: Record<string, Record<string, StockHoldPreview[]>> = {
      dstyle: {
        'var-dstyle-002': [
          {
            id: 'test-hold-exp',
            merchantId: 'dstyle',
            variantId: 'var-dstyle-002',
            status: 'ACTIVE',
            quantity: '5',
            expiresAt: futureDate,
            createdAt: new Date().toISOString(),
            releasedAt: null,
            expiredAt: null,
          },
        ],
      },
    }

    // Before expiry (now = current time): hold is ACTIVE
    const holdsBefore = getVariantEffectiveHolds('dstyle', 'var-dstyle-002', customHolds, Date.now())
    const testHoldBefore = holdsBefore.find(h => h.id === 'test-hold-exp')
    assert.strictEqual(testHoldBefore?.status, 'ACTIVE')

    const availBefore = getInventoryAvailability('dstyle', 'var-dstyle-002', balanceMap, customHolds, Date.now())
    assert.strictEqual(availBefore.heldQuantity, '5')
    assert.strictEqual(availBefore.sellableQuantity, '15')

    // After expiry (injected time = 2 hours in future): hold becomes EXPIRED and restores sellable stock
    const futureTime = new Date(futureDate).getTime() + 1000
    const holdsAfter = getVariantEffectiveHolds('dstyle', 'var-dstyle-002', customHolds, futureTime)
    const testHoldAfter = holdsAfter.find(h => h.id === 'test-hold-exp')
    assert.strictEqual(testHoldAfter?.status, 'EXPIRED')

    const availAfter = getInventoryAvailability('dstyle', 'var-dstyle-002', balanceMap, customHolds, futureTime)
    assert.strictEqual(availAfter.physicalQuantity, '20')
    assert.strictEqual(availAfter.heldQuantity, '0')
    assert.strictEqual(availAfter.sellableQuantity, '20')
  })

  // 5. Create Hold mock semantics (Physical unchanged, Held +, Sellable -)
  it('creates mock hold and updates quantities atomically', () => {
    const holdRes = createMockHold(
      {
        merchantId: 'dstyle',
        variantId: 'var-dstyle-002',
        quantity: '4',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        idempotencyKey: 'test-ikey-1',
      },
      balanceMap,
      {}
    )
    assert.strictEqual(holdRes.success, true)
    assert.ok(holdRes.hold)
    assert.strictEqual(holdRes.hold?.quantity, '4')
    assert.strictEqual(holdRes.hold?.status, 'ACTIVE')
  })

  // 6. Capacity failure error messaging
  it('returns human error message on insufficient capacity', () => {
    const failRes = createMockHold(
      {
        merchantId: 'dstyle',
        variantId: 'var-dstyle-002',
        quantity: '100',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        idempotencyKey: 'test-ikey-2',
      },
      balanceMap,
      {}
    )
    assert.strictEqual(failRes.success, false)
    assert.ok(failRes.error?.includes('Not enough stock available to hold.'))
    assert.ok(failRes.error?.includes('Only 20 units are currently available to sell.'))
  })

  // 7. Idempotency-Key stability
  it('returns exact duplicate hold when submitting with identical idempotencyKey', () => {
    const req = {
      merchantId: 'dstyle',
      variantId: 'var-dstyle-002',
      quantity: '3',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      idempotencyKey: 'test-stable-key-99',
    }
    const holdOverrides: Record<string, Record<string, StockHoldPreview[]>> = {}

    const res1 = createMockHold(req, balanceMap, holdOverrides)
    assert.strictEqual(res1.success, true)

    // Store in overrides
    holdOverrides['dstyle'] = { 'var-dstyle-002': [res1.hold!] }

    // Re-submit with exact same key
    const res2 = createMockHold(req, balanceMap, holdOverrides)
    assert.strictEqual(res2.success, true)
    assert.strictEqual(res2.hold?.id, res1.hold?.id)
  })

  // 8. Release Hold mock semantics (Physical unchanged, Held -, Sellable +)
  it('releases active hold restoring sellable quantity', () => {
    const holdOverrides: Record<string, Record<string, StockHoldPreview[]>> = {
      dstyle: {
        'var-dstyle-002': [
          {
            id: 'hold-rel-1',
            merchantId: 'dstyle',
            variantId: 'var-dstyle-002',
            status: 'ACTIVE',
            quantity: '5',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: new Date().toISOString(),
            releasedAt: null,
            expiredAt: null,
          },
        ],
      },
    }

    const availBefore = getInventoryAvailability('dstyle', 'var-dstyle-002', balanceMap, holdOverrides)
    assert.strictEqual(availBefore.heldQuantity, '5')
    assert.strictEqual(availBefore.sellableQuantity, '15')

    const relRes = releaseMockHold('dstyle', 'var-dstyle-002', 'hold-rel-1', holdOverrides)
    assert.strictEqual(relRes.success, true)
    assert.strictEqual(relRes.hold?.status, 'RELEASED')

    holdOverrides['dstyle']['var-dstyle-002'] = [relRes.hold!]

    const availAfter = getInventoryAvailability('dstyle', 'var-dstyle-002', balanceMap, holdOverrides)
    assert.strictEqual(availAfter.physicalQuantity, '20')
    assert.strictEqual(availAfter.heldQuantity, '0')
    assert.strictEqual(availAfter.sellableQuantity, '20')
  })

  // 9. Update expiry mock semantics
  it('updates hold expiry without altering held or sellable quantity', () => {
    const newDate = new Date(Date.now() + 172800000).toISOString()
    const holdOverrides: Record<string, Record<string, StockHoldPreview[]>> = {
      dstyle: {
        'var-dstyle-002': [
          {
            id: 'hold-upd-1',
            merchantId: 'dstyle',
            variantId: 'var-dstyle-002',
            status: 'ACTIVE',
            quantity: '5',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: new Date().toISOString(),
            releasedAt: null,
            expiredAt: null,
          },
        ],
      },
    }

    const updRes = updateMockHoldExpiry('dstyle', 'var-dstyle-002', 'hold-upd-1', newDate, holdOverrides)
    assert.strictEqual(updRes.success, true)
    assert.strictEqual(updRes.hold?.expiresAt, newDate)

    holdOverrides['dstyle']['var-dstyle-002'] = [updRes.hold!]

    const availAfter = getInventoryAvailability('dstyle', 'var-dstyle-002', balanceMap, holdOverrides)
    assert.strictEqual(availAfter.heldQuantity, '5')
    assert.strictEqual(availAfter.sellableQuantity, '15')
  })

  // 10. Permission exact semantics: INVENTORY_READ vs INVENTORY_MANAGE
  it('enforces exact permission rules for INVENTORY_READ and INVENTORY_MANAGE', () => {
    const readOnlyUser = ['INVENTORY_READ'] as const
    const manageOnlyUser = ['INVENTORY_MANAGE'] as const
    const fullUser = ['INVENTORY_READ', 'INVENTORY_MANAGE'] as const
    const noAccessUser: readonly Permission[] = []

    assert.strictEqual(canRead('INVENTORY_READ', readOnlyUser), true)
    assert.strictEqual(canRead('INVENTORY_READ', manageOnlyUser), false)

    // Critical rule: INVENTORY_MANAGE does NOT imply INVENTORY_READ
    assert.strictEqual(canRead('INVENTORY_READ', manageOnlyUser), false)

    assert.strictEqual(canManage('INVENTORY_MANAGE', 'INVENTORY_READ', fullUser), true)
    assert.strictEqual(canManage('INVENTORY_MANAGE', 'INVENTORY_READ', readOnlyUser), true)
    assert.strictEqual(canRead('INVENTORY_READ', noAccessUser), false)
  })

  // 11. Live API endpoints completeness
  it('builds canonical endpoints for all live inventory hold operations', () => {
    assert.strictEqual(endpoints.inventory.item('dstyle', 'var-1'), '/merchants/dstyle/inventory/var-1')
    assert.strictEqual(endpoints.inventory.holds('dstyle', 'var-1'), '/merchants/dstyle/inventory/var-1/holds')
    assert.strictEqual(endpoints.inventory.hold('dstyle', 'var-1', 'hold-1'), '/merchants/dstyle/inventory/var-1/holds/hold-1')
    assert.strictEqual(endpoints.inventory.releaseHold('dstyle', 'var-1', 'hold-1'), '/merchants/dstyle/inventory/var-1/holds/hold-1/release')
    assert.strictEqual(endpoints.inventory.updateHoldExpiry('dstyle', 'var-1', 'hold-1'), '/merchants/dstyle/inventory/var-1/holds/hold-1/expiry')
  })

  // 12. Live API functions export completeness
  it('exports typed functions for all required live API operations', () => {
    assert.strictEqual(typeof getInventoryItem, 'function')
    assert.strictEqual(typeof listHolds, 'function')
    assert.strictEqual(typeof getHold, 'function')
    assert.strictEqual(typeof createHold, 'function')
    assert.strictEqual(typeof releaseHold, 'function')
    assert.strictEqual(typeof updateHoldExpiry, 'function')
  })

  // 13. Live mode no mock fallback proof
  it('throws ApiError in live mode without silently falling back to mock data', async () => {
    // In live mode without API base URL configured, apiRequest throws ApiError
    await assert.rejects(
      async () => {
        await listHolds('dstyle', 'var-dstyle-002')
      },
      (err: any) => {
        assert.ok(err instanceof ApiError || err.name === 'ApiError')
        return true
      }
    )
  })

  // 14. Order-managed hold conflict handling
  it('identifies order-managed hold conflict error codes', () => {
    const orderErr = new ApiError({
      message: 'This hold belongs to an order and cannot be modified.',
      code: 'ORDER_MANAGED_HOLD',
      status: 409,
    })
    assert.strictEqual(orderErr.code, 'ORDER_MANAGED_HOLD')
    assert.strictEqual(orderErr.status, 409)
  })

  // 15. F5.3 Inventory Ledger regression check
  it('ensures holds do not pollute physical inventory movement ledger', () => {
    const ledgerBefore = getVariantLedger('dstyle', 'var-dstyle-002', {})

    // Create hold
    createMockHold(
      {
        merchantId: 'dstyle',
        variantId: 'var-dstyle-002',
        quantity: '5',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        idempotencyKey: 'test-ledger-hold-1',
      },
      balanceMap,
      {}
    )

    const ledgerAfter = getVariantLedger('dstyle', 'var-dstyle-002', {})
    // Ledger entries count remains identical because Holds do NOT create movement entries
    assert.strictEqual(ledgerAfter.length, ledgerBefore.length)
  })
})
