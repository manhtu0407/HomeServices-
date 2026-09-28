import { useEffect, useRef } from 'react'

import { membershipService, type ReferralClaimOutcome } from '../services/membership-service'
import { clearPendingInvite, loadPendingInvite } from './pending-invite'

// Outcomes that can change on a later attempt keep the code; every final answer drops it.
const RETRYABLE_OUTCOMES = new Set<ReferralClaimOutcome>(['RATE_LIMITED', 'PROGRAM_UNAVAILABLE'])

export async function claimPendingInvite(accessToken: string): Promise<ReferralClaimOutcome | null> {
  const code = await loadPendingInvite()
  if (!code) return null
  const result = await membershipService.claimReferralCode(code, accessToken)
  if (!result.success) {
    // A refused request (4xx) will be refused again; a dropped one is retried next launch.
    if (result.status >= 400 && result.status < 500) await clearPendingInvite()
    return null
  }
  if (!RETRYABLE_OUTCOMES.has(result.data.outcome)) await clearPendingInvite()
  return result.data.outcome
}

export function useClaimPendingInvite(accessToken: string | null | undefined, isCustomer: boolean) {
  const attemptedTokenRef = useRef<string | null>(null)
  useEffect(() => {
    if (!accessToken || !isCustomer || attemptedTokenRef.current === accessToken) return
    attemptedTokenRef.current = accessToken
    void claimPendingInvite(accessToken)
  }, [accessToken, isCustomer])
}
