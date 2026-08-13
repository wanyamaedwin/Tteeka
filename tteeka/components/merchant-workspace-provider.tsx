'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  getMockWorkspace,
  mockWorkspaces,
  type BusinessProfile,
  type BusinessSettings,
  type MerchantWorkspace,
  type Permission,
} from '@/lib/workspaces'
import {
  MOCK_MERCHANT_STAFF,
  MOCK_MERCHANT_ROLES_FIXTURE,
  generateMembershipId,
  type StaffMemberPreview,
  type RolePreview,
} from '@/lib/mock-staff'
import {
  MOCK_MERCHANT_PRODUCTS_FIXTURE,
  type ProductPreview,
} from '@/lib/mock-catalogue'
import {
  MOCK_MERCHANT_VARIANTS_FIXTURE,
  type ProductVariantPreview,
} from '@/lib/mock-variants'
import {
  MOCK_MERCHANT_PRICING_FIXTURE,
  MOCK_MERCHANT_PRICE_HISTORY_FIXTURE,
  generatePriceHistoryId,
  canonicalizePriceString,
  type VariantCurrentPricePreview,
  type VariantPriceHistoryPreview,
} from '@/lib/mock-pricing'
import {
  MOCK_MERCHANT_INVENTORY_FIXTURE,
  type InventoryBalancePreview,
  type InventoryLedgerEntryPreview,
  type InventoryLedgerEntryPublicPreview,
  type MockMovementRequest,
  type MockMovementResult,
  type MockCreateHoldRequest,
  type MockCreateHoldResult,
  type StockHoldPreview,
  applyMockInventoryMovement,
  getVariantLedger,
  getVariantEffectiveHolds,
  createMockHold,
  releaseMockHold,
  updateMockHoldExpiry
} from '@/lib/mock-inventory'
import { isMockMode } from '@/lib/config'
import { ApiError } from '@/lib/api/errors'
import { getMerchantContext, projectMerchantContext } from '@/lib/api/merchant-context'
import { ErrorState, LoadingSkeleton } from '@/components/async-state'
import { useAuth } from '@/components/auth-provider'
import { getMockOrderHolds, mockOrderReservationSnapshot, subscribeMockOrderReservations } from '@/lib/mock-order-reservations'
import { useSyncExternalStore } from 'react'
import { getWorkspaceStatus } from '@/lib/api/onboarding'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Unsaved-changes guard
// ---------------------------------------------------------------------------

export type SwitchGuardFn = (targetId: string) => Promise<boolean>

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

