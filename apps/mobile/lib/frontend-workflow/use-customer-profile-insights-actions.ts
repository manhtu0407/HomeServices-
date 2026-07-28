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
  const customerProfileInsights = customerProfileInsightsState.sessionUserId === sessionUserId ? customerProfileInsightsState.insights : null

  const refreshCustomerProfileInsights = useCallback(async () => {
    if (!sessionUserId) {
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
  }, [sessionUserId])

  useEffect(() => {
    setCustomerProfileInsightsState(initialCustomerProfileInsightsState)
  }, [sessionUserId])

  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (isAppForeground()) void refreshCustomerProfileInsights()
  }, [role, sessionUserId, refreshCustomerProfileInsights])

  return {
    customerProfileInsights,
    refreshCustomerProfileInsights,
  }
}
