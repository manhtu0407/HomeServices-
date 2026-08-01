import { useCallback, useEffect, type Dispatch, type RefObject } from 'react'
import {
  extractKnownDistrictLabel,
  toLocalDealStatus,
  type JobCreateInput,
  type LocalDealDraft,
  type LocalWorkflowAction,
  type LocalWorkflowState,
  type UserRole,
} from '@nestscout/shared'
import type { ApiResult } from '../api'
import type { JobDetailResponse } from '../api-types'
import type { AppLanguage } from '../app-language'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '../client-request-id'
import {
  localizeMediaUploadFailure,
  uploadJobMediaDrafts,
  type LocalMediaUploadDraft,
} from '../media-upload'
import { jobService } from '../services'
import {
  defaultCustomerCancellationInput,
  getRemoteJobId,
  isAppForeground,
  jobCreateClientRequestFingerprint,
  usesBeforeAcceptCancelEndpoint,
} from './helpers'
import {
  confirmSearchToSnapshot,
  createJobResponseToSnapshot,
  dealToSnapshot,
  jobDetailToSnapshot,
} from './snapshots'

type CustomerJobActionsInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  language: AppLanguage
  pendingJobCreateClientRequestRef: RefObject<PendingClientRequestId | null>
  role: UserRole | null
  sessionUserId: string | null
  setRemoteError: (error: string) => false
  stateRef: RefObject<LocalWorkflowState>
}