type WorkspaceContextValue = {
  workspace: MerchantWorkspace
  workspaces: MerchantWorkspace[]
  switching: boolean
  switchWorkspace: (id: string) => void
  requestWorkspaceSwitch: (id: string) => Promise<boolean>
  registerSwitchGuard: (fn: SwitchGuardFn | null) => void
  hasPermission: (permission: Permission) => boolean
  canManage: (managePermission: Permission, readPermission: Permission) => boolean
  // Business data (mock mode)
  profile: BusinessProfile
  settings: BusinessSettings
  updateMockProfile: (patch: Partial<BusinessProfile>) => void
  updateMockSettings: (patch: Partial<BusinessSettings>) => void
  // Staff data (mock mode)
  staffList: StaffMemberPreview[]
  /**
   * staffRoles — shared with F3.3 rolesList (same source).
   * All roles for the current workspace (ACTIVE + DISABLED).
   * Used by F3.2 for role badge display in staff list.
   */
  staffRoles: RolePreview[]
  addMockStaff: (member: StaffMemberPreview) => void
  updateMockMembershipStatus: (membershipId: string, status: 'ACTIVE' | 'DISABLED') => void
  updateMockMembershipRoles: (membershipId: string, roleIds: string[]) => void
  // Role data (mock mode) — F3.3 owned, shared with F3.2 via staffRoles
  rolesList: RolePreview[]
  addMockRole: (role: RolePreview) => void
  updateMockRole: (roleId: string, patch: Partial<Pick<RolePreview, 'name' | 'description'>>) => void
  updateMockRoleStatus: (roleId: string, status: 'ACTIVE' | 'DISABLED') => void
  updateMockRolePermissions: (roleId: string, permissionKeys: string[]) => void
  // Product data (mock mode) — F4.1 owned
  productList: ProductPreview[]
  addMockProduct: (product: ProductPreview) => void
  updateMockProduct: (productId: string, patch: Partial<Pick<ProductPreview, 'name' | 'description' | 'category' | 'brand'>>) => void
  updateMockProductStatus: (productId: string, status: ProductPreview['status']) => void
  // Variant data (mock mode) — F4.2 owned, separate from ProductPreview
  variantList: ProductVariantPreview[]
  addMockVariant: (variant: ProductVariantPreview) => void
  updateMockVariant: (variantId: string, patch: Partial<Pick<ProductVariantPreview, 'sku' | 'barcode' | 'size' | 'colour'>>) => void
  updateMockVariantStatus: (variantId: string, status: ProductVariantPreview['status']) => void
  // Pricing data (mock mode) — F4.3 owned, separate from ProductVariantPreview
  // Keyed by variantId. Absent key = unpriced. Pricing is Variant-specific; Product never owns price.
  currentPriceMap: Record<string, VariantCurrentPricePreview>
  priceHistoryMap: Record<string, VariantPriceHistoryPreview[]>
  /**
   * Set or update the current price for a Variant.
   * Appends exactly ONE immutable history record (unless identical to existing, handled by caller).
   * Currency is snapshotted from Merchant business settings — NOT editable in the form.
   * sellingPrice: canonical integer string > "0".
   * costPrice: canonical integer string >= "0", or null.
   */
  setMockVariantPrice: (
    variantId: string,
    sellingPrice: string,
    costPrice: string | null,
    currency: string,
    merchantId: string,
  ) => void
  // Inventory data (mock mode) — F5.1 owned, separate from ProductVariantPreview
  // Keyed by variantId. Absent key = AVAILABLE "0" (zero-balance semantics).
  // Inventory quantity is always a string — never a number.
  // F5.2 will add mutations via inventoryOverrides.
  inventoryBalanceMap: Record<string, InventoryBalancePreview>
  // F5.2/F5.3 Ledger
  // Append-only history of movements.
  executeInventoryMovement: (req: MockMovementRequest) => MockMovementResult
  getVariantLedgerHistory: (variantId: string) => import('@/lib/mock-inventory').InventoryLedgerEntryPublicPreview[]
  // F5.4 Holds
  holdOverrides: Record<string, Record<string, StockHoldPreview[]>>
  getVariantHolds: (variantId: string) => import('@/lib/mock-inventory').StockHoldPublicPreview[]
  executeHoldCommand: (action: 'create' | 'release' | 'updateExpiry', payload: any) => MockCreateHoldResult
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

const emptyLiveWorkspace: MerchantWorkspace = {
  id: '',
  name: '',
  location: '',
  status: 'ACTIVE',
  membershipStatus: 'ACTIVE',
  role: 'STAFF',
  permissions: [],
  profile: { displayName: '', legalName: null, phone: null, email: null },
  settings: { currency: '', timezone: '' },
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function MerchantWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const mockMode = isMockMode()
  const { clearUser } = useAuth()
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState(() => mockMode ? 'dstyle' : '')
  const [switching, setSwitching] = useState(false)
  const [liveWorkspace, setLiveWorkspace] = useState<MerchantWorkspace | null>(null)
  const [liveError, setLiveError] = useState<ApiError | null>(null)
  const [liveLoading, setLiveLoading] = useState(!mockMode)
  const [liveNoWorkspace, setLiveNoWorkspace] = useState(false)

  // Business overrides
  const [profileOverrides, setProfileOverrides] = useState<Record<string, Partial<BusinessProfile>>>({})
  const [settingsOverrides, setSettingsOverrides] = useState<Record<string, Partial<BusinessSettings>>>({})

  // Staff overrides — per workspace, full staff array (session mutable)
  const [staffOverrides, setStaffOverrides] = useState<Record<string, StaffMemberPreview[]>>({})

  // Role overrides — per workspace, full role array (session mutable)
  // F3.2 reads from here; F3.3 writes here. Single source of truth.
  const [roleOverrides, setRoleOverrides] = useState<Record<string, RolePreview[]>>({})

  // Product overrides — per workspace, full product array (session mutable)
  // F4.2 attaches ProductVariants via productId — separate collection.
  const [productOverrides, setProductOverrides] = useState<Record<string, ProductPreview[]>>({})

  // Variant overrides — per workspace, full variant array (session mutable)
  // Relationship: variant.productId → product.id
  // F4.3 pricing is kept in separate state (never embedded in ProductVariantPreview).
  const [variantOverrides, setVariantOverrides] = useState<Record<string, ProductVariantPreview[]>>({})

  // Pricing overrides — per workspace, map of variantId → VariantCurrentPricePreview
  // Absent key = unpriced Variant. Pricing is Variant-specific; Product never owns price.
  const [pricingOverrides, setPricingOverrides] = useState<Record<string, Record<string, VariantCurrentPricePreview>>>({})

  // Price history overrides — per workspace, map of variantId → VariantPriceHistoryPreview[]
  // Append-only. Newest first. Never edited or deleted.
  const [historyOverrides, setHistoryOverrides] = useState<Record<string, Record<string, VariantPriceHistoryPreview[]>>>({})

  // Inventory overrides — per workspace, map of variantId → InventoryBalancePreview
  // F5.1: read-only state from fixtures. F5.2 will write here via stock movements.
  // Absent key = AVAILABLE "0" (zero-balance semantics — derived, not stored).
  const [inventoryOverrides, setInventoryOverrides] = useState<Record<string, Record<string, InventoryBalancePreview>>>({})

  // Inventory Ledger overrides — per workspace, map of variantId → InventoryLedgerEntryPreview[]
  // Append-only. F5.2 creates these, F5.3 will display them.
  const [ledgerOverrides, setLedgerOverrides] = useState<Record<string, Record<string, InventoryLedgerEntryPreview[]>>>({})

  // Hold overrides — per workspace, map of variantId → StockHoldPreview[]
  const [holdOverrides, setHoldOverrides] = useState<Record<string, Record<string, StockHoldPreview[]>>>({})
  const reservationSnapshot = useSyncExternalStore(subscribeMockOrderReservations, mockOrderReservationSnapshot, mockOrderReservationSnapshot)

  const switchGuardRef = useRef<SwitchGuardFn | null>(null)

  const loadLiveWorkspace = useCallback(async () => {
    if (mockMode) return
    setLiveLoading(true)
    setLiveError(null)
    setLiveNoWorkspace(false)
    try {
      const status = await getWorkspaceStatus()
      if (status.state === 'NO_WORKSPACE') {
        setLiveNoWorkspace(true)
        router.replace('/onboarding/workspace')
        return
      }
      const resolvedWorkspaceId = status.workspace.merchantId
      setWorkspaceId(resolvedWorkspaceId)
      const context = await getMerchantContext(resolvedWorkspaceId)
      setLiveWorkspace(projectMerchantContext(context))
    } catch (cause) {
      const error = cause instanceof ApiError ? cause : new ApiError({ message: 'Unable to load the Merchant workspace.' })
      if (error.status === 401) clearUser()
      else setLiveError(error)
    } finally {
      setLiveLoading(false)
    }
  }, [clearUser, mockMode, router])

  useEffect(() => { void loadLiveWorkspace() }, [loadLiveWorkspace])

  const baseWorkspace = useMemo(
    () => mockMode ? getMockWorkspace(workspaceId) : (liveWorkspace ?? emptyLiveWorkspace),
    [liveWorkspace, mockMode, workspaceId],
  )

  const profile = useMemo<BusinessProfile>(
    () => ({ ...baseWorkspace.profile, ...(profileOverrides[workspaceId] ?? {}) }),
    [baseWorkspace, profileOverrides, workspaceId],
  )
  const settings = useMemo<BusinessSettings>(
    () => ({ ...baseWorkspace.settings, ...(settingsOverrides[workspaceId] ?? {}) }),
    [baseWorkspace, settingsOverrides, workspaceId],
  )

  // Staff list — use override if present, else fall back to fixture
  const staffList = useMemo<StaffMemberPreview[]>(() => {
    if (!isMockMode()) return []
    return staffOverrides[workspaceId] ?? MOCK_MERCHANT_STAFF[workspaceId] ?? []
  }, [staffOverrides, workspaceId])

  // Role list — use override if present, else fall back to fixture
  // This is the SINGLE shared state for F3.2 (staffRoles) and F3.3 (rolesList)
  const rolesList = useMemo<RolePreview[]>(() => {
    if (!isMockMode()) return []
    return roleOverrides[workspaceId] ?? MOCK_MERCHANT_ROLES_FIXTURE[workspaceId] ?? []
  }, [roleOverrides, workspaceId])

  // staffRoles is an alias of rolesList so F3.2 components keep working
  const staffRoles = rolesList

  // Product list — use override if present, else fall back to fixture
  const productList = useMemo<ProductPreview[]>(() => {
    if (!isMockMode()) return []
    return productOverrides[workspaceId] ?? MOCK_MERCHANT_PRODUCTS_FIXTURE[workspaceId] ?? []
  }, [productOverrides, workspaceId])

  // Variant list — use override if present, else fall back to fixture
  // This is the FULL merchant-scoped list. Components filter by productId as needed.
  const variantList = useMemo<ProductVariantPreview[]>(() => {
    if (!isMockMode()) return []
    return variantOverrides[workspaceId] ?? MOCK_MERCHANT_VARIANTS_FIXTURE[workspaceId] ?? []
  }, [variantOverrides, workspaceId])

  // Current price map — variantId → VariantCurrentPricePreview
  // Use override if present, else fall back to fixture.
  const currentPriceMap = useMemo<Record<string, VariantCurrentPricePreview>>(() => {
    if (!isMockMode()) return {}
    return pricingOverrides[workspaceId] ?? MOCK_MERCHANT_PRICING_FIXTURE[workspaceId] ?? {}
  }, [pricingOverrides, workspaceId])

  // Price history map — variantId → VariantPriceHistoryPreview[] (newest first)
  // Use override if present, else fall back to fixture.
  const priceHistoryMap = useMemo<Record<string, VariantPriceHistoryPreview[]>>(() => {
    if (!isMockMode()) return {}
    return historyOverrides[workspaceId] ?? MOCK_MERCHANT_PRICE_HISTORY_FIXTURE[workspaceId] ?? {}
  }, [historyOverrides, workspaceId])

  // Inventory balance map — variantId → InventoryBalancePreview
  // Use override if present (F5.2 mutations), else fall back to fixture.
  // Absent key = AVAILABLE "0" — do not expose absent key as an error.
  const inventoryBalanceMap = useMemo<Record<string, InventoryBalancePreview>>(() => {
    if (!isMockMode()) return {}
    return inventoryOverrides[workspaceId] ?? MOCK_MERCHANT_INVENTORY_FIXTURE[workspaceId] ?? {}
  }, [inventoryOverrides, workspaceId])

  const allHoldOverrides = useMemo(() => {
    void reservationSnapshot
    const orderHolds = getMockOrderHolds(workspaceId)
    if (orderHolds.length === 0) return holdOverrides
    const workspaceHolds = { ...(holdOverrides[workspaceId] ?? {}) }
    for (const hold of orderHolds) {
      workspaceHolds[hold.variantId] = [
        ...(workspaceHolds[hold.variantId] ?? []),
        { ...hold, orderManaged: true },
      ]
    }
    return { ...holdOverrides, [workspaceId]: workspaceHolds }
  }, [holdOverrides, reservationSnapshot, workspaceId])

  const doSwitch = useCallback((id: string) => {
    setSwitching(true)
    window.setTimeout(() => { setWorkspaceId(id); setSwitching(false) }, 180)
  }, [])

  const requestWorkspaceSwitch = useCallback(async (id: string): Promise<boolean> => {
    if (id === workspaceId) return true
    const guard = switchGuardRef.current
    if (guard) {
      const proceed = await guard(id)
      if (!proceed) return false
    }
    doSwitch(id)
    return true
  }, [workspaceId, doSwitch])

  const registerSwitchGuard = useCallback((fn: SwitchGuardFn | null) => {
    switchGuardRef.current = fn
  }, [])

  const updateMockProfile = useCallback((patch: Partial<BusinessProfile>) => {
    if (!isMockMode()) return
    setProfileOverrides((prev) => ({
      ...prev,
      [workspaceId]: { ...(prev[workspaceId] ?? {}), ...patch },
    }))
  }, [workspaceId])

  const updateMockSettings = useCallback((patch: Partial<BusinessSettings>) => {
    if (!isMockMode()) return
    setSettingsOverrides((prev) => ({
      ...prev,
      [workspaceId]: { ...(prev[workspaceId] ?? {}), ...patch },
    }))
  }, [workspaceId])

  // ── Staff mutators ─────────────────────────────────────────────────────────

  const addMockStaff = useCallback((member: StaffMemberPreview) => {
    if (!isMockMode()) return
    setStaffOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_STAFF[workspaceId] ?? []
      return { ...prev, [workspaceId]: [...current, member] }
    })
  }, [workspaceId])

  const updateMockMembershipStatus = useCallback((membershipId: string, status: 'ACTIVE' | 'DISABLED') => {
    if (!isMockMode()) return
    setStaffOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_STAFF[workspaceId] ?? []
      return {
        ...prev,
        [workspaceId]: current.map((m) =>
          m.membershipId === membershipId ? { ...m, membershipStatus: status } : m,
        ),
      }
    })
  }, [workspaceId])

  const updateMockMembershipRoles = useCallback((membershipId: string, roleIds: string[]) => {
    if (!isMockMode()) return
    setStaffOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_STAFF[workspaceId] ?? []
      return {
        ...prev,
        [workspaceId]: current.map((m) =>
          m.membershipId === membershipId ? { ...m, roleIds } : m,
        ),
      }
    })
  }, [workspaceId])

  // ── Role mutators (F3.3 — shared with F3.2 via staffRoles) ────────────────

  /** Add a newly created Role. Starts ACTIVE with zero permissions. */
  const addMockRole = useCallback((role: RolePreview) => {
    if (!isMockMode()) return
    setRoleOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_ROLES_FIXTURE[workspaceId] ?? []
      return { ...prev, [workspaceId]: [...current, role] }
    })
  }, [workspaceId])

  /** Update Role name and/or description. */
  const updateMockRole = useCallback((roleId: string, patch: Partial<Pick<RolePreview, 'name' | 'description'>>) => {
    if (!isMockMode()) return
    setRoleOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_ROLES_FIXTURE[workspaceId] ?? []
      return {
        ...prev,
        [workspaceId]: current.map((r) =>
          r.id === roleId ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
        ),
      }
    })
  }, [workspaceId])

  /** Set Role status ACTIVE or DISABLED. Retains permissionKeys and MembershipRole links. */
  const updateMockRoleStatus = useCallback((roleId: string, status: 'ACTIVE' | 'DISABLED') => {
    if (!isMockMode()) return
    setRoleOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_ROLES_FIXTURE[workspaceId] ?? []
      return {
        ...prev,
        [workspaceId]: current.map((r) =>
          r.id === roleId ? { ...r, status, updatedAt: new Date().toISOString() } : r,
        ),
      }
    })
  }, [workspaceId])

  /** Replace Role permission keys with exact desired state. */
  const updateMockRolePermissions = useCallback((roleId: string, permissionKeys: string[]) => {
    if (!isMockMode()) return
    setRoleOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_ROLES_FIXTURE[workspaceId] ?? []
      return {
        ...prev,
        [workspaceId]: current.map((r) =>
          r.id === roleId ? { ...r, permissionKeys, updatedAt: new Date().toISOString() } : r,
        ),
      }
    })
  }, [workspaceId])

  // ── Product mutators (F4.1) ───────────────────────────────────────────────

  /** Append a newly created Product. Starts ACTIVE, no variants. */
  const addMockProduct = useCallback((product: ProductPreview) => {
    if (!isMockMode()) return
    setProductOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_PRODUCTS_FIXTURE[workspaceId] ?? []
      return { ...prev, [workspaceId]: [...current, product] }
    })
  }, [workspaceId])

  /** Update Product metadata fields (name, description, category, brand). */
  const updateMockProduct = useCallback((
    productId: string,
    patch: Partial<Pick<ProductPreview, 'name' | 'description' | 'category' | 'brand'>>,
  ) => {
    if (!isMockMode()) return
    setProductOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_PRODUCTS_FIXTURE[workspaceId] ?? []
      return {
        ...prev,
        [workspaceId]: current.map((p) =>
          p.id === productId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
        ),
      }
    })
  }, [workspaceId])

  /** Update Product status (ACTIVE/INACTIVE/ARCHIVED). Retains all other fields.
   * IMPORTANT: Does NOT automatically change Variant statuses. Independence is intentional. */
  const updateMockProductStatus = useCallback((productId: string, status: ProductPreview['status']) => {
    if (!isMockMode()) return
    setProductOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_PRODUCTS_FIXTURE[workspaceId] ?? []
      return {
        ...prev,
        [workspaceId]: current.map((p) =>
          p.id === productId ? { ...p, status, updatedAt: new Date().toISOString() } : p,
        ),
      }
    })
  }, [workspaceId])

  // ── Variant mutators (F4.2) ───────────────────────────────────────────────

  /** Append a newly created Variant. Starts INACTIVE — activation requires F4.3 pricing. */
  const addMockVariant = useCallback((variant: ProductVariantPreview) => {
    if (!isMockMode()) return
    setVariantOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_VARIANTS_FIXTURE[workspaceId] ?? []
      return { ...prev, [workspaceId]: [...current, variant] }
    })
  }, [workspaceId])

  /** Update Variant identity fields (sku, barcode, size, colour).
   * Does NOT mutate: id, merchantId, productId, createdAt, status. */
  const updateMockVariant = useCallback((
    variantId: string,
    patch: Partial<Pick<ProductVariantPreview, 'sku' | 'barcode' | 'size' | 'colour'>>,
  ) => {
    if (!isMockMode()) return
    setVariantOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_VARIANTS_FIXTURE[workspaceId] ?? []
      return {
        ...prev,
        [workspaceId]: current.map((v) =>
          v.id === variantId ? { ...v, ...patch, updatedAt: new Date().toISOString() } : v,
        ),
      }
    })
  }, [workspaceId])

  /** Update Variant status. Does NOT mutate Product status. Independence intentional.
   * F4.3: activation (INACTIVE → ACTIVE) is only permitted when a current price exists.
   *       This enforcement lives in the UI layer — the mutator itself is unopinionated. */
  const updateMockVariantStatus = useCallback((variantId: string, status: ProductVariantPreview['status']) => {
    if (!isMockMode()) return
    setVariantOverrides((prev) => {
      const current = prev[workspaceId] ?? MOCK_MERCHANT_VARIANTS_FIXTURE[workspaceId] ?? []
      return {
        ...prev,
        [workspaceId]: current.map((v) =>
          v.id === variantId ? { ...v, status, updatedAt: new Date().toISOString() } : v,
        ),
      }
    })
  }, [workspaceId])

  // ── Pricing mutators (F4.3) ───────────────────────────────────────────────

  /**
   * Set or update the current price for a Variant.
   * Always appends exactly ONE immutable history record (newest first).
   * Caller must check isPriceIdentical before calling — this mutator does not deduplicate.
   * Currency is snapshotted from Merchant business settings (passed as param, not derived here).
   * sellingPrice: canonical integer string > "0". Must be pre-validated.
   * costPrice: canonical integer string >= "0", or null (not recorded).
   * Preserves all existing history rows. Never deletes history.
   */
  const setMockVariantPrice = useCallback((
    variantId: string,
    sellingPrice: string,
    costPrice: string | null,
    currency: string,
    merchantId: string,
  ) => {
    if (!isMockMode()) return
    const now = new Date().toISOString()
    const canonicalSell = canonicalizePriceString(sellingPrice)
    const canonicalCost = costPrice !== null ? canonicalizePriceString(costPrice) : null

    // Update current price
    setPricingOverrides((prev) => {
      const currentMap = prev[workspaceId] ?? MOCK_MERCHANT_PRICING_FIXTURE[workspaceId] ?? {}
      const updated: VariantCurrentPricePreview = {
        variantId,
        sellingPrice: canonicalSell,
        costPrice: canonicalCost,
        currency,
        updatedAt: now,
      }
      return { ...prev, [workspaceId]: { ...currentMap, [variantId]: updated } }
    })

    // Append one history record (newest first)
    setHistoryOverrides((prev) => {
      const currentHistoryMap = prev[workspaceId] ?? MOCK_MERCHANT_PRICE_HISTORY_FIXTURE[workspaceId] ?? {}
      const existingHistory = currentHistoryMap[variantId] ?? []
      const newRecord: VariantPriceHistoryPreview = {
        id: generatePriceHistoryId(),
        merchantId,
        variantId,
        sellingPrice: canonicalSell,
        costPrice: canonicalCost,
        currency,
        createdAt: now,
      }
      // Prepend (newest first)
      return {
        ...prev,
        [workspaceId]: {
          ...currentHistoryMap,
          [variantId]: [newRecord, ...existingHistory],
        },
      }
    })
  }, [workspaceId])

  // ── F5.2 Mock Command execution ──────────────────────────────────────────

  const executeInventoryMovement = useCallback(
    (req: MockMovementRequest): MockMovementResult => {
      // Create a localized view for the mock helper
      const currentLedgerMap = ledgerOverrides[req.merchantId] || {}

      const res = applyMockInventoryMovement(req, inventoryBalanceMap, currentLedgerMap)

      if (res.success && !res.replayed && res.balance && res.movement) {
        // Atomic update to both state objects
        setInventoryOverrides((prev) => ({
          ...prev,
          [req.merchantId]: {
            ...(prev[req.merchantId] || {}),
            [req.variantId]: res.balance!,
          },
        }))
        setLedgerOverrides((prev) => {
          const wsLedger = prev[req.merchantId] || {}
          const varLedger = wsLedger[req.variantId] || []
          return {
            ...prev,
            [req.merchantId]: {
              ...wsLedger,
              [req.variantId]: [res.movement!, ...varLedger],
            },
          }
        })
      }
      return res
    },
    [inventoryBalanceMap, ledgerOverrides],
  )

  // ── F5.4 Mock Hold execution ──────────────────────────────────────────────

  const executeHoldCommand = useCallback(
    (action: 'create' | 'release' | 'updateExpiry', payload: any): MockCreateHoldResult => {
      if (!baseWorkspace) return { success: false, error: 'No workspace' }
      let res: MockCreateHoldResult = { success: false, error: 'Invalid action' }

      if (action === 'create') {
        res = createMockHold(payload, inventoryBalanceMap, allHoldOverrides)
      } else if (action === 'release') {
        res = releaseMockHold(baseWorkspace.id, payload.variantId, payload.holdId, allHoldOverrides)
      } else if (action === 'updateExpiry') {
        res = updateMockHoldExpiry(baseWorkspace.id, payload.variantId, payload.holdId, payload.expiresAt, allHoldOverrides)
      }

      if (res.success && res.hold) {
        const h = res.hold
        setHoldOverrides((prev) => {
          const wsHolds = prev[h.merchantId] || {}
          const varHolds = wsHolds[h.variantId] || []
          // Replace or append
          const idx = varHolds.findIndex(x => x.id === h.id)
          const newVarHolds = [...varHolds]
          if (idx >= 0) newVarHolds[idx] = h
          else newVarHolds.push(h)
          return {
            ...prev,
            [h.merchantId]: {
              ...wsHolds,
              [h.variantId]: newVarHolds
            }
          }
        })
      }
      return res
    },
    [baseWorkspace, inventoryBalanceMap, allHoldOverrides]
  )

  const getVariantHolds = useCallback(
    (variantId: string) => {
      if (!baseWorkspace) return []
      return getVariantEffectiveHolds(baseWorkspace.id, variantId, allHoldOverrides)
    },
    [baseWorkspace, allHoldOverrides]
  )

  // ── F5.3 Ledger Access ───────────────────────────────────────────────────

  const getVariantLedgerHistory = useCallback(
    (variantId: string) => {
      if (!baseWorkspace) return []
      return getVariantLedger(baseWorkspace.id, variantId, ledgerOverrides)
    },
    [baseWorkspace, ledgerOverrides]
  )

  const value = useMemo<WorkspaceContextValue>(() => ({
    workspace: baseWorkspace,
    workspaces: mockMode ? mockWorkspaces : liveWorkspace ? [liveWorkspace] : [],
    switching,
    switchWorkspace: doSwitch,
    requestWorkspaceSwitch,
    registerSwitchGuard,
    hasPermission: (permission) => baseWorkspace.permissions.includes(permission),
    canManage: (managePermission, readPermission) =>
      baseWorkspace.permissions.includes(managePermission) ||
      baseWorkspace.permissions.includes(readPermission),
    profile,
    settings,
    updateMockProfile,
    updateMockSettings,
    staffList,
    staffRoles,
    addMockStaff,
    updateMockMembershipStatus,
    updateMockMembershipRoles,
    rolesList,
    addMockRole,
    updateMockRole,
    updateMockRoleStatus,
    updateMockRolePermissions,
    productList,
    addMockProduct,
    updateMockProduct,
    updateMockProductStatus,
    variantList,
    addMockVariant,
    updateMockVariant,
    updateMockVariantStatus,
    currentPriceMap,
    priceHistoryMap,
    setMockVariantPrice,
    inventoryBalanceMap,
    executeInventoryMovement,
    getVariantLedgerHistory,
    holdOverrides: allHoldOverrides,
    getVariantHolds,
    executeHoldCommand,
  }), [
    baseWorkspace,
    mockMode,
    liveWorkspace,
    switching,
    doSwitch,
    requestWorkspaceSwitch,
    registerSwitchGuard,
    profile,
    settings,
    updateMockProfile,
    updateMockSettings,
    staffList,
    staffRoles,
    addMockStaff,
    updateMockMembershipStatus,
    updateMockMembershipRoles,
    rolesList,
    addMockRole,
    updateMockRole,
    updateMockRoleStatus,
    updateMockRolePermissions,
    productList,
    addMockProduct,
    updateMockProduct,
    updateMockProductStatus,
    variantList,
    addMockVariant,
    updateMockVariant,
    updateMockVariantStatus,
    currentPriceMap,
    priceHistoryMap,
    setMockVariantPrice,
    inventoryBalanceMap,
    executeInventoryMovement,
    getVariantLedgerHistory,
    allHoldOverrides,
    getVariantHolds,
    executeHoldCommand,
  ])

  if (!mockMode && liveLoading) return <LoadingSkeleton label="Loading Merchant workspace" />
  if (!mockMode && liveNoWorkspace) return <LoadingSkeleton label="Opening workspace setup" />
  if (!mockMode && liveError) {
    return <ErrorState
      title={liveError.status === 403 ? 'Workspace access denied' : 'Workspace unavailable'}
      description={liveError.status === 403 ? "You don't have permission to access this workspace." : liveError.message}
      onRetry={() => void loadLiveWorkspace()}
    />
  }
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMerchantWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useMerchantWorkspace must be used within MerchantWorkspaceProvider')
  return context
}
