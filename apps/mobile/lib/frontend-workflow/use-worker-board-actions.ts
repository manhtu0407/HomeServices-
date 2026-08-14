import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react'
import {
  toLocalDealStatus,
  type LocalWorkflowAction,
  type LocalWorkflowState,
  type UserRole,
  type WorkerRegisterInput,
  type WorkerRegistrationDraftInput,
  type WorkerServiceAreaUpdateInput,
  type WorkerServicePreferencesUpdateInput,
} from '@nestscout/shared'
import type {
  EarningsResponse,
  WorkerJobListResponse,
  WorkerPayoutMethod,
  WorkerPayoutMethodSaveInput,
  WorkerPerformanceInsightsResponse,
  WorkerProfileResponse,
  WorkerWithdrawalRequest,
  WorkerWithdrawalRequestCreateInput,
} from '../api-types'
import { workerService } from '../services'
import { uploadWorkerAvatar, type WorkerAvatarDraft } from '../worker-avatar-upload'
import {
  sameWorkerEarnings,
  sameWorkerJobs,
  sameWorkerPayoutMethod,
  sameWorkerPerformanceInsights,
  sameWorkerProfile,
  sameWorkerWithdrawalRequests,
} from './comparisons'
import {
  currentWorkerYearRange,
  getRemoteJobId,
  hasStaleRemoteBroadcast,
  isAppForeground,
  isStaleBroadcastError,
  isWorkerCurrentJobStatus,
} from './helpers'

import { dealToSnapshot, workerBroadcastToSnapshot, workerJobToSnapshot } from './snapshots'

const WORKER_STARTUP_REFRESH_RETRY_DELAYS_MS = [1_000, 3_000] as const

type WorkerRemoteState = {
  earnings: EarningsResponse | null
  jobs: WorkerJobListResponse['jobs']
  jobsHydrated: boolean
  performanceInsights: WorkerPerformanceInsightsResponse | null
  payoutMethod: WorkerPayoutMethod | null
  profile: WorkerProfileResponse | null
  sessionUserId: string | null
  withdrawalRequests: WorkerWithdrawalRequest[]
}

const initialWorkerRemoteState: WorkerRemoteState = {
  earnings: null,
  jobs: [],
  jobsHydrated: false,
  performanceInsights: null,
  payoutMethod: null,
  profile: null,
  sessionUserId: null,
  withdrawalRequests: [],
}

type WorkerBoardActionsInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  refreshCurrentJob: () => Promise<boolean>
  role: UserRole | null
  sessionUserId: string | null
  setRemoteError: (error: string) => false
  stateRef: RefObject<LocalWorkflowState>
}

