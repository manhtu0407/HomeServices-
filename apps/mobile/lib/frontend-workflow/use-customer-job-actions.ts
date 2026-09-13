import type { WorkflowErrorHandler } from './errors'
import { useCallback, useEffect, useMemo, useRef, type Dispatch, type RefObject } from 'react'
import {
  JOB_STATUSES,
  toLocalDealStatus,
  type LocalDealDraft,
  type LocalWorkflowAction,
  type LocalWorkflowState,
  type UserRole,
} from '@nestscout/shared'
import { createClientDiagnosticMetadata, type ApiResult } from '../api'
import type { FavoriteWorkerForMatching, JobDetailResponse } from '../api-types'
import type { ApiResponseMetadata } from '../api-types/shared'
import type { AppLanguage } from '../app-language'
import type { PendingClientRequestId } from '../client-request-id'
import type { LocalMediaUploadDraft } from '../media-upload'
import { jobService } from '../services'
import {
  clearPendingConfirmation,
  listPendingConfirmations,
  writePendingConfirmation,
} from './confirmation-recovery'
import { reconcilePendingConfirmationRequest } from './confirmation-reconciliation'
import { useCustomerMatchingRetry } from './use-customer-matching-retry'
import { useCustomerMatchingSelection } from './use-customer-matching-selection'
import { useCustomerApartmentAccess } from './use-customer-apartment-access'
import {
  defaultCustomerCancellationInput,
  getRemoteJobId,
  isAppForeground,
  usesBeforeAcceptCancelEndpoint,
} from './helpers'
import {
  dealToSnapshot,
  jobDetailToSnapshot,
} from './snapshots'

type CustomerJobActionsInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  language: AppLanguage
  pendingJobCreateClientRequestRef: RefObject<PendingClientRequestId | null>
  role: UserRole | null
  sessionAccessToken?: string
  sessionUserId: string | null
  setRemoteError: WorkflowErrorHandler
  stateRef: RefObject<LocalWorkflowState>
}

type JobReadFlight = { current: () => boolean; request: Promise<boolean> }

