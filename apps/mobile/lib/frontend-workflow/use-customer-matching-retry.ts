import { useCallback, useEffect, useEffectEvent, useRef, useState, type Dispatch, type RefObject } from 'react'
import { AppState } from 'react-native'
import type { LocalWorkflowAction, LocalWorkflowState, MatchingRetryReceipt, UserRole } from '@nestscout/shared'
import { createClientDiagnosticMetadata } from '../api'
import type { ApiResponseMetadata } from '../api-types/shared'
import type { AppLanguage } from '../app-language'
import { jobService } from '../services'
import { validateMatchingRetryResult } from '../services/customer-matching-retry'
import { localizeWorkflowError, type WorkflowErrorHandler, type WorkflowErrorInput } from './errors'
import { getRemoteJobId, isAppForeground } from './helpers'
import { jobDetailToSnapshot } from './snapshots'
import { recoverCustomerLegacyConfirmation } from './legacy-confirmation-recovery'
import {
  isMatchingRetryTerminal, listMatchingRetries, MATCHING_RETRY_REJECTIONS,
  prepareMatchingRetry, storeMatchingRetry, type PendingMatchingRetry,
} from './matching-retry-recovery'

type RetryInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  language: AppLanguage
  role: UserRole | null
  sessionUserId: string | null
  sessionAccessToken?: string
  setRemoteError: WorkflowErrorHandler
  stateRef: RefObject<LocalWorkflowState>
}

function receiptCode(receipt: Pick<MatchingRetryReceipt, 'state'>) {
  if (receipt.state === 'queued') return 'MATCHING_RETRY_QUEUED'
  if (receipt.state === 'no_reachable_worker') return 'NO_REACHABLE_WORKER'
  if (receipt.state === 'recovery_required') return 'RECOVERY_REQUIRED'
  if (receipt.state === 'stopped') return 'MATCHING_RETRY_STOPPED'
  return null
}