export function useWorkerBoardActions({
  dispatch,
  refreshCurrentJob,
  role,
  sessionUserId,
  setRemoteError,
  stateRef,
}: WorkerBoardActionsInput) {
  const workerAvailabilityPreferenceRef = useRef<{ sessionUserId: string | null; value: boolean } | null>(null)
  const workerRefreshRequestIdRef = useRef(0)
  const workerActivityHeartbeatBusyRef = useRef(false)
  const [workerRemoteState, setWorkerRemoteState] = useState<WorkerRemoteState>(initialWorkerRemoteState)
  const workerProfile = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.profile : null
  const workerEarnings = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.earnings : null
  const workerJobs = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.jobs : []
  const workerJobsHydrated = workerRemoteState.sessionUserId === sessionUserId && workerRemoteState.jobsHydrated
  const workerPerformanceInsights = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.performanceInsights : null
  const workerPayoutMethod = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.payoutMethod : null

  const workerWithdrawalRequests = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.withdrawalRequests : []
  const workerRefresh = useCallback(async () => {
    if (role !== 'worker' && role !== 'admin') return true
    const workerRefreshRequestId = workerRefreshRequestIdRef.current + 1
    workerRefreshRequestIdRef.current = workerRefreshRequestId
    const isCurrentWorkerRefresh = () => workerRefreshRequestIdRef.current === workerRefreshRequestId

    const profileRequest = workerService.getProfile()
    const earningsRequest = workerService.getEarnings(currentWorkerYearRange())
    const performanceInsightsRequest = workerService.getPerformanceInsights()
    const payoutMethodRequest = role === 'worker'
      ? workerService.getPayoutMethod()
      : Promise.resolve({ success: true as const, data: { payout_method: null } })
    const withdrawalRequestsRequest = role === 'worker'
      ? workerService.listWithdrawalRequests()
      : Promise.resolve({ success: true as const, data: { requests: [] } })
    const broadcastsRequest = workerService.getBroadcasts()
    const jobsRequest = workerService.getJobs()

    // Reconcile assigned work and offers together. An active assigned job is
    // authoritative and must never be replaced by an offer during refresh.
    const [broadcasts, jobs] = await Promise.all([broadcastsRequest, jobsRequest])
    if (!isCurrentWorkerRefresh()) return true
    const nextBroadcast = broadcasts.success ? broadcasts.data.broadcasts[0] : undefined
    let workflowError = broadcasts.success ? null : broadcasts.error
    if (jobs.success) {
      setWorkerRemoteState((current) => {
        const currentJobs = current.sessionUserId === sessionUserId ? current.jobs : []
        if (current.sessionUserId === sessionUserId && current.jobsHydrated && sameWorkerJobs(currentJobs, jobs.data.jobs)) return current
        return {
          earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
          jobs: jobs.data.jobs,
          jobsHydrated: true,
          performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
          payoutMethod: current.sessionUserId === sessionUserId ? current.payoutMethod : null,
          profile: current.sessionUserId === sessionUserId ? current.profile : null,
          sessionUserId,
          withdrawalRequests: current.sessionUserId === sessionUserId ? current.withdrawalRequests : [],
        }
      })
      const activeJob = jobs.data.jobs.find((job) => isWorkerCurrentJobStatus(job.status))
      const currentJobId = getRemoteJobId(stateRef.current)
      const currentJob = currentJobId ? jobs.data.jobs.find((job) => job.id === currentJobId) : undefined
      if (activeJob) {
        dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(activeJob), workerGate: 'remote_backend' })
      } else if (nextBroadcast) {
        dispatch({ type: 'hydrate_remote_broadcast', broadcast: workerBroadcastToSnapshot(nextBroadcast) })
      } else if (currentJob) {
        dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(currentJob), workerGate: 'remote_backend' })
      } else if (
        stateRef.current.workerGate === 'remote_backend'
        && stateRef.current.deal?.backendStatus === 'worker_candidate_pending'
      ) {
        dispatch({ type: 'reset_workflow' })
      } else if (hasStaleRemoteBroadcast(stateRef.current)) {
        dispatch({ type: 'mark_remote_broadcast_expired' })
      }
    } else {
      workflowError = jobs.error
    }

    // The post-I/O generation check prevents an older refresh from committing after a newer refresh starts.
    // react-doctor-disable-next-line react-doctor/async-defer-await
    const [profile, earnings, performanceInsights, payoutMethod, withdrawalRequests] = await Promise.all([
      profileRequest,
      earningsRequest,
      performanceInsightsRequest,
      payoutMethodRequest,
      withdrawalRequestsRequest,
    ])
    if (!isCurrentWorkerRefresh()) return true
    if (!profile.success) return setRemoteError(profile.error)

    const nextEarnings = earnings.success ? earnings.data : null
    const nextPerformanceInsights = performanceInsights.success ? performanceInsights.data : null
    const pendingAvailabilityPreference = workerAvailabilityPreferenceRef.current?.sessionUserId === sessionUserId
      ? workerAvailabilityPreferenceRef.current.value
      : null
    const refreshedProfile = pendingAvailabilityPreference === null || profile.data.is_available === pendingAvailabilityPreference
      ? profile.data
      : { ...profile.data, is_available: pendingAvailabilityPreference }
    if (pendingAvailabilityPreference !== null && profile.data.is_available === pendingAvailabilityPreference) {
      workerAvailabilityPreferenceRef.current = null
    }
    setWorkerRemoteState((current) => {
      const currentProfile = current.sessionUserId === sessionUserId ? current.profile : null
      const currentEarnings = current.sessionUserId === sessionUserId ? current.earnings : null
      const currentJobs = current.sessionUserId === sessionUserId ? current.jobs : []
      const currentPerformanceInsights = current.sessionUserId === sessionUserId ? current.performanceInsights : null
      const currentPayoutMethod = current.sessionUserId === sessionUserId ? current.payoutMethod : null
      const currentWithdrawalRequests = current.sessionUserId === sessionUserId ? current.withdrawalRequests : []
      const nextPayoutMethod = payoutMethod.success ? payoutMethod.data.payout_method : currentPayoutMethod
      const nextWithdrawalRequests = withdrawalRequests.success
        ? withdrawalRequests.data.requests
        : currentWithdrawalRequests
      const sameProfile = sameWorkerProfile(currentProfile, refreshedProfile)
      const sameEarnings = nextEarnings ? sameWorkerEarnings(currentEarnings, nextEarnings) : currentEarnings === null
      const samePerformanceInsights = nextPerformanceInsights
        ? sameWorkerPerformanceInsights(currentPerformanceInsights, nextPerformanceInsights)
        : currentPerformanceInsights === null
      const samePayoutMethod = sameWorkerPayoutMethod(currentPayoutMethod, nextPayoutMethod)
      const sameWithdrawalRequests = sameWorkerWithdrawalRequests(currentWithdrawalRequests, nextWithdrawalRequests)
      return current.sessionUserId === sessionUserId && sameProfile && sameEarnings && samePerformanceInsights && samePayoutMethod && sameWithdrawalRequests
        ? current
        : {
            earnings: nextEarnings,
            jobs: currentJobs,
            jobsHydrated: current.sessionUserId === sessionUserId ? current.jobsHydrated : false,
            performanceInsights: nextPerformanceInsights,
            payoutMethod: nextPayoutMethod,
            profile: refreshedProfile,
            sessionUserId,
            withdrawalRequests: nextWithdrawalRequests,
          }
    })
    if (!payoutMethod.success && !workflowError) workflowError = payoutMethod.error
    if (!withdrawalRequests.success && !workflowError) workflowError = withdrawalRequests.error
    if (workflowError) return setRemoteError(workflowError)
    return true
  }, [dispatch, role, sessionUserId, setRemoteError, stateRef])

  const workerUpdateAvailability = useCallback(async (
    isAvailable: boolean,
    options: { revalidate?: boolean } = {},
  ) => {
    const updated = await workerService.updateAvailability({ is_available: isAvailable })
    if (!updated.success) return setRemoteError(updated.error)
    workerAvailabilityPreferenceRef.current = { sessionUserId, value: updated.data.is_available }
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? { ...current, profile: { ...current.profile, is_available: updated.data.is_available } }
      : current)
    if (options.revalidate !== false) void workerRefresh().catch(() => undefined)
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUpdateServiceArea = useCallback(async (input: WorkerServiceAreaUpdateInput) => {
    const updated = await workerService.updateServiceArea(input)
    if (!updated.success) return setRemoteError(updated.error)
    setWorkerRemoteState((current) => ({
      earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
      jobs: current.sessionUserId === sessionUserId ? current.jobs : [],
      jobsHydrated: current.sessionUserId === sessionUserId ? current.jobsHydrated : false,
      performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
      payoutMethod: current.sessionUserId === sessionUserId ? current.payoutMethod : null,
      profile: updated.data,
      sessionUserId,
      withdrawalRequests: current.sessionUserId === sessionUserId ? current.withdrawalRequests : [],
    }))
    await workerRefresh()
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUpdateServicePreferences = useCallback(async (
    input: WorkerServicePreferencesUpdateInput,
  ) => {
    const updated = await workerService.updateServicePreferences(input)
    if (!updated.success) return setRemoteError(updated.error)
    setWorkerRemoteState((current) => ({
      earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
      jobs: current.sessionUserId === sessionUserId ? current.jobs : [],
      jobsHydrated: current.sessionUserId === sessionUserId ? current.jobsHydrated : false,
      performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
      payoutMethod: current.sessionUserId === sessionUserId ? current.payoutMethod : null,
      profile: updated.data,
      sessionUserId,
      withdrawalRequests: current.sessionUserId === sessionUserId ? current.withdrawalRequests : [],
    }))
    await workerRefresh()
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUploadAvatar = useCallback(async (input: WorkerAvatarDraft) => {
    const uploaded = await uploadWorkerAvatar(input)
    if (!uploaded.success) return setRemoteError(uploaded.error)
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? {
          ...current,
          profile: { ...current.profile, avatar_url: uploaded.data.avatar_url },
        }
      : current)
    return true
  }, [sessionUserId, setRemoteError])

  const workerSavePayoutMethod = useCallback(async (input: WorkerPayoutMethodSaveInput) => {
    const result = await workerService.savePayoutMethod(input)
    if (!result.success) {
      setRemoteError(result.error)
      return {
        success: false as const,
        code: result.code,
        error: result.error,
        status: result.status,
      }
    }
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const workerRequestWithdrawal = useCallback(async (input: WorkerWithdrawalRequestCreateInput) => {
    const result = await workerService.createWithdrawalRequest(input)
    if (!result.success) {
      setRemoteError(result.error)
      return {
        success: false as const,
        code: result.code,
        error: result.error,
        status: result.status,
      }
    }
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const workerAcceptBroadcast = useCallback(async (jobIdOverride?: string) => {
    const jobId = jobIdOverride ?? getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có lời mời việc để nhận')
    const accepted = await workerService.acceptBroadcast(jobId)
    if (!accepted.success) {
      if (isStaleBroadcastError(accepted.code)) dispatch({ type: 'mark_remote_broadcast_expired' })
      return setRemoteError(accepted.error)
    }

    const existing = stateRef.current.deal
    if (existing?.broadcast) {
      dispatch({
        type: 'hydrate_remote_job',
        workerGate: 'remote_backend',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: accepted.data.status,
          status: toLocalDealStatus(accepted.data.status),
          addressLabel: existing.broadcast.generalArea || existing.draft.districtLabel || existing.draft.addressLabel,
          broadcast: {
            ...existing.broadcast,
            status: 'accepted',
            fullAddressVisible: false,
            fullAddressLabel: null,
            addressAccess: null,
            safe_metadata: {
              ...existing.broadcast.safe_metadata,
              candidate_id: accepted.data.candidate_id,
              awaiting_customer_confirmation: accepted.data.awaiting_customer_confirmation,
              already_applied: accepted.data.already_applied,
            },
          },
        },
      })
    } else {
      await refreshCurrentJob()
    }
    return true
  }, [dispatch, refreshCurrentJob, setRemoteError, stateRef])

  const workerDeclineBroadcast = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có lời mời việc để từ chối')
    const declined = await workerService.declineBroadcast(jobId)
    if (!declined.success) {
      if (isStaleBroadcastError(declined.code)) dispatch({ type: 'mark_remote_broadcast_expired' })
      return setRemoteError(declined.error)
    }
    dispatch({ type: 'worker_decline_broadcast' })
    await workerRefresh()
    return true
  }, [dispatch, setRemoteError, stateRef, workerRefresh])

  const workerSubmitRegistration = useCallback(async (input: WorkerRegisterInput) => {
    const result = await workerService.register(input)
    if (!result.success) return setRemoteError(result.error)
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const workerSaveRegistrationDraft = useCallback(async (input: WorkerRegistrationDraftInput) => {
    const result = await workerService.saveRegistrationDraft(input)
    if (!result.success) return setRemoteError(result.error)
    return true
  }, [setRemoteError])

  useEffect(() => {
    if (!sessionUserId || role !== 'worker') return
    let cancelled = false
    let startupRetry: ReturnType<typeof setTimeout> | null = null

    const refreshWorkerStartupState = async (attempt: number) => {
      if (cancelled || !isAppForeground()) return
      const refreshed = await workerRefresh().catch(() => false)
      const retryDelay = WORKER_STARTUP_REFRESH_RETRY_DELAYS_MS[attempt]
      if (cancelled || refreshed || retryDelay === undefined) return

      // A restored session can briefly be unavailable to the API client.
      // Reconcile again before falling back to the regular 20-second poll.
      startupRetry = setTimeout(() => {
        void refreshWorkerStartupState(attempt + 1)
      }, retryDelay)
    }

    const initialRefresh = setTimeout(() => {
      void refreshWorkerStartupState(0)
    }, 0)
    const interval = setInterval(() => {
      if (isAppForeground()) void workerRefresh()
    }, 20_000)
    return () => {
      cancelled = true
      clearTimeout(initialRefresh)
      if (startupRetry) clearTimeout(startupRetry)
      clearInterval(interval)
    }
  }, [role, sessionUserId, workerRefresh])

  useEffect(() => {
    if (!sessionUserId || role !== 'worker') return
    let cancelled = false
    const interval = setInterval(() => {
      if (!isAppForeground() || workerActivityHeartbeatBusyRef.current) return
      workerActivityHeartbeatBusyRef.current = true
      void workerService.recordActiveMinute().then((result) => {
        if (cancelled || !result.success) return
        setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
          ? {
              ...current,
              profile: {
                ...current.profile,
                active_minutes: result.data.active_minutes,
                last_active_at: result.data.last_active_at,
              },
            }
          : current)
      }).finally(() => {
        workerActivityHeartbeatBusyRef.current = false
      })
    }, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [role, sessionUserId])

  return {
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerEarnings,
    workerJobs,
    workerJobsHydrated,
    workerPerformanceInsights,
    workerPayoutMethod,
    workerProfile,
    workerRefresh,
    workerRequestWithdrawal,
    workerSavePayoutMethod,
    workerSubmitRegistration,
    workerSaveRegistrationDraft,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerUpdateServicePreferences,
    workerUploadAvatar,
    workerWithdrawalRequests,
  }
}