export function useCustomerJobActions({
  dispatch,
  language,
  role,
  sessionAccessToken,
  sessionUserId,
  setRemoteError,
  stateRef,
}: CustomerJobActionsInput) {
  const currentJobRefreshInFlightRef = useRef<(JobReadFlight & { jobId: string }) | null>(null)
  const cancellationInFlightRef = useRef<(JobReadFlight & { jobId: string }) | null>(null)
  const activeJobHydrationInFlightRef = useRef<JobReadFlight | null>(null)
  const confirmationRecoveryInFlightRef = useRef<JobReadFlight | null>(null)
  const selectedJobReadRef = useRef(0)
  // An old callback must stay retired even if the same account signs in again.
  const jobSession = useMemo(() => ({ active: false, generation: 0 }), [role, sessionUserId])
  useEffect(() => {
    jobSession.active = true
    jobSession.generation += 1
    return () => {
      jobSession.active = false
      jobSession.generation += 1
    }
  }, [jobSession])
  const captureJobRead = useCallback(() => {
    const generation = jobSession.generation
    const selection = selectedJobReadRef.current
    return () => Boolean(sessionUserId && role && jobSession.active
      && jobSession.generation === generation && selectedJobReadRef.current === selection)
  }, [jobSession, role, sessionUserId])
  const reportReadFailure = useCallback((code: 'NETWORK_ERROR' | 'INVALID_RESPONSE') => setRemoteError({
    success: false, code, error: '', status: 0, meta: createClientDiagnosticMetadata(),
  }), [setRemoteError])
  const { confirmRemoteSearch, customerMatchingRetryFeedback } = useCustomerMatchingRetry({
    dispatch, language, role, sessionAccessToken, sessionUserId, setRemoteError, stateRef,
  })
  const { setMatchingPreference, customerMatchingSelectionFeedback, customerMatchingSelectionState } = useCustomerMatchingSelection({
    dispatch, language, role, sessionAccessToken, sessionUserId, setRemoteError, stateRef,
  })
  const { authorizeApartmentAccess, customerApartmentAccessState } = useCustomerApartmentAccess({
    dispatch, language, role, sessionAccessToken, sessionUserId, setRemoteError, stateRef,
  })
  const hydrateJobResult = useCallback((result: ApiResult<JobDetailResponse>) => {
    if (!result.success) return setRemoteError(result)
    dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(result.data, role === 'worker' || role === 'admin') })
    return true
  }, [dispatch, role, setRemoteError])

  // The caller can pass its own access token so a just-confirmed job hydrates
  // even when the shared client still holds a stale session.
  const hydrateRemoteJobById = useCallback(async (jobId: string, accessToken?: string) => {
    const token = accessToken ?? sessionAccessToken
    if (!captureJobRead()() || !token) return false
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tải lại')
    selectedJobReadRef.current += 1
    const current = captureJobRead()
    try {
      const result = await jobService.getJob(jobId, token)
      if (!current()) return false
      if (result.success && result.data.job?.id !== jobId) return reportReadFailure('INVALID_RESPONSE')
      return hydrateJobResult(result)
    } catch {
      return current() ? reportReadFailure('NETWORK_ERROR') : false
    }
  }, [captureJobRead, hydrateJobResult, reportReadFailure, sessionAccessToken, setRemoteError])

  const reconcilePendingConfirmations = useCallback(() => {
    if (!sessionUserId || !sessionAccessToken || role !== 'customer') return Promise.resolve(false)
    const generation = jobSession.generation
    const recoverySelection = selectedJobReadRef.current
    const current = () => jobSession.active && jobSession.generation === generation && isAppForeground()
    if (!current()) return Promise.resolve(false)
    if (confirmationRecoveryInFlightRef.current?.current()) return confirmationRecoveryInFlightRef.current.request
    const hydrateRecoveredJob = async (jobId: string) => {
      const visibleJobId = getRemoteJobId(stateRef.current)
      if (current() && selectedJobReadRef.current === recoverySelection && (!visibleJobId || visibleJobId === jobId)) {
        await hydrateRemoteJobById(jobId, sessionAccessToken)
      }
    }
    const request = (async () => {
      const pendingRecords = await listPendingConfirmations(sessionUserId)
      let recoveredWithoutError = true
      for (const pending of pendingRecords) {
        if (!current()) return false
        try {
          const outcome = await reconcilePendingConfirmationRequest(pending, sessionAccessToken, undefined, current)
          if (!current()) return false
          if (outcome.kind === 'receipt') {
            if (outcome.receipt.terminal) {
              await clearPendingConfirmation(sessionUserId, pending.sessionId)
            } else {
              await writePendingConfirmation({
                ...pending,
                operation: outcome.receipt,
                supportCode: outcome.receipt.support_code,
                updatedAt: outcome.receipt.updated_at,
              })
            }
            if (outcome.receipt.job_id) {
              await hydrateRecoveredJob(outcome.receipt.job_id)
            }
            continue
          }
          if (outcome.kind === 'job') {
            await clearPendingConfirmation(sessionUserId, pending.sessionId)
            await hydrateRecoveredJob(outcome.jobId)
            continue
          }
          if (outcome.kind === 'failure') {
            await clearPendingConfirmation(sessionUserId, pending.sessionId)
            continue
          }
          await writePendingConfirmation({
            ...pending,
            supportCode: outcome.supportCode,
            updatedAt: new Date().toISOString(),
          })
        } catch {
          recoveredWithoutError = false
        }
      }
      if (!recoveredWithoutError && current()) return setRemoteError({
        success: false, code: 'CONFIRMATION_RECOVERY_UNAVAILABLE', error: '', status: 0,
        meta: createClientDiagnosticMetadata(),
      })
      return recoveredWithoutError && current()
    })().catch(() => current() ? setRemoteError({
      success: false, code: 'CONFIRMATION_RECOVERY_UNAVAILABLE', error: '', status: 0,
      meta: createClientDiagnosticMetadata(),
    }) : false).finally(() => {
      if (confirmationRecoveryInFlightRef.current?.request === request) {
        confirmationRecoveryInFlightRef.current = null
      }
    })
    confirmationRecoveryInFlightRef.current = { current, request }
    return request
  }, [hydrateRemoteJobById, jobSession, role, sessionAccessToken, sessionUserId, setRemoteError, stateRef])

  const refreshCurrentJob = useCallback(() => {
    const inSession = captureJobRead()
    if (!inSession() || !sessionAccessToken) return Promise.resolve(false)
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return Promise.resolve(setRemoteError('Chưa có yêu cầu để tải lại'))
    const current = () => inSession() && getRemoteJobId(stateRef.current) === jobId
    const flight = currentJobRefreshInFlightRef.current
    if (flight?.jobId === jobId && flight.current()) return flight.request
    const request = (async () => {
      const result = await jobService.getJob(jobId, sessionAccessToken)
      if (!current()) return false
      if (result.success && result.data.job?.id !== jobId) return reportReadFailure('INVALID_RESPONSE')
      return hydrateJobResult(result)
    })().catch(() => current() ? reportReadFailure('NETWORK_ERROR') : false).finally(() => {
      if (currentJobRefreshInFlightRef.current?.request === request) currentJobRefreshInFlightRef.current = null
    })
    currentJobRefreshInFlightRef.current = { jobId, current, request }
    return request
  }, [captureJobRead, hydrateJobResult, reportReadFailure, sessionAccessToken, setRemoteError, stateRef])

  // Hydrate the active job from the backend so refresh/cold start keeps the
  // backend as source of truth without noisy "no active job" banners.
  const hydrateCustomerActiveJob = useCallback(() => {
    const current = captureJobRead()
    if (!current() || !sessionAccessToken || (role !== 'customer' && role !== 'admin')) return Promise.resolve(false)
    if (getRemoteJobId(stateRef.current)) return Promise.resolve(true)
    if (activeJobHydrationInFlightRef.current?.current()) return activeJobHydrationInFlightRef.current.request
    const request = (async () => {
      const result = await jobService.listMyActiveJob(sessionAccessToken)
      if (!current()) return false
      if (!result.success) return false
      if (!result.data.active_job) return true
      // A direct route can hydrate while this bootstrap request is in flight.
      // Keep that newer, explicitly selected job instead of replacing it.
      if (getRemoteJobId(stateRef.current)) return true
      dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(result.data.active_job, false) })
      return true
    })().catch(() => current() ? reportReadFailure('NETWORK_ERROR') : false).finally(() => {
      if (activeJobHydrationInFlightRef.current?.request === request) activeJobHydrationInFlightRef.current = null
    })
    activeJobHydrationInFlightRef.current = { current, request }
    return request
  }, [captureJobRead, dispatch, reportReadFailure, role, sessionAccessToken, stateRef])

  const createRemoteJobFromDraft = useCallback(async (
    _draftOverride?: LocalDealDraft,
    _mediaItems: LocalMediaUploadDraft[] = [],
  ) => {
    if (!captureJobRead()()) return false
    // Compatibility entry points cannot bypass the durable confirmation receipt.
    return setRemoteError({
      success: false, code: 'KAEL_CASE_WORK_REQUIRED', error: '', status: 409,
      meta: createClientDiagnosticMetadata(),
    })
  }, [captureJobRead, setRemoteError])

  const listFavoriteWorkersForMatching = useCallback(async (): Promise<FavoriteWorkerForMatching[] | null> => {
    const inSession = captureJobRead()
    if (!inSession() || role !== 'customer' || !sessionAccessToken) return null
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) {
      setRemoteError('Chưa có yêu cầu để tải thợ đã lưu')
      return null
    }
    const current = () => inSession() && getRemoteJobId(stateRef.current) === jobId
    try {
      const result = await jobService.listFavoriteWorkersForMatching(jobId, sessionAccessToken)
      if (!current()) return null
      if (!result.success) {
        setRemoteError(result)
        return null
      }
      if (!Array.isArray(result.data?.workers)) {
        reportReadFailure('INVALID_RESPONSE')
        return null
      }
      return result.data.workers
    } catch {
      if (current()) reportReadFailure('NETWORK_ERROR')
      return null
    }
  }, [captureJobRead, reportReadFailure, role, sessionAccessToken, setRemoteError, stateRef])

  const cancelRemoteJob = useCallback(() => {
    const inSession = captureJobRead()
    if (!inSession() || role !== 'customer' || !sessionAccessToken) return Promise.resolve(false)
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) {
      selectedJobReadRef.current += 1
      dispatch({ type: 'cancel_deal' })
      return Promise.resolve(true)
    }
    const current = () => inSession() && getRemoteJobId(stateRef.current) === jobId
    const flight = cancellationInFlightRef.current
    if (flight?.jobId === jobId && flight.current()) return flight.request
    const existing = stateRef.current.deal
    const reportUnknown = (meta?: ApiResponseMetadata) => current() ? setRemoteError({
      success: false, code: 'CANCELLATION_OUTCOME_UNKNOWN', error: '', status: 0,
      meta: meta ?? createClientDiagnosticMetadata(),
    }) : false
    const reconcile = async (meta?: ApiResponseMetadata) => {
      if (!current()) return false
      reportUnknown(meta)
      try {
        const detail = await jobService.getJob(jobId, sessionAccessToken)
        if (!current()) return false
        if (detail.success && detail.data.job?.id === jobId) {
          if (detail.data.job.status === 'cancelled') {
            selectedJobReadRef.current += 1
            return hydrateJobResult(detail)
          }
          hydrateJobResult(detail)
        }
      } catch {
        // A failed read cannot prove whether the cancellation committed.
      }
      return reportUnknown(meta)
    }
    const request = (async () => {
      const requiresReview = existing && !usesBeforeAcceptCancelEndpoint(existing.status)
      const result = requiresReview
        ? await jobService.requestCustomerCancellation(jobId, defaultCustomerCancellationInput(language), sessionAccessToken)
        : await jobService.cancelJob(jobId, sessionAccessToken)
      if (!current()) return false
      if (!result.success) {
        // Even a status conflict may be a replay after an earlier commit.
        if (result.status === 0 || result.status === undefined || result.status >= 500
          || [401, 403, 408, 409, 425, 429].includes(result.status)
          || ['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE', 'RESPONSE_TOO_LARGE'].includes(result.code ?? '')) {
          return reconcile(result.meta)
        }
        return setRemoteError(result)
      }
      const data = result.data
      const status = data && 'job_status' in data ? data.job_status : data?.status
      if (!data || data.job_id !== jobId || !status || !JOB_STATUSES.includes(status as typeof JOB_STATUSES[number])
        || (requiresReview ? data.status !== 'requested' || !('cancellation_id' in data) || !data.cancellation_id : status !== 'cancelled')) {
        return reconcile(result.meta)
      }
      if (!existing) return reconcile(result.meta)
      const cancelledByPolicy = status === 'cancelled'
      // Retire refreshes started before the authoritative command receipt.
      selectedJobReadRef.current += 1
      dispatch({
        type: 'hydrate_remote_job',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: status as typeof JOB_STATUSES[number],
          status: toLocalDealStatus(status as typeof JOB_STATUSES[number]),
          broadcast: existing.broadcast
            ? { ...existing.broadcast, status: cancelledByPolicy ? 'cancelled' : existing.broadcast.status,
                fullAddressVisible: cancelledByPolicy ? false : existing.broadcast.fullAddressVisible,
                fullAddressLabel: cancelledByPolicy ? null : existing.broadcast.fullAddressLabel,
                secondsRemaining: cancelledByPolicy ? 0 : existing.broadcast.secondsRemaining }
            : null,
        },
      })
      if (!cancelledByPolicy) await hydrateRemoteJobById(jobId, sessionAccessToken)
      return true
    })().catch(() => reconcile()).finally(() => {
      if (cancellationInFlightRef.current?.request === request) cancellationInFlightRef.current = null
    })
    cancellationInFlightRef.current = { jobId, current, request }
    return request
  }, [captureJobRead, dispatch, hydrateJobResult, hydrateRemoteJobById, language, role, sessionAccessToken, setRemoteError, stateRef])

  // On customer login/cold start, hydrate the active job once; polling keeps it
  // fresh while the deal remains active.
  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (!isAppForeground()) return
    void hydrateCustomerActiveJob()
    if (role === 'customer') void reconcilePendingConfirmations()
  }, [role, sessionUserId, hydrateCustomerActiveJob, reconcilePendingConfirmations])

  return {
    authorizeApartmentAccess,
    customerApartmentAccessState,
    cancelRemoteJob,
    confirmRemoteSearch,
    customerMatchingRetryFeedback,
    customerMatchingSelectionFeedback,
    customerMatchingSelectionState,
    createRemoteJobFromDraft,
    hydrateCustomerActiveJob,
    hydrateRemoteJobById,
    listFavoriteWorkersForMatching,
    reconcilePendingConfirmations,
    refreshCurrentJob,
    setMatchingPreference,
  }
}
