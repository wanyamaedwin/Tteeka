import { useState, useEffect, useCallback } from 'react'
import { isMockMode } from '../config'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { listHolds, getHold, createHold, releaseHold, updateHoldExpiry, type CreateHoldPayload, type UpdateHoldExpiryPayload } from '../api/inventory'
import type { StockHoldPublicPreview } from '../mock-inventory'

export function useStockHolds(merchantId: string, variantId: string) {
  const [holds, setHolds] = useState<StockHoldPublicPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { getVariantHolds } = useMerchantWorkspace()

  const fetchHolds = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (isMockMode()) {
        const mockHolds = getVariantHolds(variantId)
        setHolds(mockHolds)
      } else {
        const data = await listHolds(merchantId, variantId)
        setHolds(data)
      }
    } catch (err: any) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [merchantId, variantId, getVariantHolds])

  useEffect(() => {
    fetchHolds()
  }, [fetchHolds])

  return {
    holds,
    loading,
    error,
    mutate: fetchHolds
  }
}

export function useStockHold(merchantId: string, variantId: string, holdId: string) {
  const [hold, setHold] = useState<StockHoldPublicPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { getVariantHolds } = useMerchantWorkspace()

  const fetchHold = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (isMockMode()) {
        const mockHolds = getVariantHolds(variantId)
        const mockHold = mockHolds.find(h => h.id === holdId) || null
        setHold(mockHold)
      } else {
        const data = await getHold(merchantId, variantId, holdId)
        setHold(data)
      }
    } catch (err: any) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [merchantId, variantId, holdId, getVariantHolds])

  useEffect(() => {
    fetchHold()
  }, [fetchHold])

  return {
    hold,
    loading,
    error,
    mutate: fetchHold
  }
}

export function useStockHoldMutations(merchantId: string, variantId: string) {
  const { executeHoldCommand } = useMerchantWorkspace()

  const create = async (payload: CreateHoldPayload, idempotencyKey: string) => {
    if (isMockMode()) {
      const res = executeHoldCommand('create', { merchantId, variantId, ...payload, idempotencyKey })
      if (!res.success) throw new Error(res.error)
      return res.hold!
    } else {
      return await createHold(merchantId, variantId, payload, idempotencyKey)
    }
  }

  const release = async (holdId: string) => {
    if (isMockMode()) {
      const res = executeHoldCommand('release', { variantId, holdId })
      if (!res.success) throw new Error(res.error)
      return res.hold!
    } else {
      return await releaseHold(merchantId, variantId, holdId)
    }
  }

  const updateExpiry = async (holdId: string, payload: UpdateHoldExpiryPayload) => {
    if (isMockMode()) {
      const res = executeHoldCommand('updateExpiry', { variantId, holdId, ...payload })
      if (!res.success) throw new Error(res.error)
      return res.hold!
    } else {
      return await updateHoldExpiry(merchantId, variantId, holdId, payload)
    }
  }

  return {
    createHold: create,
    releaseHold: release,
    updateHoldExpiry: updateExpiry
  }
}