export function useCustomerMatchingRetry({
  dispatch, language, role, sessionUserId, sessionAccessToken, setRemoteError, stateRef,
}: RetryInput) {
  const lifecycle = useRef({ active: false, generation: 0 })
  const flights = useRef(new Map<string, Promise<boolean>>())
  const automatic = useRef({ inFlight: false, remaining: 20 })
  const hydratedTerminals = useRef(new Set<string>())
  const [feedback, setFeedback] = useState<{ ownerId: string | null; jobId: string; error: WorkflowErrorInput } | null>(null)

  const processRetry = useCallback((jobId: string, explicit: boolean, sessionId?: string): Promise<boolean> => {
    const generation = lifecycle.current.generation
    const flightKey = `${generation}:${sessionUserId}:${jobId}`
    const inFlight = flights.current.get(flightKey)
    if (inFlight) return inFlight
    const current = () => lifecycle.current.active && lifecycle.current.generation === generation
    const visible = () => current() && getRemoteJobId(stateRef.current) === jobId
    const authorized = () => current() && (!explicit || visible())
    const report = (code: string, meta?: ApiResponseMetadata) => {
      if (!visible()) return false
      const error = { success: false as const, code, error: '', status: 0, meta: meta ?? createClientDiagnosticMetadata() }
      setFeedback({ ownerId: sessionUserId, jobId, error })
      return setRemoteError(error)
    }

    const request = (async () => {
      if (!authorized() || !isAppForeground()) return false
      // Bind every call to the initiating account, never the mutable shared Auth session.
      if (role !== 'customer' || !sessionUserId || !sessionAccessToken) return report('AUTH_REQUIRED')
      let pending: PendingMatchingRetry | undefined
      try {
        pending = (await listMatchingRetries(sessionUserId)).find((record) => record.jobId === jobId)
      } catch { return report('MATCHING_RETRY_STORAGE_UNAVAILABLE') }
      if (!authorized()) return false
      if (!explicit && (!pending || pending.rejectedCode)) return true

      if (explicit && (!pending || isMatchingRetryTerminal(pending.receipt) || pending.rejectedCode)) {
        let latest = await jobService.getMatchingOperation(jobId, sessionAccessToken)
        if (!visible() || !isAppForeground()) return false
        if (!latest.success) return report(latest.code, latest.meta)
        if (!latest.data.operation && sessionId) {
          const recovered = await recoverCustomerLegacyConfirmation({
            sessionId, jobId, customerId: sessionUserId, accessToken: sessionAccessToken,
            current: () => visible() && isAppForeground(),
          })
          if (!recovered || !visible() || !isAppForeground()) return false
          if (!recovered.success) return report(recovered.code, recovered.meta)
          latest = await jobService.getMatchingOperation(jobId, sessionAccessToken)
          if (!visible() || !isAppForeground()) return false
          if (!latest.success) return report(latest.code, latest.meta)
        }
        if (!latest.data.operation || latest.data.operation.state !== 'no_reachable_worker') {
          return report(latest.data.operation ? receiptCode(latest.data.operation) ?? 'MATCHING_RETRY_NOT_READY' : 'MATCHING_RETRY_CONFIRMATION_UNAVAILABLE', latest.meta)
        }
        try {
          pending = await prepareMatchingRetry(sessionUserId, jobId, latest.data.operation.operation_id)
        } catch { return report('MATCHING_RETRY_STORAGE_UNAVAILABLE') }
      }
      if (!pending || !authorized() || !isAppForeground()) return false
      report('MATCHING_RETRY_OUTCOME_UNKNOWN', pending.receipt ? { ...createClientDiagnosticMetadata(), supportCode: pending.receipt.support_code } : undefined)
      let result = validateMatchingRetryResult(
        await jobService.getMatchingRetry(jobId, pending.request.client_request_id, sessionAccessToken), jobId, pending.request,
      )
      if (!authorized() || !isAppForeground()) return false
      let posted = false
      // A missing receipt may replay the persisted command, never invent a new identity.
      if (!result.success && result.status === 404 && result.code === 'NOT_FOUND' && !pending.receipt) {
        posted = true
        result = validateMatchingRetryResult(await jobService.confirmSearch(jobId, pending.request, sessionAccessToken), jobId, pending.request)
      }
      if (!current()) return false
      if (!result.success) {
        const rejection = MATCHING_RETRY_REJECTIONS.find((code) => code === result.code)
          ?? (result.status >= 400 && result.status < 500 && result.status !== 401 && result.status !== 403
            ? result.code : undefined)
        if (posted && rejection) {
          try { await storeMatchingRetry({ ...pending, rejectedCode: rejection }) }
          catch { return report('MATCHING_RETRY_STORAGE_UNAVAILABLE', result.meta) }
          return report(result.code, result.meta)
        }
        return report('MATCHING_RETRY_OUTCOME_UNKNOWN', result.meta)
      }
      const receipt = result.data.operation
      const meta = { ...createClientDiagnosticMetadata(), ...result.meta, supportCode: receipt.support_code }
      try {
        if (!await storeMatchingRetry({ ...pending, receipt, rejectedCode: null })) return report('RECOVERY_REQUIRED', meta)
      } catch { return report('MATCHING_RETRY_STORAGE_UNAVAILABLE', meta) }
      if (!current()) return false
      const knownCode = receiptCode(receipt)
      if (knownCode) report(knownCode, meta)
      // A receipt proves acceptance, not delivery. Only a fresh job snapshot may change the timeline.
      if (visible() && isAppForeground()) {
        const job = await jobService.getJob(jobId, sessionAccessToken)
        if (!visible()) return true
        const validJob = job.success && job.data.job?.id === jobId
        if (validJob) {
          dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(job.data, false) })
          if (isMatchingRetryTerminal(receipt)) hydratedTerminals.current.add(receipt.request_id)
        }
        const code = knownCode ?? (!validJob ? 'MATCHING_RETRY_READ_UNAVAILABLE' : null)
        if (code) report(code, meta)
        else setFeedback(null)
      }
      return true
    })().catch(() => report('MATCHING_RETRY_OUTCOME_UNKNOWN')).finally(() => {
      if (flights.current.get(flightKey) === request) flights.current.delete(flightKey)
    })
    flights.current.set(flightKey, request)
    return request
  }, [dispatch, role, sessionAccessToken, sessionUserId, setRemoteError, stateRef])

  const reconcile = useEffectEvent(async () => {
    if (!lifecycle.current.active || role !== 'customer' || !sessionUserId || !sessionAccessToken
      || !isAppForeground() || automatic.current.inFlight || automatic.current.remaining <= 0) return
    const generation = lifecycle.current.generation
    automatic.current.inFlight = true
    automatic.current.remaining -= 1
    try {
      const pending = await listMatchingRetries(sessionUserId)
      for (const record of pending) {
        if (lifecycle.current.generation !== generation || !lifecycle.current.active || !isAppForeground()) break
        const terminalNeedsHydration = isMatchingRetryTerminal(record.receipt)
          && record.jobId === getRemoteJobId(stateRef.current)
          && !hydratedTerminals.current.has(record.request.client_request_id)
        if (!record.rejectedCode && (!isMatchingRetryTerminal(record.receipt) || terminalNeedsHydration)) await processRetry(record.jobId, false)
      }
    } catch {
      const jobId = getRemoteJobId(stateRef.current)
      if (jobId && lifecycle.current.active && lifecycle.current.generation === generation) {
        const error = { success: false as const, code: 'MATCHING_RETRY_STORAGE_UNAVAILABLE', error: '', status: 0, meta: createClientDiagnosticMetadata() }
        setFeedback({ ownerId: sessionUserId, jobId, error })
        setRemoteError(error)
      }
    } finally {
      if (lifecycle.current.generation === generation) automatic.current.inFlight = false
    }
  })

  useEffect(() => {
    if (role !== 'customer' || !sessionUserId) return
    lifecycle.current.active = true
    lifecycle.current.generation += 1
    automatic.current = { inFlight: false, remaining: 20 }
    hydratedTerminals.current.clear()
    void reconcile()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      automatic.current.remaining = 20
      void reconcile()
    })
    const timer = setInterval(() => { void reconcile() }, 5_000)
    return () => {
      lifecycle.current.active = false
      lifecycle.current.generation += 1
      clearInterval(timer)
      subscription.remove()
    }
  }, [role, sessionUserId, sessionAccessToken])

  const confirmRemoteSearch = useCallback((jobIdOverride?: string, sessionId?: string) => {
    const jobId = jobIdOverride ?? getRemoteJobId(stateRef.current)
    if (!jobId) return Promise.resolve(setRemoteError('Chưa có yêu cầu để tìm thợ'))
    automatic.current.remaining = 20
    return processRetry(jobId, true, sessionId)
  }, [processRetry, setRemoteError, stateRef])

  return {
    confirmRemoteSearch,
    customerMatchingRetryFeedback: feedback && feedback.ownerId === sessionUserId
      && feedback.jobId === getRemoteJobId(stateRef.current) && stateRef.current.deal?.status === 'broadcasting'
      ? { jobId: feedback.jobId, message: localizeWorkflowError(feedback.error, language) }
      : null,
  }
}