export function useCustomerJobActions({
  dispatch,
  language,
  pendingJobCreateClientRequestRef,
  role,
  sessionUserId,
  setRemoteError,
  stateRef,
}: CustomerJobActionsInput) {
  const hydrateJobResult = useCallback((result: ApiResult<JobDetailResponse>) => {
    if (!result.success) return setRemoteError(result.error)
    dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(result.data, role === 'worker' || role === 'admin') })
    return true
  }, [dispatch, role, setRemoteError])

  // The caller can pass its own access token so a just-confirmed job hydrates
  // even when the shared client still holds a stale session.
  const hydrateRemoteJobById = useCallback(async (jobId: string, accessToken?: string) => {
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tải lại')
    return hydrateJobResult(await jobService.getJob(jobId, accessToken))
  }, [hydrateJobResult, setRemoteError])

  const refreshCurrentJob = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tải lại')
    return hydrateJobResult(await jobService.getJob(jobId))
  }, [hydrateJobResult, setRemoteError, stateRef])

  // Hydrate the active job from the backend so refresh/cold start keeps the
  // backend as source of truth without noisy "no active job" banners.
  const hydrateCustomerActiveJob = useCallback(async () => {
    if (getRemoteJobId(stateRef.current)) return true
    const result = await jobService.listMyActiveJob()
    if (!result.success) return false
    if (!result.data.active_job) return true
    // A direct route can hydrate while this bootstrap request is in flight.
    // Keep that newer, explicitly selected job instead of replacing it.
    if (getRemoteJobId(stateRef.current)) return true
    dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(result.data.active_job, false) })
    return true
  }, [dispatch, stateRef])

  const createRemoteJobFromDraft = useCallback(async (
    draftOverride?: LocalDealDraft,
    mediaItems: LocalMediaUploadDraft[] = [],
  ) => {
    const draft = draftOverride ?? stateRef.current.deal?.draft
    if (!draft?.serviceType) return setRemoteError('Chọn một trong sáu dịch vụ NestScout hỗ trợ trước khi tạo yêu cầu')
    if (draft.problemChips.length === 0) return setRemoteError('Chọn ít nhất một vấn đề cần xử lý')
    if (draft.description.trim().length < 10) return setRemoteError('Mô tả cần rõ hơn trước khi gửi yêu cầu')
    const districtLabel = extractKnownDistrictLabel(draft.districtLabel) || extractKnownDistrictLabel(draft.addressLabel)
    if (!districtLabel) return setRemoteError('Địa chỉ cần có quận TP.HCM rõ ràng')

    const requestFingerprint = jobCreateClientRequestFingerprint(draft, districtLabel)
    const input: JobCreateInput = {
      service_type: draft.serviceType,
      description: draft.description.trim(),
      problem_chips: draft.problemChips,
      photo_urls: [],
      address_building: draft.addressLabel.trim() || undefined,
      address_district: districtLabel,
      // Re-renders and retries reuse the same key so Edge returns the existing
      // job instead of creating duplicates.
      client_request_id: stableClientRequestId(
        pendingJobCreateClientRequestRef,
        requestFingerprint,
      ),
    }

    const created = await jobService.createJob(input)
    if (!created.success) {
      setRemoteError(created.error)
      return null
    }
    clearStableClientRequestId(pendingJobCreateClientRequestRef, requestFingerprint)
    dispatch({ type: 'hydrate_remote_job', job: createJobResponseToSnapshot(created.data, draft) })
    if (mediaItems.length === 0) return { jobId: created.data.job_id }

    const uploaded = await uploadJobMediaDrafts(created.data.job_id, mediaItems, 'before')
    if (!uploaded.success) {
      const mediaError = localizeMediaUploadFailure(uploaded, language)
      dispatch({ type: 'set_workflow_error', error: mediaError })
      return { jobId: created.data.job_id, mediaError }
    }
    const refreshed = await jobService.getJob(created.data.job_id)
    if (refreshed.success) {
      dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(refreshed.data, false) })
    }
    return { jobId: created.data.job_id }
  }, [dispatch, language, pendingJobCreateClientRequestRef, setRemoteError, stateRef])

  const confirmRemoteSearch = useCallback(async (jobIdOverride?: string) => {
    const jobId = jobIdOverride ?? getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tìm thợ')
    const confirmed = await jobService.confirmSearch(jobId)
    if (!confirmed.success) return setRemoteError(confirmed.error)

    const existing = stateRef.current.deal
    if (existing) {
      dispatch({
        type: 'hydrate_remote_job',
        job: confirmSearchToSnapshot(confirmed.data, existing),
      })
    }
    if (confirmed.data.broadcast_sent) {
      const refreshed = await jobService.getJob(jobId)
      if (refreshed.success) {
        dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(refreshed.data, false) })
      }
    }
    return true
  }, [dispatch, setRemoteError, stateRef])

  const cancelRemoteJob = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) {
      dispatch({ type: 'cancel_deal' })
      return true
    }
    const existing = stateRef.current.deal
    if (existing && !usesBeforeAcceptCancelEndpoint(existing.status)) {
      const requested = await jobService.requestCustomerCancellation(jobId, defaultCustomerCancellationInput(language))
      if (!requested.success) return setRemoteError(requested.error)
      const cancelledByPolicy = requested.data.job_status === 'cancelled'
      dispatch({
        type: 'hydrate_remote_job',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: requested.data.job_status,
          status: toLocalDealStatus(requested.data.job_status),
          broadcast: existing.broadcast
            ? {
                ...existing.broadcast,
                status: cancelledByPolicy ? 'cancelled' : existing.broadcast.status,
                fullAddressVisible: cancelledByPolicy ? false : existing.broadcast.fullAddressVisible,
                fullAddressLabel: cancelledByPolicy ? null : existing.broadcast.fullAddressLabel,
                secondsRemaining: cancelledByPolicy ? 0 : existing.broadcast.secondsRemaining,
              }
            : null,
        },
      })
      await refreshCurrentJob()
      return true
    }
    const cancelled = await jobService.cancelJob(jobId)
    if (!cancelled.success) return setRemoteError(cancelled.error)
    if (existing) {
      dispatch({
        type: 'hydrate_remote_job',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: cancelled.data.status,
          status: toLocalDealStatus(cancelled.data.status),
          broadcast: existing.broadcast
            ? { ...existing.broadcast, status: 'cancelled', fullAddressVisible: false, fullAddressLabel: null }
            : null,
        },
      })
    }
    return true
  }, [dispatch, language, refreshCurrentJob, setRemoteError, stateRef])

  // On customer login/cold start, hydrate the active job once; polling keeps it
  // fresh while the deal remains active.
  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (isAppForeground()) void hydrateCustomerActiveJob()
  }, [role, sessionUserId, hydrateCustomerActiveJob])

  return {
    cancelRemoteJob,
    confirmRemoteSearch,
    createRemoteJobFromDraft,
    hydrateCustomerActiveJob,
    hydrateRemoteJobById,
    refreshCurrentJob,
  }
}
