import { useCallback, useEffect, useRef, useState } from 'react'

import type { AmbassadorRedeemReceiptView, WorkerAmbassadorSummary } from '../api-types/program'
import { useAuth } from '../auth-provider'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '../client-request-id'
import { ambassadorService } from '../services/ambassador-service'

export type WorkerAmbassadorState = {
  summary: WorkerAmbassadorSummary | null
  loading: boolean
  loadErrorCode: string | null
  redeemingMilestoneId: string | null
  redeemErrorCode: string | null
  receipt: AmbassadorRedeemReceiptView | null
  codeBusy: boolean
}

export function useWorkerAmbassador() {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? ''
  const pendingRedeemRef = useRef<PendingClientRequestId | null>(null)
  const [state, setState] = useState<WorkerAmbassadorState>({
    summary: null,
    loading: true,
    loadErrorCode: null,
    redeemingMilestoneId: null,
    redeemErrorCode: null,
    receipt: null,
    codeBusy: false,
  })

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, loadErrorCode: null }))
    const result = await ambassadorService.getSummary(accessToken)
    setState((current) => result.success
      ? { ...current, loading: false, summary: result.data }
      : { ...current, loading: false, loadErrorCode: result.code })
  }, [accessToken])

  useEffect(() => {
    void reload()
  }, [reload])

  // The request id survives a failed attempt, so a retry after a dropped connection replays
  // the same redemption instead of spending the points twice.
  const redeem = useCallback(async (milestoneId: string) => {
    const fingerprint = `redeem:${milestoneId}`
    const clientRequestId = stableClientRequestId(pendingRedeemRef, fingerprint)
    setState((current) => ({ ...current, redeemingMilestoneId: milestoneId, redeemErrorCode: null, receipt: null }))
    const result = await ambassadorService.redeem(milestoneId, clientRequestId, accessToken)
    if (!result.success) {
      if (result.status >= 400 && result.status < 500) clearStableClientRequestId(pendingRedeemRef, fingerprint)
      setState((current) => ({ ...current, redeemingMilestoneId: null, redeemErrorCode: result.code }))
      return
    }
    clearStableClientRequestId(pendingRedeemRef, fingerprint)
    setState((current) => ({ ...current, redeemingMilestoneId: null, receipt: result.data }))
    await reload()
  }, [accessToken, reload])

  const ensureReferralCode = useCallback(async () => {
    setState((current) => ({ ...current, codeBusy: true }))
    const result = await ambassadorService.ensureReferralCode(accessToken)
    setState((current) => ({
      ...current,
      codeBusy: false,
      summary: result.success && current.summary
        ? { ...current.summary, referral_code: result.data.referral_code }
        : current.summary,
      loadErrorCode: result.success ? current.loadErrorCode : result.code,
    }))
  }, [accessToken])

  return { ...state, reload, redeem, ensureReferralCode }
}
