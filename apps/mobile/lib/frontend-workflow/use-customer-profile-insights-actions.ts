import { useCallback, useEffect, useState } from 'react'
import type { UserRole } from '@nestscout/shared'
import type { CustomerProfileInsightsResponse } from '../api-types'
import { customerProfileService } from '../services'
import { sameCustomerProfileInsights } from './comparisons'
import { isAppForeground } from './helpers'

type CustomerProfileInsightsState = {
  insights: CustomerProfileInsightsResponse | null
  sessionUserId: string | null
}

const initialCustomerProfileInsightsState: CustomerProfileInsightsState = {
  insights: null,
  sessionUserId: null,
}

type CustomerProfileInsightsActionsInput = {
  role: UserRole | null
  sessionUserId: string | null
}

export function useCustomerProfileInsightsActions({
  role,
  sessionUserId,
}: CustomerProfileInsightsActionsInput) {
  const [customerProfileInsightsState, setCustomerProfileInsightsState] = useState<CustomerProfileInsightsState>(initialCustomerProfileInsightsState)
  const customerProfileInsights = role === 'customer' && customerProfileInsightsState.sessionUserId === sessionUserId
    ? customerProfileInsightsState.insights
    : null

  const refreshCustomerProfileInsights = useCallback(async () => {
    if (!sessionUserId || role !== 'customer') {
      setCustomerProfileInsightsState(initialCustomerProfileInsightsState)
      return false
    }
    const result = await customerProfileService.getInsights()
    if (!result.success) {
      setCustomerProfileInsightsState({
        insights: null,
        sessionUserId,
      })
      return false
    }
    setCustomerProfileInsightsState((current) => {
      const currentInsights = current.sessionUserId === sessionUserId ? current.insights : null
      return current.sessionUserId === sessionUserId && sameCustomerProfileInsights(currentInsights, result.data)
        ? current
        : { insights: result.data, sessionUserId }
    })
    return true
  }, [role, sessionUserId])

  useEffect(() => {
    const refreshTimer = setTimeout(() => {
      if (!sessionUserId || role !== 'customer') {
        void refreshCustomerProfileInsights()
        return
      }
      if (isAppForeground()) void refreshCustomerProfileInsights()
    }, 0)
    return () => clearTimeout(refreshTimer)
  }, [role, sessionUserId, refreshCustomerProfileInsights])

  const saveCustomerDefaultAddress = useCallback(async (defaultAddress: string) => {
    if (!sessionUserId || role !== 'customer') return false
    const result = await customerProfileService.saveAddress({ default_address: defaultAddress })
    if (!result.success) return false
    // The PATCH already returns a fresh insights snapshot, so apply it
    // directly instead of triggering a second refresh round trip.
    setCustomerProfileInsightsState({ insights: result.data, sessionUserId })
    return true
  }, [role, sessionUserId])

  return {
    customerProfileInsights,
    refreshCustomerProfileInsights,
    saveCustomerDefaultAddress,
  }
}
